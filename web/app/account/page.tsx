import type { Metadata } from "next";
import Link from "@/components/Link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { Cong } from "@/components/Cong";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AlertsManager } from "@/components/AlertsManager";
import { ManagePlanButton } from "@/components/ManagePlanButton";
import { hasProServer } from "@/lib/access";
import { getSubscriptions, grantsAccess, type SubscriptionRow } from "@/lib/subscription";
import { healProMirror } from "@/lib/subscriptionWrite";

/**
 * Where a subscription is managed: the one that bills it. Pro bought in the
 * app is the App Store's or Google Play's to change or cancel, and only a
 * website subscription has Stripe's portal behind it. Null for Pro with no
 * subscription behind it (a comped account), which has nothing to manage.
 */
function manageLinkFor(row: SubscriptionRow | undefined): { href: string; label: string } | "stripe" | null {
  if (!row) return null;
  if (row.provider === "stripe") return "stripe";
  if (row.provider === "apple") return { href: "https://apps.apple.com/account/subscriptions", label: "Manage in the App Store" };
  const sku = row.product_id ? `sku=${encodeURIComponent(row.product_id)}&` : "";
  return {
    href: `https://play.google.com/store/account/subscriptions?${sku}package=com.congtrade.app`,
    label: "Manage in Google Play",
  };
}

export const metadata: Metadata = {
  title: "Your account | CongTrade",
  description: "Manage your CongTrade plan and email alerts.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  // Both are safe to call signed-out (they resolve to null / false) — the
  // page renders the signed-out shell in that case, and layout.tsx already
  // forces dynamic rendering, so there's no prerender to worry about.
  const user = await currentUser();
  const rows = user ? await getSubscriptions(user.id) : [];
  const isPro = await hasProServer();
  // Someone who bought Pro in the app before every purchase updated the
  // website's mirror is put right here, so their filters open (see healProMirror).
  if (user) await healProMirror(user.id, rows, user.publicMetadata);
  const manage = manageLinkFor(rows.find((row) => grantsAccess(row)));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Your account</h1>

        <SignedOut>
          <Cong mood="welcome-back" width={96} className="mt-5" />
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
                      <span className="font-medium text-accent">CongTrade Pro</span>: filters, email alerts, and no ads.
                    </>
                  ) : (
                    <>Free: search and browse. Filters, email alerts and an ad-free view are Pro.</>
                  )}
                </p>
                {user?.primaryEmailAddress?.emailAddress && (
                  <p className="mt-1 text-xs text-ink-faint">
                    Signed in as {user.primaryEmailAddress.emailAddress} ·{" "}
                    <Link href="/account/profile" className="underline hover:text-ink">
                      Profile, email and password
                    </Link>
                  </p>
                )}
              </div>
              {/* A subscriber manages it where it bills; everyone else is
                  shown how to get Pro, which is sold in the app. */}
              {isPro ? (
                manage === "stripe" ? (
                  <ManagePlanButton className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink" />
                ) : manage ? (
                  <a
                    href={manage.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {manage.label}
                  </a>
                ) : null
              ) : (
                <Link
                  href="/upgrade"
                  className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Get Pro in the app
                </Link>
              )}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-ink">Email alerts</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">
              Tell CongTrade exactly which disclosures matter to you (a chamber, a party, a member, a ticker, a minimum
              trade size) and get an email when a new filing matches.
            </p>
            <AlertsManager />
          </section>
        </SignedIn>
      </main>
      <Footer />
    </>
  );
}
