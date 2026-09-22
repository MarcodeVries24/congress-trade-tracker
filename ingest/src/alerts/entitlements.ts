import { sql } from "../db/index.js";

/**
 * Does this account still hold CongTrade Pro?
 *
 * The alert sender runs in GitHub Actions, outside any request, so it can't
 * use Clerk's `has({ feature })` — that reads session claims. It asks Clerk's
 * Backend API directly instead, over plain fetch (no SDK), the same way every
 * other external API in this project is called.
 *
 * ## Why the obvious check doesn't work
 *
 * Clerk Billing puts *everyone* on a subscription, including free users: the
 * default `free_user` plan. Asking "is their subscription active?" returns
 * true for every visitor who ever signed up, forever — verified against the
 * live instance, where a free account's subscription reads
 * `status: "active"`. Entitlement lives one level down, in the features the
 * subscribed *plan* grants, which is exactly what `has({ feature })` reads on
 * the web side.
 *
 * ## Failing open, on purpose
 *
 * Every uncertain outcome grants access: no API key configured, a network
 * error, an unexpected response shape, Clerk being down. The two failure modes
 * are not symmetric — one lapsed subscriber getting an extra email is a
 * rounding error, while silently cutting off paying subscribers because our
 * own call failed is the kind of bug people cancel over. Errors are recorded
 * so they surface in the daily report rather than passing unnoticed.
 */

const CLERK_API = "https://api.clerk.com/v1";
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

/**
 * Feature slugs on the paid plan. Must stay in step with PRO_FEATURES in
 * web/lib/access.ts, which answers the same question from inside a request.
 * (As configured today, `pro_congtrade` grants notifications + filters +
 * no_ads, and `free_user` grants nothing.)
 */
const PRO_FEATURE_SLUGS = new Set(["notifications", "filters"]);

/**
 * A subscription item in these states still counts as paid-up. `past_due`
 * is deliberately included: a declined renewal is usually one retry from
 * succeeding, and cutting someone's alerts the moment a card expires punishes
 * a customer who hasn't gone anywhere.
 */
const ENTITLED_ITEM_STATUSES = new Set(["active", "past_due"]);

/** How long a successful answer is trusted before Clerk is asked again. */
const CACHE_TTL_HOURS = 12;

export type EntitlementVerdict =
  /** Confirmed (or comped): send. */
  | { status: "entitled"; planSlug: string | null; source: string }
  /** Confirmed no longer paying: stop sending, and say why. */
  | { status: "lapsed"; planSlug: string | null }
  /** Couldn't find out. Send anyway — see "Failing open" above. */
  | { status: "unknown"; reason: string };

interface ClerkPlan {
  slug?: string;
  features?: { slug?: string }[];
}
interface ClerkSubscriptionItem {
  status?: string;
  plan?: ClerkPlan | null;
}
interface ClerkSubscription {
  subscription_items?: ClerkSubscriptionItem[];
}

async function clerkGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${CLERK_API}${path}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) return { ok: false, status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) };
  return { ok: true, data: (await res.json()) as T };
}

/** The paid plan whose features this account currently holds, if any. */
function entitlingPlan(subscription: ClerkSubscription): ClerkPlan | null {
  for (const item of subscription.subscription_items ?? []) {
    if (!ENTITLED_ITEM_STATUSES.has(item.status ?? "")) continue;
    const granted = item.plan?.features ?? [];
    if (granted.some((f) => f.slug && PRO_FEATURE_SLUGS.has(f.slug))) return item.plan ?? null;
  }
  return null;
}

/**
 * One account's raw answer from Clerk, before the instance-sanity rule below
 * decides what a 404 actually means.
 */
type Probe =
  | { kind: "entitled"; planSlug: string | null; source: string }
  /** The account exists and simply holds nothing paid. */
  | { kind: "no-plan" }
  /** This Clerk instance has never heard of the account. */
  | { kind: "missing" }
  | { kind: "error"; reason: string };

async function probeClerk(userId: string): Promise<Probe> {
  // Comp access first: an account comped with {"admin": true} in public
  // metadata has no paid subscription at all, and mirroring web/lib/access.ts
  // here is what stops the operator's own alerts being switched off.
  const user = await clerkGet<{ public_metadata?: { admin?: boolean } }>(`/users/${encodeURIComponent(userId)}`);
  if (!user.ok) {
    if (user.status === 404) return { kind: "missing" };
    return { kind: "error", reason: `GET /users: ${user.status} ${user.body}` };
  }
  if (user.data.public_metadata?.admin === true) return { kind: "entitled", planSlug: null, source: "admin" };

  const subscription = await clerkGet<ClerkSubscription>(`/users/${encodeURIComponent(userId)}/billing/subscription`);
  if (!subscription.ok) {
    // The account exists, so no subscription record just means nothing paid.
    if (subscription.status === 404) return { kind: "no-plan" };
    return { kind: "error", reason: `GET /billing/subscription: ${subscription.status} ${subscription.body}` };
  }

  const plan = entitlingPlan(subscription.data);
  return plan ? { kind: "entitled", planSlug: plan.slug ?? null, source: "billing" } : { kind: "no-plan" };
}

async function readCache(userIds: string[]) {
  const rows = (await sql.query(
    `SELECT user_id, is_pro, plan_slug, source, checked_at
     FROM user_entitlements
     WHERE user_id = ANY($1) AND checked_at IS NOT NULL AND checked_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'`,
    [userIds]
  )) as { user_id: string; is_pro: boolean; plan_slug: string | null; source: string | null; checked_at: string }[];
  return new Map(rows.map((r) => [r.user_id, r]));
}

async function writeVerdict(userId: string, verdict: EntitlementVerdict): Promise<void> {
  if (verdict.status === "unknown") {
    // checked_at is deliberately left alone so the next run retries rather
    // than treating a failure as a cached answer. is_pro defaults to TRUE for
    // a brand-new row, which is the fail-open default.
    await sql.query(
      `INSERT INTO user_entitlements (user_id, last_error, last_error_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET last_error = EXCLUDED.last_error, last_error_at = NOW(), updated_at = NOW()`,
      [userId, verdict.reason]
    );
    return;
  }
  await sql.query(
    `INSERT INTO user_entitlements (user_id, is_pro, plan_slug, source, checked_at, last_error, last_error_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NULL, NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       is_pro = EXCLUDED.is_pro, plan_slug = EXCLUDED.plan_slug, source = EXCLUDED.source,
       checked_at = NOW(), last_error = NULL, last_error_at = NULL, updated_at = NOW()`,
    [
      userId,
      verdict.status === "entitled",
      verdict.status === "entitled" ? verdict.planSlug : null,
      verdict.status === "entitled" ? verdict.source : "billing",
    ]
  );
}

/**
 * Resolves every user in one go, reusing recent cached answers and asking
 * Clerk only for the rest. Returns a verdict for every id passed in.
 */
export async function resolveEntitlements(userIds: string[]): Promise<Map<string, EntitlementVerdict>> {
  const unique = [...new Set(userIds)];
  const verdicts = new Map<string, EntitlementVerdict>();
  if (unique.length === 0) return verdicts;

  if (!CLERK_SECRET_KEY) {
    // Nothing to ask with. Same stance as everywhere else here: don't guess,
    // don't cut anyone off, and say so once.
    console.log("CLERK_SECRET_KEY is not set — subscription status can't be checked, so every alert is treated as entitled.");
    for (const id of unique) verdicts.set(id, { status: "unknown", reason: "CLERK_SECRET_KEY not set" });
    return verdicts;
  }

  const cached = await readCache(unique);
  const probes = new Map<string, Probe>();
  /**
   * Proof that this key really does belong to the Clerk instance the site
   * runs on: at least one account was found. See the 404 rule below.
   */
  let instanceConfirmed = false;

  for (const id of unique) {
    const hit = cached.get(id);
    if (hit) {
      verdicts.set(
        id,
        hit.is_pro
          ? { status: "entitled", planSlug: hit.plan_slug, source: `${hit.source ?? "cache"} (cached)` }
          : { status: "lapsed", planSlug: hit.plan_slug }
      );
      // A cached answer was itself derived from a successful lookup.
      instanceConfirmed = true;
      continue;
    }
    let probe: Probe;
    try {
      probe = await probeClerk(id);
    } catch (err) {
      probe = { kind: "error", reason: (err as Error).message };
    }
    if (probe.kind === "entitled" || probe.kind === "no-plan") instanceConfirmed = true;
    probes.set(id, probe);
  }

  for (const [id, probe] of probes) {
    let verdict: EntitlementVerdict;
    if (probe.kind === "entitled") {
      verdict = { status: "entitled", planSlug: probe.planSlug, source: probe.source };
    } else if (probe.kind === "no-plan") {
      verdict = { status: "lapsed", planSlug: null };
    } else if (probe.kind === "error") {
      verdict = { status: "unknown", reason: probe.reason };
    } else if (instanceConfirmed) {
      // Some other account in this same run *was* found, so the key is
      // pointed at the right instance and this one really is gone.
      verdict = { status: "lapsed", planSlug: null };
    } else {
      // Nobody at all was found. Far more likely than every subscriber
      // deleting their account at once: CLERK_SECRET_KEY belongs to a
      // different Clerk instance than the site runs on — a development key
      // where a production one is needed, say, in which case every real
      // user id looks like a stranger. Acting on that would pause every
      // paying subscriber's alerts in one run, so it doesn't.
      verdict = {
        status: "unknown",
        reason:
          "no account in this run exists in the Clerk instance CLERK_SECRET_KEY points at — " +
          "check it matches the instance the site signs users in with (test vs. live key)",
      };
    }
    await writeVerdict(id, verdict);
    verdicts.set(id, verdict);
  }
  return verdicts;
}

/** Count of accounts whose last entitlement lookup failed — surfaced in the daily report. */
export async function countEntitlementErrors(): Promise<number> {
  const rows = (await sql.query(
    `SELECT COUNT(*)::int AS count FROM user_entitlements
     WHERE last_error IS NOT NULL AND last_error_at > NOW() - INTERVAL '2 days'`
  )) as { count: number }[];
  return rows[0]?.count ?? 0;
}
