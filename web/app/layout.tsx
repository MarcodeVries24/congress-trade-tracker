import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CongTrade — Congress Trade Tracker",
  description: "Searchable U.S. Congress (House & Senate) asset trade disclosures (Periodic Transaction Reports)",
};

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
