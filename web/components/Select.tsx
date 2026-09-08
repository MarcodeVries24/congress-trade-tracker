import { SelectHTMLAttributes } from "react";

export function Select({ className = "", children, value, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  const isEmpty = value === "" || value === undefined;
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        value={value}
        className={`w-full appearance-none rounded-md border bg-panel px-3 py-2 pr-8 text-sm outline-none transition-colors focus:border-line-strong ${
          isEmpty ? "border-line text-ink-muted" : "border-accent text-accent"
        }`}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">▾</span>
    </div>
  );
}
