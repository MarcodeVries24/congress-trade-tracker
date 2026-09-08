import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Congress Trade Tracker",
  description: "Searchable U.S. House stock trade disclosures (Periodic Transaction Reports)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
