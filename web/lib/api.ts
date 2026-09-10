export interface Trade {
  id: number;
  doc_id: string;
  member_name: string;
  state_district: string | null;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
  owner: string | null;
  transaction_type: string;
  transaction_date: string | null;
  notification_date: string | null;
  amount_range: string;
  amount_low: number | null;
  amount_high: number | null;
  filing_date: string | null;
  days_to_file: number | null;
  pdf_url: string;
  photo_url: string | null;
  party: string | null;
  chamber: "house" | "senate";
  member_state: string | null;
  parse_status: string;
}

export interface TradesResponse {
  data: Trade[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Stats {
  totalTransactions: number;
  totalFilings: number;
  totalMembers: number;
  estimatedVolume: number;
  topTickers: { ticker: string; count: number }[];
  lastIngestedAt: string | null;
  lastCheckedAt: string | null;
  failedFilings: number;
}

export interface TradeFilters {
  chamber?: string[];
  q?: string;
  member?: string;
  ticker?: string;
  type?: string;
  owner?: string;
  assetType?: string;
  amountRanges?: string[];
  filedStatus?: "late" | "onTime";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

// STOCK Act disclosure bands, in the exact strings the parser stores them as.
export const AMOUNT_RANGES = [
  "$1,001 - $15,000",
  "$15,001 - $50,000",
  "$50,001 - $100,000",
  "$100,001 - $250,000",
  "$250,001 - $500,000",
  "$500,001 - $1,000,000",
  "$1,000,001 - $5,000,000",
  "$5,000,001 - $25,000,000",
  "$25,000,001 - $50,000,000",
];

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export const OWNER_LABELS: Record<string, string> = {
  self: "Self",
  JT: "Joint",
  SP: "Spouse",
  DC: "Dependent Child",
};

// Reference: https://fd.house.gov/reference/asset-type-codes.aspx
export const ASSET_TYPE_LABELS: Record<string, string> = {
  ST: "Stock",
  OP: "Option",
  OT: "Other Securities",
  GS: "Government Security",
  CS: "Corporate Security",
  CT: "Cryptocurrency",
  PS: "Preferred Stock",
  RS: "Restricted Stock Unit",
  AB: "Asset-Backed Security",
  OI: "Other Investment Fund",
  HN: "Hedge Fund",
  OL: "Ownership Interest (LLC/LLP)",
  VA: "Variable Annuity",
};

// Filings carry honorifics ("Hon.") as part of the disclosed name — strip
// them only for display, never when filtering/searching against the data.
export function displayName(name: string): string {
  return name.replace(/^Hon\.\s+/, "").trim();
}

// A trailing "(TICKER)" or "(TICKER) [TYPE]" (House), or an OCR paper
// filing's "(Stock)(TICKER)" pair — ticker/type are already shown as
// separate fields, so they're noise in the main asset name. Strips
// repeatedly since some sources stack more than one of these.
const TRAILING_PAREN_NOISE = /\s*\((?:[A-Z0-9.\/]{1,10}|Stock|Common Stock|Bond|Fund|ETF|Note|Warrant|Option|ADR|ADS)\)\s*$/;
const TRAILING_TYPE_CODE = /\s*\[[A-Za-z]{1,3}\]\s*$/;
// A share-class descriptor after the real company name — "Common Stock",
// "Class A Common Stock", "Ordinary Shares", "American Depositary Shares",
// etc. — often with a leading " - ", sometimes without.
const TRAILING_SHARE_CLASS =
  /\s*-?\s*(Class\s+[A-Z]\s+)?(Common|Capital|Ordinary|Preferred)?\s*(Common\s+Stock|Capital\s+Stock|Ordinary\s+Shares?|Preferred\s+Stock|American\s+Depositary\s+Shares?(\s+each\s+representing.*)?|Depositary\s+Shares?|Common\s+Shares?|Unsponsored\s+ADR|Sponsored\s+ADR|\bADR\b|\bADS\b|Stock)\s*$/i;
// Bond/note/option detail — series, coupon rate, maturity date, or an
// option's strike/expiry. Only the text before the earliest of these
// markers is kept.
const BOND_DETAIL_MARKERS = [
  /\bSER\s+\d/i,
  /Rate\/Coupon:/i,
  /Matures:/i,
  /\bDue\b/i,
  /\bCall\s+Make\s+Whole\b/i,
  /Option\s+Type:/i,
  /\d+(\.\d+)?\s*%/,
  /\b\d\.\d{2,4}\s+\d{4}-\d{2}-\d{2}\b/, // a bare decimal rate ("5.0000") right before an ISO date, no "%" sign
];

/**
 * Trades display the ticker, asset-type label, and (for bonds) rate/maturity
 * as their own separate fields already — the raw asset_name from the source
 * filing repeats all of that inline (e.g. "Microsoft Corporation - Common
 * Stock (MSFT) [ST]", or a bond's "TRANSCANADA PIPELINES LTD SER 2026-A
 * Rate/Coupon: 6.125% Matures: 2056-10-17"). This strips that repetition
 * down to just the issuer/company name for the main display text. Applied
 * only for display — searching and the raw record are unaffected.
 */
export function cleanAssetName(name: string): string {
  let cleaned = name.trim();

  // Truncate bond/note details at the earliest marker, if any.
  let earliestIdx = -1;
  for (const marker of BOND_DETAIL_MARKERS) {
    const m = cleaned.match(marker);
    if (m && m.index !== undefined && (earliestIdx === -1 || m.index < earliestIdx)) {
      earliestIdx = m.index;
    }
  }
  if (earliestIdx > 0) {
    cleaned = cleaned.slice(0, earliestIdx).trim().replace(/[,\-–—]+$/, "").trim();
  }

  // Strip trailing ticker/type-code parens (loop — some stack two, e.g. an
  // OCR paper filing's "(Stock)(TKNO)").
  let prevLength: number;
  do {
    prevLength = cleaned.length;
    cleaned = cleaned.replace(TRAILING_PAREN_NOISE, "").trim();
    cleaned = cleaned.replace(TRAILING_TYPE_CODE, "").trim();
  } while (cleaned.length !== prevLength && cleaned.length > 0);

  cleaned = cleaned.replace(TRAILING_SHARE_CLASS, "").trim();
  // A dangling separator can survive the strips above (e.g. "UNSP/ADR"
  // loses "ADR" but leaves a trailing "/").
  cleaned = cleaned.replace(/[\/\-–—,]+$/, "").trim();

  // A disclosure-boilerplate sentence sometimes leaks in ahead of the real
  // name (a House PDF text-extraction quirk, not this function's doing) —
  // recognizable as unusually long, multi-sentence text once the ticker/
  // share-class noise above is already stripped. Keep only the text after
  // the last sentence boundary in that case.
  if (cleaned.length > 60 && /\. [A-Z]/.test(cleaned)) {
    const segments = cleaned.split(/\.\s+(?=[A-Z])/);
    const last = segments[segments.length - 1].trim();
    if (last.length > 0 && last.length < cleaned.length) cleaned = last;
  }

  cleaned = cleaned.replace(/^[^A-Za-z0-9(]+/, "").trim();

  return cleaned || name.trim();
}

export async function fetchTrades(filters: TradeFilters): Promise<TradesResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, String(value));
    }
  }
  const res = await fetch(`/api/trades?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch trades: ${res.status}`);
  return res.json();
}

export async function fetchStats(chambers?: string[]): Promise<Stats> {
  const params = new URLSearchParams();
  for (const c of chambers ?? []) params.append("chamber", c);
  const res = await fetch(`/api/stats?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}
