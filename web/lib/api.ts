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
  failedFilings: number;
}

export interface TradeFilters {
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

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`/api/stats`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}
