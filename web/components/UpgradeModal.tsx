"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "@/components/Link";
import { useProMirror } from "@/lib/useProMirror";
import { ProInAppSteps } from "./ProInAppSteps";

/**
 * The wall a locked filter or the alert offer opens.
 *
 * Pro is sold in the app, so this does not sell anything: it says where to get
 * Pro, and that buying it there opens the filters here as well, on the same
 * account. Someone who already has it gets a way to say so, which re-reads
 * their account and closes this the moment Pro shows up, so the filter they
 * clicked is open behind it.
 */
export function UpgradeModal({
  open,
  intent,
  onClose,
  onSignIn,
  moreHref = "/upgrade",
}: {
  open: boolean;
  intent: "filters" | "alert";
  onClose: () => void;
  onSignIn: () => void;
  /** "What's in Pro": the Pro page, carrying a half-built alert when there is one. */
  moreHref?: string;
}) {
  const { isSignedIn, user } = useUser();
  const { isPro } = useProMirror();
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  // Pro arriving, from the check below or from Clerk refreshing on its own,
  // is the end of this wall.
  useEffect(() => {
    if (open && isPro) onClose();
  }, [open, isPro, onClose]);

  // Each opening starts without the last one's "not yet".
  useEffect(() => {
    if (open) setNotYet(false);
  }, [open]);

  if (!open) return null;

  async function checkAgain() {
    setChecking(true);
    setNotYet(false);
    try {
      await user?.reload();
    } finally {
      setChecking(false);
    }
    // Still free once the account has been re-read: the effect above has not
    // closed this, so say what usually causes it.
    setNotYet(true);
  }

  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-panel p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="upgrade-modal-title" className="text-lg font-bold tracking-tight text-ink">
          {intent === "alert" ? "Alerts come with CongTrade Pro" : "Filters come with CongTrade Pro"}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          CongTrade Pro is sold in our app. Get it there, and the {intent === "alert" ? "alerts" : "filters"} on this
          website unlock as well: just use the same account here.
        </p>

        <div className="mt-5">
          <ProInAppSteps compact />
        </div>

        <div className="mt-5 border-t border-line pt-4 text-center">
          {isSignedIn ? (
            <>
              {email && (
                <p className="text-xs text-ink-faint">
                  Signed in here as <span className="text-ink-muted">{email}</span>. Use this account in the app.
                </p>
              )}
              <button
                type="button"
                onClick={checkAgain}
                disabled={checking}
                className="mt-3 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {checking ? "Checking…" : "I have Pro in the app"}
              </button>
              {notYet && (
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  This account doesn&rsquo;t have Pro yet. Check that the app is signed in with{" "}
                  {email ? <span className="text-ink">{email}</span> : "this same account"}, then try again.
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Already have Pro? Sign in
            </button>
          )}
          <div className="mt-3 flex items-center justify-center gap-4 text-xs">
            <Link href={moreHref} onClick={onClose} className="text-ink-muted underline decoration-line-strong hover:text-ink">
              What&rsquo;s in Pro
            </Link>
            <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink-muted">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
