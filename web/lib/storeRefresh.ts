import { sql } from "@/lib/db";
import { appleApiConfigured, describeAppleError, subscriptionStatusFor } from "@/lib/appleStore";
import { acknowledgeIfPending, fetchSubscriptionState, googleApiConfigured } from "@/lib/googleStore";
import { PAYING_STATUSES, type SubscriptionRow } from "@/lib/subscriptionAccess";
import { upsertSubscription } from "@/lib/subscriptionWrite";

/**
 * The safety net under the store notifications.
 *
 * An App Store or Google Play row only changes when the store tells us, and
 * the store tells us through a notification (Apple's webhook, Google's
 * Pub/Sub push). One that is lost (a misconfigured topic, an outage, a
 * redelivery that gave up) leaves the row saying "active" for ever, and a
 * cancelled subscriber keeps Pro. It happened: Play's notifications went to a
 * topic with no subscription until 17 November 2026.
 *
 * So a row that still says it is paid for, but whose paid period has run
 * out, is not believed. The store is asked directly, the same question the
 * app's purchase report asks, and the row is rewritten from the answer: an
 * ended subscription ends, a renewal that was never announced moves the date
 * on. A row whose period has not run out is never asked about, so this costs
 * nothing for anyone whose notifications arrive.
 *
 * A failed lookup keeps the row as it is. Someone who is paying should not
 * lose Pro because Apple or Google had a bad minute; the next read asks again.
 */

/** How often one row may be looked up, so a store outage is not a call per request. */
const RETRY_MINUTES = 10;

export function isLapsed(row: SubscriptionRow, now = Date.now()): boolean {
  return (
    (row.provider === "apple" || row.provider === "google") &&
    PAYING_STATUSES.has(row.status) &&
    Boolean(row.provider_account_id) &&
    row.current_period_end !== null &&
    new Date(row.current_period_end).getTime() < now
  );
}

/**
 * Claims the lookup for one row, at most once per RETRY_MINUTES. The update
 * is the lock: two requests for the same person cannot both ask the store.
 */
async function claimLookup(row: SubscriptionRow): Promise<boolean> {
  const claimed = (await sql.query(
    `UPDATE subscriptions SET updated_at = NOW()
     WHERE clerk_user_id = $1 AND provider = $2
       AND updated_at < NOW() - ($3 || ' minutes')::interval
     RETURNING clerk_user_id`,
    [row.clerk_user_id, row.provider, String(RETRY_MINUTES)]
  )) as unknown[];
  return claimed.length > 0;
}

async function refreshGoogle(row: SubscriptionRow): Promise<void> {
  if (!googleApiConfigured()) return;
  const state = await fetchSubscriptionState(row.provider_account_id!);
  await upsertSubscription({
    clerkUserId: row.clerk_user_id,
    provider: "google",
    providerAccountId: row.provider_account_id,
    providerSubscriptionId: state.linkedPurchaseToken ?? row.provider_subscription_id,
    status: state.status,
    productId: state.productId ?? row.product_id,
    currentPeriodEnd: state.expiryTimeMillis ? new Date(state.expiryTimeMillis) : null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  });
  await acknowledgeIfPending(row.provider_account_id!, state);
}

async function refreshApple(row: SubscriptionRow): Promise<void> {
  if (!appleApiConfigured()) return;
  const result = await subscriptionStatusFor(row.provider_account_id!);
  // Apple knows nothing of it any more: nothing to go on, so nothing changes.
  if (!result) return;
  const { status, transaction } = result;
  await upsertSubscription({
    clerkUserId: row.clerk_user_id,
    provider: "apple",
    providerAccountId: row.provider_account_id,
    providerSubscriptionId: transaction.transactionId ?? row.provider_subscription_id,
    status,
    productId: transaction.productId ?? row.product_id,
    currentPeriodEnd: transaction.expiresDate ? new Date(transaction.expiresDate) : null,
    cancelAtPeriodEnd: status === "canceled",
  });
}

/** Asks the store about one lapsed row. Returns whether the row was rewritten. */
async function refreshRow(row: SubscriptionRow): Promise<boolean> {
  if (!(await claimLookup(row))) return false;
  try {
    if (row.provider === "google") await refreshGoogle(row);
    else await refreshApple(row);
    console.info("[store-refresh] re-read a lapsed subscription", {
      provider: row.provider,
      userId: row.clerk_user_id,
    });
    return true;
  } catch (err) {
    console.error("[store-refresh] could not ask the store", {
      provider: row.provider,
      userId: row.clerk_user_id,
      message: row.provider === "apple" ? describeAppleError(err) : err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * One person's rows, with any lapsed store row checked with the store first.
 * `reread` fetches the rows again after a rewrite.
 */
export async function withLapsedStoreRowsRefreshed(
  rows: SubscriptionRow[],
  reread: () => Promise<SubscriptionRow[]>
): Promise<SubscriptionRow[]> {
  const lapsed = rows.filter((row) => isLapsed(row));
  if (lapsed.length === 0) return rows;
  const changed = await Promise.all(lapsed.map(refreshRow));
  return changed.some(Boolean) ? reread() : rows;
}

/**
 * Every lapsed store row, for the daily sweep: catches the people who do not
 * open the app or the site, whose rows the alert sender would otherwise go on
 * reading as paid for.
 */
export async function refreshAllLapsedStoreRows(limit = 100): Promise<{ checked: number; rewritten: number }> {
  const rows = (await sql.query(
    `SELECT clerk_user_id, provider, provider_account_id, provider_subscription_id,
            status, product_id, current_period_end, cancel_at_period_end
     FROM subscriptions
     WHERE provider IN ('apple', 'google')
       AND status = ANY($1)
       AND current_period_end < NOW()
     ORDER BY current_period_end
     LIMIT $2`,
    [[...PAYING_STATUSES], limit]
  )) as SubscriptionRow[];
  let rewritten = 0;
  for (const row of rows) if (isLapsed(row) && (await refreshRow(row))) rewritten++;
  return { checked: rows.length, rewritten };
}
