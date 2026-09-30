import { memberDisplayName, memberDisplayNameFromFiledName } from "@congtrade/shared/memberDisplay";

/**
 * Display helpers the app needs and the website does not.
 *
 * Anything both have to agree on lives in @congtrade/shared instead. The name
 * resolution in particular: this file used to carry its own honorific strip and
 * title-caser, which got "Richard Blumenthal" right and would have got "Ro
 * Khanna" wrong, because the curated per-bioguide names were not reachable.
 */
export { memberDisplayName, memberDisplayNameFromFiledName };

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

/** 432267815 -> "$432M". Volumes are estimates from bracket midpoints, so precision would be false. */
export function compactUSD(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1_000_000_000_000) return `$${(n / 1_000_000_000_000).toFixed(1).replace(/\.0$/, "")}T`;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** "Democrat" -> "D". The colour carries the rest. */
export function partyLetter(party: string | null): string {
  if (!party) return "";
  return party.trim().charAt(0).toUpperCase();
}

/** An ISO timestamp as "3h ago" / "2d ago", for news, where recency is the point. */
export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "Bought" / "Sold" / "Sold part of" / "Exchanged", for sentences like "Bought Apple (AAPL)". */
export function tradeVerb(code: string): string {
  if (code.startsWith("P")) return "Bought";
  if (/^S.*partial/i.test(code)) return "Sold part of";
  if (code.startsWith("S")) return "Sold";
  if (code.startsWith("E")) return "Exchanged";
  return code;
}

/**
 * The asset as a person would say it. Filings carry "Apple Inc. - Common Stock
 * (AAPL) [ST]"; a sentence wants "Apple". The company name from the market cap
 * table is preferred when there is one, and the filed text is trimmed of its
 * share class, ticker and type code otherwise.
 */
export function assetLabel(row: { asset_name: string; ticker?: string | null; company_name?: string | null }): string {
  const base =
    row.company_name ??
    row.asset_name
      .replace(/\s*\[[A-Z]{2,4}\]\s*$/, "")
      .replace(/\s*\([A-Z.]{1,6}\)\s*/g, " ")
      .replace(/\s+-\s+(Class [A-Z] )?(Common|Ordinary|Preferred)( Stock| Shares)?.*$/i, "")
      .replace(/\s+(Common Stock|Ordinary Shares)$/i, "")
      .trim();
  const cleaned = base.replace(/,?\s+(Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?|plc|N\.V\.|S\.A\.)$/i, "").trim();
  return cleaned || row.asset_name;
}

/** A filing date as "Today", "Yesterday", "3d ago", "2w ago", or a date past a couple of months. */
export function filedAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return "";
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return shortDate(iso.slice(0, 10));
}

/** "$1,001 - $15,000" -> "$1,001 – $15,000", with the en dash a range deserves. */
export function amountLabel(range: string | null): string {
  if (!range) return "Amount undisclosed";
  return range.replace(/\s*-\s*/g, " – ");
}

/** The pill tone for a trade: green for a purchase, red for a sale. */
export function tradeTone(code: string): "gain" | "loss" | "warn" {
  if (code.startsWith("P")) return "gain";
  if (code.startsWith("S")) return "loss";
  return "warn";
}

/** "Bought" / "Sold" / "Partial" / "Exchange" as a short pill label. */
export function tradePill(code: string): string {
  if (code.startsWith("P")) return "Bought";
  if (/^S.*partial/i.test(code)) return "Sold part";
  if (code.startsWith("S")) return "Sold";
  if (code.startsWith("E")) return "Exchange";
  return code;
}

/** "James Conley Justice, II" -> "Justice": the surname, for a label under a face. */
export function surname(name: string): string {
  const words = name
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(jr|sr|ii|iii|iv|v|md|phd)\.?$/i.test(w));
  return words[words.length - 1] ?? name;
}
