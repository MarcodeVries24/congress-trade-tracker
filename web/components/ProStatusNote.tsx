"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import Link from "@/components/Link";
import { useProMirror } from "@/lib/useProMirror";

/**
 * Where the visitor stands, on the Pro page.
 *
 * Someone who already has Pro (bought in the app, most likely) is told so and
 * pointed at the filters, rather than told how to buy what they own. Someone
 * signed in without it is told which account to use in the app, because that
 * is the one detail that decides whether the website unlocks afterwards.
 */
export function ProStatusNote() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isPro } = useProMirror();
  if (!isLoaded) return null;

  if (isSignedIn && isPro) {
    return (
      <p className="mt-3 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-ink">
        You have Pro on this account. The filters and alerts on this website are open.{" "}
        <Link href="/trades" className="font-medium text-accent underline decoration-accent/40 hover:decoration-current">
          Go to the trades
        </Link>
      </p>
    );
  }

  const email = user?.primaryEmailAddress?.emailAddress;
  if (isSignedIn) {
    return (
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Signed in here as <span className="text-ink-muted">{email ?? "your account"}</span>. Sign in to the app with
        the same account, so Pro opens here too.
      </p>
    );
  }

  return (
    <p className="mt-3 text-xs leading-relaxed text-ink-faint">
      Already have Pro in the app?{" "}
      <SignInButton mode="modal">
        <button type="button" className="text-ink-muted underline decoration-line-strong hover:text-ink">
          Sign in here
        </button>
      </SignInButton>{" "}
      with the same account.
    </p>
  );
}
