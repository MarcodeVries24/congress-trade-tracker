import Link from "@/components/Link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Cong } from "@/components/Cong";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
        <Cong mood="no-results" width={140} />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">This page isn&rsquo;t here</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The link may be old, or the trade it pointed to was re-read from its filing and has a new address.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Go to the dashboard
          </Link>
          <Link
            href="/trades"
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Browse all trades
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
