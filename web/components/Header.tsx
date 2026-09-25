import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";

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
    // `relative` anchors the mobile menu panel, which hangs off the bottom
    // edge rather than pushing the page down.
    <header className="relative border-b border-line">
      {/* A single row at every width. On a phone the secondary nav collapses
          into MobileNav's disclosure; Sign in stays in this row, outside the
          menu, so it's on screen whether the menu is open or shut. Before
          this, brand + tagline + both links + account all fought for one
          375px row: scrollWidth hit 381 against a 375 viewport, so the page
          scrolled sideways, and "Sign in" wrapped onto two lines. */}
      <div className="mx-auto flex max-w-7xl items-center gap-x-3 px-4 py-2.5 sm:gap-x-4 sm:px-6 sm:py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="text-ink">
            <Logo />
          </div>
          <span className="text-lg font-bold tracking-tight sm:text-xl md:text-2xl">
            <span className="text-ink">Cong</span>
            <span className="text-accent">Trade</span>
          </span>
        </Link>

        {/* Decoration, not navigation — it costs exactly the width the nav
            and the sign-in button need, so it only appears once the viewport
            can spare it. */}
        <span className="hidden whitespace-nowrap border-l border-line pl-3 text-[10px] font-medium uppercase tracking-wide text-ink-faint md:inline md:text-[11px] md:tracking-wider">
          Track Congress trades
        </span>

        {/* Inline nav from `sm` up; below that these same links live in
            MobileNav's panel. */}
        <nav className="hidden items-center gap-1 sm:flex">
          <Link
            href="/trades"
            className="rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink md:text-[11px] md:tracking-wider"
          >
            All Trades
          </Link>
          <Link
            href="/politicians"
            className="rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink md:text-[11px] md:tracking-wider"
          >
            Politicians
          </Link>
          <Link
            href="/issuers"
            className="rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted transition-colors hover:bg-panel-muted hover:text-ink md:text-[11px] md:tracking-wider"
          >
            Issuers
          </Link>
        </nav>

        {/* `ml-auto` pins these right; `shrink-0` + `whitespace-nowrap` stop
            the button collapsing into a two-line pill when space is tight.
            Sign in is outside MobileNav on purpose — it must stay visible at
            every width, open menu or not. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            {/* The account screen (plan + email alerts) is reachable from the
                avatar menu rather than the nav row — it's only meaningful
                once you're signed in, and the row is already tight on
                phones. See AccountMenu for why it's an action, not a link. */}
            <AccountMenu />
          </SignedIn>
          {/* On phones this sits inside the menu instead — see MobileNav. */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
