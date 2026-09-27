import { sql } from "../db/index.js";
import { grantsAccess, type SubscriptionRow } from "../../../web/lib/subscriptionAccess";

const CLERK_API = "https://api.clerk.com/v1";
/** Only used to see whether an account is comped; the plan itself is local. */
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

/** How long a successful answer is trusted before it is looked up again. */
const CACHE_TTL_HOURS = 12;

export type EntitlementVerdict =
  /** Confirmed (or comped): send. */
  | { status: "entitled"; planSlug: string | null; source: string }
  /** Confirmed no longer paying: stop sending, and say why. */
  | { status: "lapsed"; planSlug: string | null }
  /** Couldn't find out. Send anyway — see "Failing open" above. */
  | { status: "unknown"; reason: string };

async function clerkGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${CLERK_API}${path}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) return { ok: false, status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) };
  return { ok: true, data: (await res.json()) as T };
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

/** Whether our own subscriptions table grants this user access. */
async function readSubscription(userId: string): Promise<SubscriptionRow | null> {
  const rows = (await sql.query(
    `SELECT clerk_user_id, stripe_customer_id, stripe_subscription_id, status, price_id,
            current_period_end, cancel_at_period_end
     FROM subscriptions WHERE clerk_user_id = $1`,
    [userId]
  )) as SubscriptionRow[];
  return rows[0] ?? null;
}

async function probeClerk(userId: string): Promise<Probe> {
  // The local table first, because it answers for every paying subscriber
  // without leaving the process. Stripe's webhook keeps it current; the same
  // rule decides access here and in the browser (web/lib/subscriptionAccess).
  const row = await readSubscription(userId);
  if (grantsAccess(row)) return { kind: "entitled", planSlug: row?.price_id ?? null, source: "stripe" };

  // Only accounts with nothing paid reach Clerk, and only to see whether they
  // are comped with {"admin": true} — the operator's own alerts must not be
  // switched off for never having paid.
  const user = await clerkGet<{ public_metadata?: { admin?: boolean } }>(`/users/${encodeURIComponent(userId)}`);
  if (!user.ok) {
    if (user.status === 404) return { kind: "missing" };
    return { kind: "error", reason: `GET /users: ${user.status} ${user.body}` };
  }
  if (user.data.public_metadata?.admin === true) return { kind: "entitled", planSlug: null, source: "admin" };

  return { kind: "no-plan" };
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
