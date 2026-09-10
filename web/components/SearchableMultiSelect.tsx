"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchableOption {
  value: string;
  label: string;
}

// Same checkbox multi-select as MultiSelect, plus a type-to-filter text box
// at the top of the dropdown — for option lists too long to just scroll
// through (member names, tickers), rather than the short fixed lists
// (trade size, asset type, market cap) MultiSelect is for.
export function SearchableMultiSelect({
  placeholder,
  searchPlaceholder = "Type to search…",
  options,
  selected,
  onChange,
  className = "",
  loading,
}: {
  placeholder: string;
  searchPlaceholder?: string;
  options: SearchableOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const MAX_VISIBLE = 200;

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm outline-none transition-colors bg-panel hover:border-line-strong ${
          selected.length ? "border-accent text-accent" : "border-line text-ink-muted"
        }`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-[10px] text-ink-faint">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-md border border-line bg-panel p-1.5 shadow-xl">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="mb-1.5 w-full rounded border border-line bg-panel-muted px-2 py-1.5 text-sm text-ink outline-none focus:border-line-strong"
          />
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-ink-faint hover:bg-panel-muted hover:text-ink-muted"
            >
              Clear selection
            </button>
          )}
          <div className="max-h-64 overflow-y-auto">
            {loading && <div className="px-2 py-1.5 text-xs text-ink-faint">Loading…</div>}
            {!loading && filtered.length === 0 && <div className="px-2 py-1.5 text-xs text-ink-faint">No matches</div>}
            {!loading &&
              filtered.slice(0, MAX_VISIBLE).map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-panel-muted">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-line-strong bg-panel"
                  />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            {!loading && filtered.length > MAX_VISIBLE && (
              <div className="px-2 py-1 text-xs text-ink-faint">and {filtered.length - MAX_VISIBLE} more — keep typing to narrow it down</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
