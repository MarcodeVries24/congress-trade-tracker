import type { Metadata } from "next";

// The page itself is a client component (it owns search, sort and paging
// state), and a client component can't export metadata — hence this layout,
// same arrangement /about uses.
export const metadata: Metadata = {
  title: "Issuers — companies Congress trades | CongTrade",
  description:
    "Every company disclosed in a Congressional stock trade, with how many members have traded it, an estimated volume and its market cap. Built from official Periodic Transaction Reports.",
  alternates: { canonical: "/issuers" },
};

export default function IssuersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
