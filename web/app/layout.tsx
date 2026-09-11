import type { Metadata } from "next";
import { ClerkThemeProvider } from "@/components/ClerkThemeProvider";
import "./globals.css";

// The AdSense account script (no ad slot, just the client ID) needs to be
// present on every page for Google to verify site ownership and review the
// account — not just wherever an <AdSlot> happens to render. Individual ad
// placements (components/AdSlot.tsx) only add the <ins> unit + a request
// push, assuming this script is already loaded.
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

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
    <ClerkThemeProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          {/* Plain native tag, not next/script — Script's afterInteractive
              strategy injects client-side after hydration, so it never
              appears in the raw server-rendered HTML that AdSense's
              verification crawler actually fetches. This one does. */}
          {ADSENSE_CLIENT_ID && (
            <script
              async
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
              crossOrigin="anonymous"
            />
          )}
        </head>
        <body>{children}</body>
      </html>
    </ClerkThemeProvider>
  );
}
