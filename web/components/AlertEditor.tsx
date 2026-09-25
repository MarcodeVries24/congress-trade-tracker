"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALERT_CHAMBERS,
  ALERT_FREQUENCIES,
  ALERT_PARTIES,
  ALERT_TRANSACTION_TYPES,
  AlertFilters,
  AlertFrequency,
  MIN_AMOUNT_OPTIONS,
  US_STATES,
} from "@/lib/alertFilters";
import {
  AMOUNT_RANGES,
  ASSET_TYPE_LABELS,
  MARKET_CAP_TIERS,
  OWNER_LABELS,
  cleanAssetName,
  displayName,
  fetchMemberOptions,
  fetchTickerOptions,
} from "@/lib/api";
import { AlertPreviewResult, previewAlert } from "@/lib/alertsClient";
import { compactAmountRange, formatDate, typeBadge } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { MultiSelect } from "./MultiSelect";
import { SearchableMultiSelect } from "./SearchableMultiSelect";
import { Select } from "./Select";

export interface AlertDraft {
  name: string;
  frequency: AlertFrequency;
  filters: AlertFilters;
}

// A PTR discloses a *band*, never an exact figure, so trade size is asked
// for one of two ways and never both at once: a floor ("$50,001 and up",
// which is what almost everyone means) or an explicit set of bands. Offering
// both simultaneously would let someone save a contradiction — a $1M floor
// AND only the $1,001–$15,000 band — that silently matches nothing.
type SizeMode = "any" | "min" | "ranges";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputClass =
  "rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-line-strong transition-colors";

export function AlertEditor({
  initial,
  existing = false,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initial?: { name: string; frequency: AlertFrequency; filters: AlertFilters };
  /**
   * Whether this is an edit of a saved alert, as opposed to a new one that
   * merely arrives pre-filled — a draft handed over from the trades page has
   * `initial` values but is still a *create*, and labelling it "Edit alert"
   * would be a lie about what the button does.
   */
  existing?: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (draft: AlertDraft) => void;
}) {
  const f = initial?.filters ?? {};

  const [name, setName] = useState(initial?.name ?? "");
  const [frequency, setFrequency] = useState<AlertFrequency>(initial?.frequency ?? "instant");
  const [chambers, setChambers] = useState<string[]>(f.chambers ?? []);
  const [parties, setParties] = useState<string[]>(f.parties ?? []);
  const [states, setStates] = useState<string[]>(f.states ?? []);
  const [members, setMembers] = useState<string[]>(f.members ?? []);
  const [tickers, setTickers] = useState<string[]>(f.tickers ?? []);
  const [types, setTypes] = useState<string[]>(f.types ?? []);
  const [owners, setOwners] = useState<string[]>(f.owners ?? []);
  const [assetTypes, setAssetTypes] = useState<string[]>(f.assetTypes ?? []);
  const [marketCapTiers, setMarketCapTiers] = useState<string[]>(f.marketCapTiers ?? []);
  const [filedStatus, setFiledStatus] = useState<"" | "late" | "onTime">(f.filedStatus ?? "");
  const [q, setQ] = useState(f.q ?? "");
  const [sizeMode, setSizeMode] = useState<SizeMode>(f.minAmount ? "min" : f.amountRanges?.length ? "ranges" : "any");
  const [minAmount, setMinAmount] = useState<number>(f.minAmount ?? MIN_AMOUNT_OPTIONS[1].value);
  const [amountRanges, setAmountRanges] = useState<string[]>(f.amountRanges ?? []);

  const [memberOptions, setMemberOptions] = useState<{ value: string; label: string }[]>([]);
  const [tickerOptions, setTickerOptions] = useState<{ value: string; label: string }[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchMemberOptions(), fetchTickerOptions()])
      .then(([memberRows, tickerRows]) => {
        setMemberOptions(memberRows.map((m) => ({ value: m.member_name, label: displayName(m.member_name) })));
        setTickerOptions(tickerRows.map((t) => ({ value: t.ticker, label: t.ticker })));
      })
      .catch(() => {})
      .finally(() => setOptionsLoading(false));
  }, []);

  const filters: AlertFilters = useMemo(
    () => ({
      q: q.trim() || undefined,
      chambers: chambers.length ? chambers : undefined,
      parties: parties.length ? parties : undefined,
      states: states.length ? states : undefined,
      members: members.length ? members : undefined,
      tickers: tickers.length ? tickers : undefined,
      types: types.length ? types : undefined,
      owners: owners.length ? owners : undefined,
      assetTypes: assetTypes.length ? assetTypes : undefined,
      marketCapTiers: marketCapTiers.length ? marketCapTiers : undefined,
      filedStatus: filedStatus || undefined,
      minAmount: sizeMode === "min" ? minAmount : undefined,
      amountRanges: sizeMode === "ranges" && amountRanges.length ? amountRanges : undefined,
    }),
    [q, chambers, parties, states, members, tickers, types, owners, assetTypes, marketCapTiers, filedStatus, sizeMode, minAmount, amountRanges]
  );

  // Live "what would this have caught" counter. Debounced because every
  // checkbox tick would otherwise re-run a full-corpus count.
  const debouncedFilters = useDebounced(filters, 400);
  const [preview, setPreview] = useState<AlertPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreviewLoading(true);
    previewAlert(debouncedFilters, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPreview(result);
      })
      .catch(() => {
        // An aborted request is the normal case here (the next keystroke
        // superseded it) — leaving the previous count on screen is better
        // than flashing an error at someone who is still typing.
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });
    return () => controller.abort();
  }, [debouncedFilters]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const nameValid = name.trim().length > 0;

  return (
    // The dialog owns the scrolling, not the backdrop: a scrolling backdrop
    // with a `sticky` header lets the form's first rows render above the bar
    // on the way past it. Header and footer are fixed rows of a flex column,
    // and only the middle scrolls.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alert-editor-title"
        className="flex h-full w-full flex-col border-line bg-panel sm:h-auto sm:max-h-full sm:max-w-3xl sm:rounded-xl sm:border sm:shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3 sm:rounded-t-xl sm:px-6">
          <h2 id="alert-editor-title" className="text-base font-bold tracking-tight text-ink">
            {existing ? "Edit alert" : "New alert"}
          </h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-md px-2 py-1 text-ink-faint hover:bg-panel-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" hint="Only you see this — it's the email's subject line too.">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Big House purchases"
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <Field label="How often" hint={ALERT_FREQUENCIES.find((o) => o.value === frequency)?.hint}>
              <Select value={frequency} onChange={(e) => setFrequency(e.target.value as AlertFrequency)} active={false}>
                {ALERT_FREQUENCIES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Who</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MultiSelect placeholder="Both chambers" selected={chambers} onChange={setChambers} options={ALERT_CHAMBERS} />
              <MultiSelect placeholder="Any party" selected={parties} onChange={setParties} options={ALERT_PARTIES} />
              <SearchableMultiSelect
                placeholder="Any state"
                searchPlaceholder="Type a state…"
                selected={states}
                onChange={setStates}
                options={US_STATES}
              />
              <SearchableMultiSelect
                placeholder="Any member"
                searchPlaceholder="Type a member name…"
                selected={members}
                onChange={setMembers}
                options={memberOptions}
                loading={optionsLoading}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">What</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SearchableMultiSelect
                placeholder="Any ticker"
                searchPlaceholder="Type a ticker…"
                selected={tickers}
                onChange={setTickers}
                options={tickerOptions}
                loading={optionsLoading}
              />
              <MultiSelect
                placeholder="Any asset type"
                selected={assetTypes}
                onChange={setAssetTypes}
                options={Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <MultiSelect placeholder="Buys and sells" selected={types} onChange={setTypes} options={ALERT_TRANSACTION_TYPES} />
              <MultiSelect
                placeholder="Any owner"
                selected={owners}
                onChange={setOwners}
                options={Object.entries(OWNER_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">How big</h3>
            <div className="flex flex-wrap items-start gap-3">
              <Select value={sizeMode} onChange={(e) => setSizeMode(e.target.value as SizeMode)} active={sizeMode !== "any"} className="w-full sm:w-48">
                <option value="any">Any trade size</option>
                <option value="min">At least…</option>
                <option value="ranges">Specific brackets…</option>
              </Select>
              {sizeMode === "min" && (
                <Select value={String(minAmount)} onChange={(e) => setMinAmount(Number(e.target.value))} className="w-full sm:w-44">
                  {MIN_AMOUNT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
              {sizeMode === "ranges" && (
                <MultiSelect
                  placeholder="Pick brackets"
                  className="w-full sm:w-56"
                  selected={amountRanges}
                  onChange={setAmountRanges}
                  options={AMOUNT_RANGES.map((r) => ({ value: r, label: r }))}
                />
              )}
              <MultiSelect
                placeholder="Any market cap"
                className="w-full sm:w-52"
                selected={marketCapTiers}
                onChange={setMarketCapTiers}
                options={MARKET_CAP_TIERS.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
            {sizeMode === "min" && (
              <p className="mt-2 text-xs text-ink-faint">
                Disclosures give a bracket, never an exact figure — so these are the real bracket edges, not round numbers.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Extras</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={filedStatus}
                onChange={(e) => setFiledStatus(e.target.value as "" | "late" | "onTime")}
                aria-label="Filing punctuality"
              >
                <option value="">Any filing status</option>
                <option value="onTime">Filed on time (≤45 days)</option>
                <option value="late">Filed late (&gt;45 days)</option>
              </Select>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Keyword in asset, ticker or member…"
                maxLength={120}
                className={inputClass}
              />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel-muted p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">What this would have caught</h3>
              {preview && (
                <span className="text-xs text-ink-faint">{preview.total.toLocaleString()} matches in the full archive</span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {previewLoading && !preview ? (
                "Checking…"
              ) : preview ? (
                <>
                  <strong className="text-ink">{preview.recent.toLocaleString()}</strong> trade{preview.recent === 1 ? "" : "s"} filed in the
                  last 90 days{preview.recent === 0 ? " — this may be narrower than you meant." : "."}
                </>
              ) : (
                "Couldn't check right now."
              )}
            </p>
            {preview && preview.sample.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {preview.sample.map((row) => {
                  const badge = typeBadge(row.transaction_type);
                  return (
                    <li key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                      <span className={`rounded border px-1.5 py-0.5 font-medium ${badge.className}`}>{badge.label}</span>
                      <span className="font-medium text-ink">{displayName(row.member_name)}</span>
                      <span>{row.ticker || cleanAssetName(row.asset_name)}</span>
                      <span>{compactAmountRange(row.amount_low, row.amount_high, row.amount_range ?? "—")}</span>
                      <span className="text-ink-faint">filed {formatDate(row.filing_date)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              This looks backwards through the archive to show what the filter does. The alert itself only emails trades from
              filings that arrive after you save it — you won&apos;t get a backlog.
            </p>
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line bg-panel px-4 py-3 sm:rounded-b-xl sm:px-6">
          <button type="button" onClick={onCancel} className="rounded-full border border-line px-4 py-2 text-sm text-ink-muted hover:border-line-strong hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            disabled={!nameValid || saving}
            onClick={() => onSave({ name: name.trim(), frequency, filters })}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Create alert"}
          </button>
        </div>
      </div>
    </div>
  );
}
