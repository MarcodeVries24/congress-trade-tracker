import type { Metadata } from "next";
import { ClerkThemeProvider } from "@/components/ClerkThemeProvider";
import "./globals.css";

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
        </head>
        <body>{children}</body>
      </html>
    </ClerkThemeProvider>
  );
}
