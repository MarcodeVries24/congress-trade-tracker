import { SelectHTMLAttributes } from "react";

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select
        {...props}
        className="w-full appearance-none rounded-md border border-line bg-panel px-3 py-2 pr-8 text-sm text-ink outline-none transition-colors focus:border-line-strong"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">▾</span>
    </div>
  );
}
