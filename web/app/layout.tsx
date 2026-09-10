import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Points Clerk's own UI (sign-in/up, user menu, billing/upgrade modals) at
// the same CSS custom properties the rest of the site uses (globals.css) —
// since those are plain `var(--x)` references, not baked-in colors, Clerk's
// components stay in sync with light/dark mode automatically, the same way
// every other themed element on the site already does.
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "rgb(var(--accent))",
    colorBackground: "rgb(var(--panel))",
    colorText: "rgb(var(--ink))",
    colorTextSecondary: "rgb(var(--ink-muted))",
    colorInputBackground: "rgb(var(--panel-muted))",
    colorInputText: "rgb(var(--ink))",
    colorNeutral: "rgb(var(--ink))",
    borderRadius: "0.375rem",
  },
};

export const metadata: Metadata = {
  title: "CongTrade — Congress Trade Tracker",
  description: "Searchable U.S. Congress (House & Senate) asset trade disclosures (Periodic Transaction Reports)",
};

// Clerk's <SignedIn>/<SignedOut>/<UserButton> (used in Header, rendered on
// every page) need a real per-request auth context from clerkMiddleware —
// which only runs for actual HTTP requests, not at `next build` time when
// Next.js tries to statically prerender a page. Every route already fetches
// its own data client-side anyway, so there's no static-shell win being
// given up by rendering per-request instead.
export const dynamic = "force-dynamic";

// Runs before paint so there's no light/dark flash on load.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={CLERK_APPEARANCE}>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
