import type { Trade } from '@/lib/api';

/** Trades under month headings ("August 2026"), in the order given, which is newest first. */
export function byMonth(trades: Trade[]): { title: string; data: Trade[] }[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = t.filing_date ? new Date(`${t.filing_date.slice(0, 10)}T00:00:00Z`) : null;
    const key = d ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'Undated';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()].map(([title, data]) => ({ title, data }));
}
