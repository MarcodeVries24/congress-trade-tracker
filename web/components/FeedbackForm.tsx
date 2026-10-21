"use client";

import { useState } from "react";
import { FEEDBACK_KIND_KEYS, FEEDBACK_KINDS, FEEDBACK_MAX_LENGTH, readFeedback, type FeedbackKind } from "@congtrade/shared/feedback";
import { Cong } from "@/components/Cong";

/**
 * The website's feedback form. Works without an account; signed in, the
 * server files it under the account and replies to the account's address
 * unless another is given.
 */
export function FeedbackForm() {
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // Hidden from people; a form-filling script fills it in (see the route).
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { kind, message, email, source: "web", screen: "feedback page", website };
    const read = readFeedback(body);
    if (!read.ok) {
      setError(read.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Could not reach CongTrade. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="mt-8 rounded-lg border border-line bg-panel p-8 text-center">
        <Cong mood="welcome-back" width={110} className="mx-auto" />
        <h2 className="mt-4 text-lg font-semibold text-ink">Thank you!</h2>
        <p className="mt-1 text-sm text-ink-muted">
          We read every message.{email.trim() ? " If it needs an answer, we'll reply by email." : ""}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5 rounded-lg border border-line bg-panel p-5 sm:p-6">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">What is it about?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FEEDBACK_KIND_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                kind === k ? "border-ink bg-ink text-panel" : "border-line text-ink-muted hover:text-ink"
              }`}
            >
              {FEEDBACK_KINDS[k]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-sm font-semibold text-ink">Your message</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={FEEDBACK_MAX_LENGTH}
          rows={6}
          placeholder="What would make CongTrade better, or what went wrong?"
          className="mt-2 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
        <span className="mt-1 block text-right text-xs text-ink-faint">
          {message.length.toLocaleString("en-US")} / {FEEDBACK_MAX_LENGTH.toLocaleString("en-US")}
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-ink">Email</span>{" "}
        <span className="text-xs text-ink-faint">(optional, only if you&rsquo;d like a reply)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-2 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink"
        />
      </label>

      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          Stored with the message: that it came from the website, and your email if you give one.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </form>
  );
}
