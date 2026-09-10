import type { Metadata } from "next";
import { PricingTable } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Upgrade — CongTrade",
  description: "Unlock filters, alerts, and an ad-free view of CongTrade.",
};

export default function UpgradePage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Upgrade to CongTrade Pro</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Filter trades by member, ticker, type, owner, size, market cap, and date, save searches as email alerts, and
          browse without ads.
        </p>
        <div className="mt-8">
          <PricingTable />
        </div>
      </main>
      <Footer />
    </>
  );
}
