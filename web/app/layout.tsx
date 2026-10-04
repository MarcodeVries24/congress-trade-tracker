import type { Metadata } from "next";
import { ClerkThemeProvider } from "@/components/ClerkThemeProvider";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// The AdSense account script (no ad slot, just the client ID) needs to be
// present on every page for Google to verify site ownership and review the
// account — not just wherever an <AdSlot> happens to render. Individual ad
// placements (components/AdSlot.tsx) only add the <ins> unit + a request
// push, assuming this script is already loaded.
//
// Off until consent is in place. Google's script can set advertising cookies
// and contacts Google for every visitor, and EU/UK law (and Google's own
// rules for EEA traffic) require consent first, through a Google-certified
// consent message (AdSense → Privacy & messaging). Set
// NEXT_PUBLIC_ADS_CONSENT_READY=true only once that message is live, and
// update the Privacy Policy's advertising section at the same time.
const ADSENSE_CLIENT_ID =
  process.env.NEXT_PUBLIC_ADS_CONSENT_READY === "true" ? process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID : undefined;

export const metadata: Metadata = {
  // Without a metadataBase, Next emits relative URLs in metadata and warns at
  // build time; it's also what makes the canonical below absolute.
  metadataBase: new URL(SITE_URL),
  title: "CongTrade | Congress Trade Tracker",
  description: "Searchable U.S. Congress (House & Senate) asset trade disclosures (Periodic Transaction Reports)",
  // No `alternates.canonical` here on purpose: metadata is inherited, so a
  // canonical set in the root layout would make every page declare the
  // homepage as its canonical — telling Google that /trades is a duplicate
  // of /. Canonicals belong on individual pages or nowhere.
};

// No `dynamic = "force-dynamic"` here any more. It rendered every page afresh
// for every request, crawlers included, which is what used up Vercel's Fluid
// Active CPU. The header's sign-in controls now render in the browser
// (components/Header.tsx is a client component), so pages can be cached;
// the ones that need the visitor (account, admin, upgrade) are dynamic on
// their own because they read the session or the request.

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
