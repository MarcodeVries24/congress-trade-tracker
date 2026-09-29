import type { Alert } from '@/lib/api';

/**
 * The alerts the list last loaded, so the editor opens on one without asking
 * the server again. The same trick the trade screen uses: there is no
 * GET /api/alerts/:id, and a list of at most 25 is always already in hand.
 */
const cache = new Map<string, Alert>();

export function rememberAlerts(alerts: Alert[]): void {
  cache.clear();
  for (const a of alerts) cache.set(a.id, a);
}

export function recallAlert(id: string): Alert | undefined {
  return cache.get(id);
}
