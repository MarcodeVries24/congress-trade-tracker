import { SelectHTMLAttributes } from "react";

// By default, "active" (accent-colored) means any value other than "" — the
// convention every other filter here uses for its own neutral option. Pass
// `active` explicitly when a filter's neutral value isn't "" (e.g. chamber
// defaults to "both", not ""), so it still reads as neutral until changed.
export function Select({
  className = "",
  children,
  value,
  active,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { className?: string; active?: boolean }) {
  const isActive = active ?? (value !== "" && value !== undefined);
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        value={value}
        className={`w-full appearance-none rounded-md border bg-panel px-3 py-2 pr-8 text-sm outline-none transition-colors focus:border-line-strong ${
          isActive ? "border-accent text-accent" : "border-line text-ink-muted"
        }`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">▾</span>
    </div>
  );
}
