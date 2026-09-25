import { AlertFilters, AlertFrequency, AlertTradeRow } from "./alertFilters";

/**
 * Browser-side calls to /api/alerts. Every one of these has a server-side
 * counterpart that re-checks both sign-in and the paid plan — nothing here
 * is a permission check, it only shapes the request and surfaces the error
 * message the server chose to return.
 */

export interface SavedAlert {
  id: string;
  name: string;
  email: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
  sent_count: number;
  matched_count: number;
  paused_reason: string | null;
}

export interface AlertsResponse {
  alerts: SavedAlert[];
  isPro: boolean;
  email: string | null;
  maxAlerts: number;
}

export interface AlertPreviewResult {
  total: number;
  recent: number;
  sample: AlertTradeRow[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function fetchAlerts(): Promise<AlertsResponse> {
  return request<AlertsResponse>("/api/alerts");
}

export function createAlert(input: { name: string; frequency: AlertFrequency; filters: AlertFilters }): Promise<{ alert: SavedAlert }> {
  return request("/api/alerts", { method: "POST", body: JSON.stringify(input) });
}

export function updateAlert(
  id: string,
  patch: { name?: string; frequency?: AlertFrequency; filters?: AlertFilters; active?: boolean }
): Promise<{ alert: SavedAlert }> {
  return request(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteAlert(id: string): Promise<{ ok: true }> {
  return request(`/api/alerts/${id}`, { method: "DELETE" });
}

export function previewAlert(filters: AlertFilters, signal?: AbortSignal): Promise<AlertPreviewResult> {
  return request("/api/alerts/preview", { method: "POST", body: JSON.stringify({ filters }), signal });
}

/**
 * Carries a set of filters from the trades page to the account screen, which
 * opens the alert editor pre-filled with them.
 *
 * Passed through the URL rather than held in memory because the two live on
 * different pages — and because it survives a sign-in or checkout redirect in
 * between, which is exactly the path a new subscriber takes.
 *
 * The receiving end re-runs normalizeAlertFilters, so a hand-edited or stale
 * link can only ever produce a valid filter set, never trusted input.
 */
export const ALERT_DRAFT_PARAM = "draft";

export function alertDraftHref(filters: AlertFilters): string {
  const keys = Object.keys(filters);
  if (keys.length === 0) return "/account";
  return `/account?${ALERT_DRAFT_PARAM}=${encodeURIComponent(JSON.stringify(filters))}`;
}

/**
 * Reads the draft back on /account. Returns undefined when the param is absent
 * or unparseable — a malformed link opens an empty editor rather than failing.
 */
export function readAlertDraft(search: string): AlertFilters | undefined {
  const raw = new URLSearchParams(search).get(ALERT_DRAFT_PARAM);
  if (raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as AlertFilters) : {};
  } catch {
    return {};
  }
}

/**
 * The same handover, routed via the pricing page for someone who can't save an
 * alert yet.
 *
 * Without this, the funnel loses people at its most expensive moment: they
 * build a filter, hit the upgrade wall, pay — and land back with the draft
 * gone, having to rebuild from memory the thing they just told us they wanted.
 * /upgrade carries it through checkout and hands it to /account afterwards.
 */
export function alertUpgradeHref(filters: AlertFilters): string {
  const keys = Object.keys(filters);
  if (keys.length === 0) return "/upgrade";
  return `/upgrade?${ALERT_DRAFT_PARAM}=${encodeURIComponent(JSON.stringify(filters))}`;
}
