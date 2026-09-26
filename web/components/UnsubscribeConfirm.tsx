"use client";

import { useState } from "react";

/**
 * The confirmation step behind the email footer's unsubscribe link.
 *
 * The click itself doesn't turn anything off — this button's POST does. A
 * link that deactivated on GET would fire on every mailbox prefetch and link
 * scanner (see app/api/alerts/unsubscribe/route.ts), switching alerts off
 * for people who never clicked.
 */
export function UnsubscribeConfirm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function confirm() {
    setState("working");
    try {
      const res = await fetch(`/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-4 rounded-lg border border-line bg-panel p-4">
        <p className="text-sm text-ink">This alert is off. You won&apos;t get any more emails from it.</p>
        <p className="mt-2 text-sm text-ink-muted">
          It&apos;s paused, not deleted. Turn it back on any time from your{" "}
          <a href="/account" className="text-accent underline decoration-line-strong hover:decoration-current">
            account screen
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-panel p-4">
      <p className="text-sm leading-relaxed text-ink-muted">
        Confirm below and this alert stops emailing you. Your other alerts, and your account, are unaffected.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={state === "working"}
        className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {state === "working" ? "Turning it off…" : "Turn off this alert"}
      </button>
      {state === "error" && (
        <p className="mt-3 text-sm text-red-500">Something went wrong. Try again, or turn it off from your account screen.</p>
      )}
    </div>
  );
}
