import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | CongTrade",
  description:
    "What CongTrade is, where its Congressional stock trade data comes from, how dollar amounts are estimated, and how the site's automated disclosure pipeline works.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
