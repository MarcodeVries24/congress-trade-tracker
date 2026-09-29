/**
 * The CongTrade API, as the app sees it.
 *
 * The app has no database and no server of its own: it reads the same Next.js
 * routes the website does. That keeps one definition of what a trade is, one
 * entitlement check, and one place where the publish gate lives.
 *
 * The types below are a hand-kept copy of the website's. When the shared
 * workspace package lands they become an import instead; until then, treat
 * web/lib/api.ts as the original and this as the copy that follows it.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://www.congtrade.com";

export interface Trade {
  id: number;
  doc_id: string;
  member_name: string;
  bioguide_id: string | null;
  member_slug: string | null;
  state_district: string | null;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
  owner: string | null;
  transaction_type: string;
  transaction_date: string | null;
  notification_date: string | null;
  amount_range: string | null;
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
  market_cap: number | null;
}

export interface Page<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TradeQuery {
  page?: number;
  limit?: number;
  q?: string;
  /** Repeated on the wire: chamber=house&chamber=senate. */
  chamber?: ("house" | "senate")[];
  assetTypes?: string[];
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /**
   * A Clerk session token. The API routes read it the same way they read the
   * website's cookie, so a signed-in request from the app gets the same
   * entitlement the same person has in a browser. Omitted, the request is
   * simply anonymous, which the free endpoints allow.
   */
  token?: string | null;
}

/**
 * One place where a request is built, so every screen reports a failure the
 * same way. A route that refuses is not the same as a network that is not
 * there, and on a phone the second is the common one: the distinction is what
 * lets a screen say "you're offline" instead of blaming the server.
 */
async function get<T>(path: string, params?: URLSearchParams, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}${params && [...params].length ? `?${params}` : ""}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: options.signal, headers });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ApiError(0, "No connection. Check your network and try again.");
  }
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export function fetchTrades(query: TradeQuery = {}, options: RequestOptions = {}): Promise<Page<Trade>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.q) params.set("q", query.q);
  // Repeated keys rather than a comma list, because that is what the route's
  // searchParams.getAll expects.
  for (const c of query.chamber ?? []) params.append("chamber", c);
  for (const t of query.assetTypes ?? []) params.append("assetTypes", t);
  return get<Page<Trade>>("/api/trades", params, options);
}

export { ApiError };
