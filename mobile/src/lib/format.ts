import { memberDisplayName } from '@congtrade/shared/memberDisplay';

/**
 * Display helpers the app needs and the website does not.
 *
 * Anything both have to agree on lives in @congtrade/shared instead. The name
 * resolution in particular: this file used to carry its own honorific strip and
 * title-caser, which got "Richard Blumenthal" right and would have got "Ro
 * Khanna" wrong, because the curated per-bioguide names were not reachable.
 */
export { memberDisplayName };

/** The name for a trade row, resolved the same way every other surface does. */
export function memberName(row: { member_name: string; bioguide_id?: string | null }): string {
  return memberDisplayName(row);
}

/** "Purchase" | "Sale" | "Sale (partial)" | "Exchange", from the stored code. */
export function transactionLabel(code: string): string {
  const known: Record<string, string> = {
    P: "Purchase",
    S: "Sale",
    "S (partial)": "Sale (partial)",
    "S (Partial)": "Sale (partial)",
    E: "Exchange",
  };
  return known[code] ?? code;
}

export type TradeTone = "buy" | "sell" | "neutral";

export function transactionTone(code: string): TradeTone {
  if (code.startsWith("P")) return "buy";
  if (code.startsWith("S")) return "sell";
  return "neutral";
}

/** "$1,001 - $15,000" -> "$1K–$15K", which is what fits on a phone. */
export function compactAmount(range: string | null): string {
  if (!range) return "Undisclosed";
  const compact = (n: number) =>
    n >= 1_000_000 ? `$${n / 1_000_000}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`;
  const pair = range.match(/\$([\d,]+)\s*-\s*\$([\d,]+)/);
  if (pair) {
    const low = Number(pair[1].replace(/,/g, ""));
    const high = Number(pair[2].replace(/,/g, ""));
    return `${compact(low)}–${compact(high)}`;
  }
  return range;
}

/** "2026-08-05" -> "5 Aug 2026". Null dates are common and are not an error. */
export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Democrat blue, Republican red, anything else grey. */
export function partyColor(party: string | null): string {
  if (!party) return "#8a95a1";
  const p = party.toLowerCase();
  if (p.startsWith("d")) return "#3b7ddd";
  if (p.startsWith("r")) return "#d6455d";
  return "#8a95a1";
}
