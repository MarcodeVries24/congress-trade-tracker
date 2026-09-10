"use client";

export interface AssetTypePillOption {
  value: string;
  label: string;
}

// Checkbox-backed toggle chips — same multi-select semantics as MultiSelect
// (an option is either selected or not, any combination allowed), but laid
// out as always-visible pills rather than hidden behind a dropdown. Used
// specifically for the Asset Type filter, which is meant to read as more
// prominent than the rest of the filter bar.
export function AssetTypePills({
  options,
  selected,
  onChange,
}: {
  options: AssetTypePillOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Asset type">
      {options.map((opt) => {
        const checked = selected.includes(opt.value);
        return (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              checked
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-panel text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(opt.value)}
              className="h-3.5 w-3.5 shrink-0 accent-current"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
