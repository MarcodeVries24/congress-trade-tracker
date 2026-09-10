import { ThemeToggle } from "./ThemeToggle";

function Logo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.4" strokeLinecap="round">
        <path d="M5 19V13" />
        <path d="M12 19V8" />
        <path d="M19 19V5" />
      </svg>
    </div>
  );
}

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight sm:text-base">CongTrade</div>
            <div className="hidden text-[11px] text-ink-faint sm:block">Congress Trade Tracker</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
