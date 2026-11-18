import type { AlertTradeRow } from "../../../web/lib/alertFilters";

/**
 * The words of an alert's push notification. Kept apart from push.ts, which
 * talks to the database and to Expo, so it can be tested on its own.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Read by the app when the notification is tapped; see mobile/src/lib/push.tsx. */
  data: { type: "alert"; alertId: string };
}

/**
 * One notification for one alert's new matches, the same shape however many
 * there are: "New Trades" over "3 new trades for alert “Big buys”". It names
 * no trade: tapping it opens the alert's sent trades in the app, grouped by
 * notification (mobile/src/app/alert-trades/[id].tsx), where this batch is at
 * the top. The count is every new match, the ones an email only counts too.
 */
export function pushMessageFor(alert: { id: string; name: string }, matches: AlertTradeRow[]): PushMessage {
  const n = matches.length;
  return {
    title: n === 1 ? "New Trade" : "New Trades",
    body: `${n} new ${n === 1 ? "trade" : "trades"} for alert “${alert.name}”`,
    data: { type: "alert", alertId: alert.id },
  };
}
