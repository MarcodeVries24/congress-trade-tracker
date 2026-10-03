import { useEffect, useMemo, useState } from 'react';

import { fetchTickerOptions, type TickerOption } from '@/lib/api';
import { PickList, type PickOption } from '@/ui/pick-list';
import { TickerLogo } from '@/ui/ticker-logo';

/**
 * Picks tickers from a searchable list of every ticker traded, most traded
 * first, found by symbol or by company name.
 */
export function TickerPicker({ value, onChange }: { value: string[]; onChange: (tickers: string[]) => void }) {
  const [options, setOptions] = useState<TickerOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchTickerOptions({ signal: controller.signal })
      .then(setOptions)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const rows = useMemo<PickOption[]>(() => {
    // A ticker already in the filter that the list lacks (one from an older
    // alert, say) still shows, so it can be unticked.
    const known = new Set(options.map((o) => o.ticker));
    const extra: TickerOption[] = value
      .filter((t) => !known.has(t))
      .map((ticker) => ({ ticker, company_name: null, trade_count: 0 }));
    return [...extra, ...options].map((o) => ({
      key: o.ticker,
      label: o.ticker,
      detail: [o.company_name, o.trade_count ? `${o.trade_count.toLocaleString()} trades` : null]
        .filter(Boolean)
        .join(' · '),
      search: `${o.ticker} ${o.company_name ?? ''}`.toLowerCase(),
      leading: <TickerLogo ticker={o.ticker} size={36} />,
    }));
  }, [options, value]);

  return (
    <PickList
      options={rows}
      loading={loading}
      placeholder="Search tickers or companies"
      isPicked={(key) => value.includes(key)}
      onToggle={(key) => onChange(value.includes(key) ? value.filter((t) => t !== key) : [...value, key])}
    />
  );
}
