/**
 * Display helpers.
 *
 * These are a deliberate interim copy of the website's, narrowed to what a
 * trade card needs. The real versions live in web/lib and carry a curated
 * name-per-bioguide map that this cannot reach yet; when the shared workspace
 * package lands, this file is deleted rather than kept in step by hand.
 */

/** Strips the filing honorific, the way every surface on the site does. */
export function displayName(name: string): string {
  return name.replace(/^Hon\.\s+/, "").trim();
}

/**
 * Title-cases a name that is filed entirely in capitals.
 *
 * Only when the name carries no case information at all, so "McConnell" and
 * "DelBene" are never touched. Blumenthal's scanned filings are the reason
 * this exists.
 */
export function titleCaseIfShouted(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`);
}

export function memberName(row: { member_name: string }): string {
  return titleCaseIfShouted(displayName(row.member_name));
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
