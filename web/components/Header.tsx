import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
import { Logo } from "./Logo";

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
