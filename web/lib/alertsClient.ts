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
