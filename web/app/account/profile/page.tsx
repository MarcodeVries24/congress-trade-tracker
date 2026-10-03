import type { Metadata } from "next";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut, UserProfile } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Profile, email and password | CongTrade",
  description: "Change the name, photo, email address and password on your CongTrade account.",
  robots: { index: false, follow: false },
};

/**
 * Clerk's own profile editor, on a page of ours: name, photo, email addresses,
 * password and connected sign-ins. The app links here for the email and
 * password, which need a verification step it does not build itself.
 *
 * Hash routing, so Clerk's inner pages need no catch-all route under this one.
 */
export default function ProfilePage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/account" className="text-sm text-ink-muted transition-colors hover:text-ink">
          ← Your account
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Profile, email and password</h1>

        <SignedOut>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">Sign in to change your account details.</p>
          <SignInButton mode="modal">
            <button className="mt-5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
              Sign in
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <div className="mt-6">
            <UserProfile routing="hash" />
          </div>
        </SignedIn>
      </main>
      <Footer />
    </>
  );
}
