import { memberDisplayName } from "@congtrade/shared/memberDisplay";
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

function verb(type: string): string {
  const t = type.toUpperCase();
  return t.startsWith("P") ? "bought" : t.startsWith("S") ? "sold" : "exchanged";
}

function asset(row: AlertTradeRow): string {
  if (row.ticker?.trim()) return row.ticker.trim();
  return row.asset_name.length > 40 ? `${row.asset_name.slice(0, 37)}…` : row.asset_name;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function amount(row: AlertTradeRow): string | null {
  if (row.amount_low && row.amount_high) return `${money(row.amount_low)}–${money(row.amount_high)}`;
  if (row.amount_low) return `${money(row.amount_low)}+`;
  return row.amount_range;
}

/**
 * One notification for one alert's new matches. A single trade is named
 * outright, as the email subject does; several are counted, with the first
 * few spelled out underneath.
 */
export function pushMessageFor(alert: { id: string; name: string }, matches: AlertTradeRow[]): PushMessage {
  const data = { type: "alert" as const, alertId: alert.id };
  if (matches.length === 1) {
    const row = matches[0];
    return {
      title: `${memberDisplayName(row)} ${verb(row.transaction_type)} ${asset(row)}`,
      body: [amount(row), row.company_name && row.ticker ? row.company_name : null, alert.name]
        .filter(Boolean)
        .join(" · "),
      data,
    };
  }
  const lines = matches
    .slice(0, 3)
    .map((row) => `${memberDisplayName(row)} ${verb(row.transaction_type)} ${asset(row)}`);
  const more = matches.length - lines.length;
  return {
    title: `${alert.name}: ${matches.length} new trades`,
    body: lines.join(", ") + (more > 0 ? `, and ${more} more` : ""),
    data,
  };
}
