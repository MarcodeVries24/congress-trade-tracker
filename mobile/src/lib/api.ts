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
  /** From the market cap table, when the ticker is in it. */
  company_name?: string | null;
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
  /** Repeated on the wire: chamber=house&chamber=senate. Empty means both. */
  chamber?: ("house" | "senate")[];
  assetTypes?: string[];
  // The structured filters. The route honours them for a Pro account only,
  // which is everyone past the paywall.
  members?: string[];
  tickers?: string[];
  parties?: string[];
  states?: string[];
  /** "P" | "S" | "E", matched as a prefix, so "S" also covers partial sales. */
  types?: string[];
  owners?: string[];
  minAmount?: number;
  amountRanges?: string[];
  marketCapTiers?: string[];
  filedStatus?: "late" | "onTime";
  /** Filing dates, inclusive, as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: "asc" | "desc";
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
  //
  // Both chambers are always named explicitly: the route reads no chamber as
  // House only, a default kept from before the Senate was ingested, and that
  // quietly dropped every Senate trade from anything that asked for "all".
  const chambers = query.chamber?.length ? query.chamber : ["house", "senate"];
  for (const c of chambers) params.append("chamber", c);
  const lists: [string, string[] | undefined][] = [
    ["assetTypes", query.assetTypes],
    ["members", query.members],
    ["tickers", query.tickers],
    ["parties", query.parties],
    ["states", query.states],
    ["types", query.types],
    ["owners", query.owners],
    ["amountRanges", query.amountRanges],
    ["marketCapTiers", query.marketCapTiers],
  ];
  for (const [key, values] of lists) for (const v of values ?? []) params.append(key, v);
  if (query.minAmount) params.set("minAmount", String(query.minAmount));
  if (query.filedStatus) params.set("filedStatus", query.filedStatus);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
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

  const add = (
    group: MemberOption,
    r: { member_name: string; bioguide_id: string | null; trade_count: number | string }
  ) => {
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

export interface PoliticianSummary {
  member_name: string;
  slug: string;
  state_district: string | null;
  party: string | null;
  photo_url: string | null;
  member_state: string | null;
  chamber: "house" | "senate";
  trade_count: number;
  volume_sum: number;
  last_filed: string | null;
}

export interface ListQuery {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
  chamber?: ("house" | "senate")[];
}

function listParams(query: ListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  for (const c of query.chamber ?? []) params.append("chamber", c);
  return params;
}

/** One row per person, merged across filed spellings by the server. */
export function fetchPoliticians(
  query: ListQuery = {},
  options: RequestOptions = {}
): Promise<Page<PoliticianSummary>> {
  return get<Page<PoliticianSummary>>("/api/politicians", listParams(query), options);
}

/** The trade fields the member and issuer pages carry, a subset of Trade. */
export interface DetailTrade {
  id: number;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
  company_name: string | null;
  owner: string | null;
  transaction_type: string;
  transaction_date: string | null;
  amount_range: string | null;
  amount_low: number | null;
  amount_high: number | null;
  filing_date: string | null;
  pdf_url: string;
  days_to_file: number | null;
}

export interface PoliticianDetail {
  profile: {
    slug: string;
    display: string;
    names: string[];
    party: string | null;
    state: string | null;
    state_district: string | null;
    chamber: "house" | "senate" | null;
    photo_url: string | null;
    trade_count: number;
    volume_sum: number;
    first_filed: string | null;
    last_filed: string | null;
    purchases: number;
    sales: number;
    top_tickers: { ticker: string; count: number }[];
  };
  /** The most recent hundred, newest first. */
  trades: DetailTrade[];
  /** Set when the slug was an old spelling: ask again under this one. */
  redirectTo: string | null;
}

export function fetchPolitician(slug: string, options: RequestOptions = {}): Promise<PoliticianDetail> {
  return get<PoliticianDetail>(`/api/politicians/${encodeURIComponent(slug)}`, undefined, options);
}

export interface IssuerSummary {
  ticker: string;
  slug: string;
  company_name: string | null;
  market_cap: number | null;
  trade_count: number;
  volume_sum: number;
  politician_count: number;
  purchases: number;
  sales: number;
  last_traded: string | null;
  last_filed: string | null;
}

export function fetchIssuers(query: ListQuery = {}, options: RequestOptions = {}): Promise<Page<IssuerSummary>> {
  return get<Page<IssuerSummary>>("/api/issuers", listParams(query), options);
}

export interface IssuerDetail {
  issuer: IssuerSummary;
  traders: {
    member_name: string;
    bioguide_id: string | null;
    slug: string | null;
    display: string;
    party: string | null;
    photo_url: string | null;
    trade_count: number;
    volume_sum: number;
  }[];
  trades: (DetailTrade & {
    member_name: string;
    bioguide_id: string | null;
    member_slug: string | null;
    party: string | null;
    photo_url: string | null;
    chamber: "house" | "senate";
  })[];
}

export function fetchIssuer(slug: string, options: RequestOptions = {}): Promise<IssuerDetail> {
  return get<IssuerDetail>(`/api/issuers/${encodeURIComponent(slug)}`, undefined, options);
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  image: string | null;
}

export interface NewsSection {
  key: string;
  publisher: string;
  homepage: string;
  blurb: string;
  items: NewsItem[];
}

/**
 * The publishers' feeds, grouped by publisher.
 *
 * Feed image URLs arrive HTML-escaped (`&amp;` between query parameters), which
 * a browser forgives inside an attribute and an image loader does not.
 */
export async function fetchNews(options: RequestOptions = {}): Promise<NewsSection[]> {
  const raw = await get<{ sections: NewsSection[] }>("/api/news", undefined, options);
  return raw.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => ({ ...item, image: item.image ? item.image.replace(/&amp;/g, "&") : null })),
  }));
}

/**
 * A write: POST, PATCH or DELETE with a JSON body. The alert routes explain a
 * refusal in words ("You can have up to 25 alerts"), so that message is what
 * the error carries rather than a bare status.
 */
async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: options.signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new ApiError(0, "No connection. Check your network and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data;
}

export type AlertFrequency = "instant" | "daily" | "weekly";

/** The subset of the website's alert criteria the app edits. The server keeps any others untouched. */
export interface AlertFilters {
  q?: string;
  chambers?: string[];
  members?: string[];
  parties?: string[];
  states?: string[];
  tickers?: string[];
  assetTypes?: string[];
  types?: string[];
  owners?: string[];
  minAmount?: number;
  amountRanges?: string[];
  marketCapTiers?: string[];
  filedStatus?: "late" | "onTime";
}

export interface Alert {
  id: string;
  name: string;
  email: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
  active: boolean;
  created_at: string;
  last_sent_at: string | null;
  sent_count: number;
  matched_count: number;
  paused_reason: string | null;
  /** The server's one-line description, the same one the email uses. */
  summary: string;
}

export interface AlertList {
  alerts: Alert[];
  isPro: boolean;
  /** Where the emails go. */
  email: string | null;
  maxAlerts: number;
}

export function fetchAlerts(options: RequestOptions = {}): Promise<AlertList> {
  return get<AlertList>("/api/alerts", undefined, options);
}

export async function createAlert(
  input: { name: string; frequency: AlertFrequency; filters: AlertFilters },
  options: RequestOptions = {}
): Promise<Alert> {
  return (await send<{ alert: Alert }>("POST", "/api/alerts", input, options)).alert;
}

export async function updateAlert(
  id: string,
  patch: Partial<{ name: string; frequency: AlertFrequency; filters: AlertFilters; active: boolean }>,
  options: RequestOptions = {}
): Promise<Alert> {
  return (await send<{ alert: Alert }>("PATCH", `/api/alerts/${id}`, patch, options)).alert;
}

export async function deleteAlert(id: string, options: RequestOptions = {}): Promise<void> {
  await send<{ ok: boolean }>("DELETE", `/api/alerts/${id}`, undefined, options);
}

/** How many trades a draft would have matched: ever, and in the last 90 days. */
export function previewAlert(
  filters: AlertFilters,
  options: RequestOptions = {}
): Promise<{ total: number; recent: number }> {
  return send<{ total: number; recent: number }>("POST", "/api/alerts/preview", { filters }, options);
}

/** Announcements from the SEC, the Federal Reserve and the statistics agencies. */
export async function fetchPolicy(options: RequestOptions = {}): Promise<NewsItem[]> {
  const raw = await get<{ items: NewsItem[] }>("/api/policy", undefined, options);
  return raw.items;
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
