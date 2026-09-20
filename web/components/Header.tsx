import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "./ThemeToggle";

// A U.S. Capitol dome — colonnade base, pediment, ringed dome, spire —
// rendered in the page's own ink color (currentColor) rather than the
// accent, since the wordmark next to it carries the accent color instead
// (see Header below). Stays legible down to a 28px mark (checked by
// rasterizing before wiring it in). Same mark also backs app/icon.svg for
// the browser tab, which can't read currentColor and hardcodes its own
// light/dark colors instead.
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="2.6" r="0.9" fill="currentColor" />
      <line x1="12" y1="3.6" x2="12" y2="6.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.3 13.8C6.3 9.2 8.7 5.4 12 5.4C15.3 5.4 17.7 9.2 17.7 13.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M8 11.6C9.1 10.8 10.5 10.3 12 10.3C13.5 10.3 14.9 10.8 16 11.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="9" y="13.6" width="6" height="2.6" rx="0.3" fill="currentColor" />
      <path d="M4.4 17.8L12 14.2L19.6 17.8Z" fill="currentColor" />
      <rect x="3.2" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="6.1" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="9" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="11.9" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="14.8" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="17.7" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="2" y="21.4" width="20" height="1.7" rx="0.4" fill="currentColor" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="border-b border-line">
      {/* One wrapping row rather than two fixed layouts. Source order is
          brand, tagline, nav, account; the `order-*` utilities only change
          where the nav sits relative to the account controls, so the nav
          can drop to its own full-width line on a phone and rejoin the top
          row as soon as there's space. Previously everything fought for a
          single 375px row: the account cluster was pushed 6px past the
          header (the page scrolled sideways) and "Sign in" wrapped onto
          two lines inside its own pill. */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:gap-x-4 sm:px-6 sm:py-3">
        <Link href="/" className="order-1 flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="text-ink">
            <Logo />
          </div>
          <span className="text-lg font-bold tracking-tight sm:text-xl md:text-2xl">
            <span className="text-ink">Cong</span>
            <span className="text-accent">Trade</span>
          </span>
        </Link>

        {/* Decoration, not navigation — it costs exactly the width the nav
            and the sign-in button need on a phone, so it only appears once
            the viewport can spare it. */}
        <span className="order-2 hidden whitespace-nowrap border-l border-line pl-3 text-[10px] font-medium uppercase tracking-wide text-ink-faint md:inline md:text-[11px] md:tracking-wider">
          Track Congress trades
        </span>

        {/* `ml-auto` keeps these at the end of whichever line they're on, so
            they're never squeezed by the nav. `shrink-0` + `whitespace-nowrap`
            stop the button collapsing into a two-line pill. */}
        <div className="order-3 ml-auto flex shrink-0 items-center gap-2 sm:order-4 sm:gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }} />
          </SignedIn>
          <ThemeToggle />
        </div>

        {/* `w-full` is what forces the wrap on a phone; from `sm` up it's
            `w-auto` and sits inline between the tagline and the account
            controls. Links are padded pills rather than 9px underlined text,
            with extra vertical padding on touch sizes only (py-2.5 -> ~37px
            tall) so they're a real tap target; a mouse doesn't need it, so
            `sm:py-1.5` takes it back on desktop. */}
        <nav className="order-4 -ml-2 flex w-full items-center gap-0.5 sm:order-3 sm:ml-0 sm:w-auto sm:gap-1">
          <Link
            href="/trades"
            className="rounded-md px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-panel hover:text-ink sm:py-1.5 sm:text-[10px] sm:font-medium md:text-[11px] md:tracking-wider"
          >
            All Trades
          </Link>
          <Link
            href="/politicians"
            className="rounded-md px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted transition-colors hover:bg-panel hover:text-ink sm:py-1.5 sm:text-[10px] sm:font-medium md:text-[11px] md:tracking-wider"
          >
            Politicians
          </Link>
        </nav>
      </div>
    </header>
  );
}
