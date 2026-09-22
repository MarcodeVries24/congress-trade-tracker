import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AlertsManager } from "@/components/AlertsManager";
import { hasProServer } from "@/lib/access";

export const metadata: Metadata = {
  title: "Your account — CongTrade",
  description: "Manage your CongTrade plan and email alerts.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  // Both are safe to call signed-out (they resolve to null / false) — the
  // page renders the signed-out shell in that case, and layout.tsx already
  // forces dynamic rendering, so there's no prerender to worry about.
  const user = await currentUser();
  const isPro = await hasProServer();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Your account</h1>

        <SignedOut>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Sign in to manage your plan and your email alerts.
          </p>
          <SignInButton mode="modal">
            <button className="mt-5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              Sign in
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <section className="mt-6 rounded-lg border border-line bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Plan</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {isPro ? (
                    <>
                      <span className="font-medium text-accent">CongTrade Pro</span> — filters, email alerts, and no ads.
                    </>
                  ) : (
                    <>Free — search and browse. Filters, email alerts and an ad-free view are Pro.</>
                  )}
                </p>
                {user?.primaryEmailAddress?.emailAddress && (
                  <p className="mt-1 text-xs text-ink-faint">Signed in as {user.primaryEmailAddress.emailAddress}</p>
                )}
              </div>
              <Link
                href="/upgrade"
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isPro
                    ? "border border-line text-ink-muted hover:border-line-strong hover:text-ink"
                    : "bg-accent text-white hover:opacity-90"
                }`}
              >
                {isPro ? "Manage plan" : "Upgrade to Pro"}
              </Link>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-ink">Email alerts</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Tell CongTrade exactly which disclosures matter to you — a chamber, a party, a member, a ticker, a minimum
              trade size — and get an email when a new filing matches.
            </p>
            <AlertsManager />
          </section>
        </SignedIn>
      </main>
      <Footer />
    </>
  );
}
