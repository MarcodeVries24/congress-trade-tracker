import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { UnsubscribeConfirm } from "@/components/UnsubscribeConfirm";

export const metadata: Metadata = {
  title: "Unsubscribe — CongTrade",
  description: "Turn off a CongTrade email alert.",
  // An unsubscribe link should never be followed by a crawler, and there is
  // nothing here worth indexing.
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Turn off this alert</h1>
        {token ? (
          <UnsubscribeConfirm token={token} />
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            This link is missing its unsubscribe code. Open the link from the bottom of the alert email again, or manage
            every alert from your{" "}
            <a href="/account" className="text-accent underline decoration-line-strong hover:decoration-current">
              account screen
            </a>
            .
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
