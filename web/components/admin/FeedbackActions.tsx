"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Status = "new" | "read" | "done";

async function update(id: string, status: Status, note?: string): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(note === undefined ? { id, status } : { id, status, note }),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? `Failed (${res.status})`;
  } catch {
    return "Could not reach the server.";
  }
}

/** One message's status buttons and the admin's own note. */
export function FeedbackActions({ id, status, note }: { id: string; status: Status; note: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState(note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = async (next: Status, withNote: boolean) => {
    setBusy(true);
    setError(null);
    const failed = await update(id, next, withNote ? draft : undefined);
    setBusy(false);
    if (failed) setError(failed);
    else startTransition(() => router.refresh());
  };

  const button =
    "rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "read" ? (
          <button type="button" disabled={busy} onClick={() => act("read", false)} className={button}>
            {status === "done" ? "Reopen" : "Mark read"}
          </button>
        ) : null}
        {status !== "done" ? (
          <button type="button" disabled={busy} onClick={() => act("done", false)} className={button}>
            Done
          </button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your note (only you see this)"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint"
        />
        {draft !== (note ?? "") ? (
          <button type="button" disabled={busy} onClick={() => act(status, true)} className={button}>
            Save note
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
