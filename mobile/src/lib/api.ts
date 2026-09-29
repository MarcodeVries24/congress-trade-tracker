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

export interface MemberOption {
  member_name: string;
  /** Every filed spelling of this person, because the filter matches exactly. */
  names: string[];
  bioguide_id: string | null;
  trade_count: number;
}

/**
 * The member list, grouped one option per person.
 *
 * /api/members returns a row per (name, bioguide), and one person can be filed
 * under several spellings: Blumenthal's scanned filings shout his name and his
 * electronic ones do not. Grouping here is the same rule the website applies,
 * and it is why an option carries every spelling rather than just its own.
 */
export async function fetchMemberOptions(options: RequestOptions = {}): Promise<MemberOption[]> {
  const raw = await get<{ data: { member_name: string; bioguide_id: string | null; trade_count: number | string }[] }>(
    "/api/members",
    undefined,
    options
  );
  const groups = new Map<string, MemberOption>();
  const byName = new Map<string, MemberOption>();

  const add = (group: MemberOption, r: { member_name: string; bioguide_id: string | null; trade_count: number | string }) => {
    if (!group.names.includes(r.member_name)) group.names.push(r.member_name);
    group.bioguide_id = group.bioguide_id ?? r.bioguide_id;
    group.trade_count += Number(r.trade_count) || 0;
    byName.set(r.member_name, group);
  };

  for (const r of raw.data.filter((r) => r.bioguide_id)) {
    const existing = groups.get(r.bioguide_id as string);
    if (existing) {
      add(existing, r);
      continue;
    }
    const group: MemberOption = { member_name: r.member_name, names: [], bioguide_id: r.bioguide_id, trade_count: 0 };
    groups.set(r.bioguide_id as string, group);
    add(group, r);
  }
  // A filing whose member never resolved carries a null id; fold it into the
  // group that already has that spelling rather than opening a second option
  // with an identical label.
  for (const r of raw.data.filter((r) => !r.bioguide_id)) {
    const existing = byName.get(r.member_name);
    if (existing) {
      add(existing, r);
      continue;
    }
    const group: MemberOption = { member_name: r.member_name, names: [], bioguide_id: null, trade_count: 0 };
    groups.set(r.member_name, group);
    add(group, r);
  }

  return [...groups.values()].sort((a, b) => b.trade_count - a.trade_count);
}

export interface SiteStats {
  totalTransactions: number;
  totalFilings: number;
  totalMembers: number;
}

/** The corpus totals, so nothing in the app has to claim a number by hand. */
export async function fetchStats(options: RequestOptions = {}): Promise<SiteStats> {
  const params = new URLSearchParams();
  for (const c of ["house", "senate"]) params.append("chamber", c);
  const raw = await get<{ data?: SiteStats } & Partial<SiteStats>>("/api/stats", params, options);
  const stats = raw.data ?? (raw as SiteStats);
  return {
    totalTransactions: Number(stats.totalTransactions) || 0,
    totalFilings: Number(stats.totalFilings) || 0,
    totalMembers: Number(stats.totalMembers) || 0,
  };
}

export { ApiError };
