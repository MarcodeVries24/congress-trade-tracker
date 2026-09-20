"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/trades", label: "All Trades" },
  { href: "/politicians", label: "Politicians" },
  { href: "/about", label: "About" },
];

/**
 * The phone-width navigation. Only this piece is a client component — the
 * Header itself stays on the server, so the disclosure state doesn't drag
 * the brand mark, Clerk's buttons or the rest of the header into the client
 * bundle with it.
 *
 * Sign in deliberately lives in the Header, *outside* this menu, so it stays
 * on screen whether the menu is open or shut. Only secondary navigation is
 * behind the button.
 *
 * Hidden from `sm` up, where Header renders the same links inline instead.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Route change closes it: Next keeps this component mounted across
  // navigations, so without this the panel would still be open on the page
  // you just navigated to.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus(); // don't strand focus on a hidden panel
      }
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    }
    // Crossing into the `sm` layout hides the panel via CSS; close it too so
    // the button doesn't come back still marked expanded.
    const mq = window.matchMedia("(min-width: 640px)");
    function onBreakpoint() {
      if (mq.matches) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    mq.addEventListener("change", onBreakpoint);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      mq.removeEventListener("change", onBreakpoint);
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        {/* Three bars that become an X. Animating the bars rather than
            swapping icons keeps the button's meaning legible mid-transition. */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <rect
            x="2"
            y="3.25"
            width="12"
            height="1.5"
            rx="0.75"
            fill="currentColor"
            className={`origin-center transition-transform duration-200 ${open ? "translate-y-[3.25px] rotate-45" : ""}`}
          />
          <rect
            x="2"
            y="7.25"
            width="12"
            height="1.5"
            rx="0.75"
            fill="currentColor"
            className={`transition-opacity duration-150 ${open ? "opacity-0" : "opacity-100"}`}
          />
          <rect
            x="2"
            y="11.25"
            width="12"
            height="1.5"
            rx="0.75"
            fill="currentColor"
            className={`origin-center transition-transform duration-200 ${open ? "-translate-y-[3.25px] -rotate-45" : ""}`}
          />
        </svg>
      </button>

      {/* Absolutely positioned so opening the menu doesn't shove the page
          down. `grid-rows-[0fr]` -> `[1fr]` animates to the panel's natural
          height without hard-coding one. */}
      <div
        id="mobile-nav"
        ref={panelRef}
        className={`absolute inset-x-0 top-full z-40 grid overflow-hidden border-b border-line bg-panel transition-[grid-template-rows,opacity] duration-200 ${
          open ? "grid-rows-[1fr] opacity-100 shadow-lg" : "pointer-events-none grid-rows-[0fr] opacity-0"
        }`}
      >
        <nav className="min-h-0">
          <ul className="px-4 py-2">
            {LINKS.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    tabIndex={open ? undefined : -1}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      active ? "bg-panel-muted text-ink" : "text-ink-muted hover:bg-panel-muted hover:text-ink"
                    }`}
                  >
                    {label}
                    {active && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* The theme toggle lives in here on phones rather than in the
              header row: brand + Sign in + toggle + menu button together
              overflow a 320px screen, and Sign in is the one that has to
              stay visible. From `sm` up the Header renders it inline again. */}
          <div className="flex items-center justify-between border-t border-line px-7 py-3">
            <span className="text-sm font-medium text-ink-muted">Appearance</span>
            <div tabIndex={open ? undefined : -1}>
              <ThemeToggle />
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
