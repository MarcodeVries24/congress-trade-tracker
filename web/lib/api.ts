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
  pdf_url: string;
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
  topTickers: { ticker: string; count: number }[];
  lastIngestedAt: string | null;
  failedFilings: number;
}

export interface TradeFilters {
  q?: string;
  ticker?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  sort?: string;
  order?: "asc" | "desc";
}

export async function fetchTrades(filters: TradeFilters): Promise<TradesResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
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
