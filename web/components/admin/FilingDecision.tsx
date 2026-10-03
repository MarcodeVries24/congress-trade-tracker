"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Action = "approve" | "review";

async function decide(docIds: string[], action: Action): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/filings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ docIds, action }),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? `Failed (${res.status})`;
  } catch {
    return "Could not reach the server.";
  }
}

/** Approve or send to manual review: one filing's two buttons. */
export function FilingDecision({ docId }: { docId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [done, setDone] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const act = async (action: Action) => {
    setBusy(action);
    setError(null);
    const failed = await decide([docId], action);
    setBusy(null);
    if (failed) {
      setError(failed);
      return;
    }
    setDone(action);
    startTransition(() => router.refresh());
  };

  if (done) {
    return (
      <span className="text-sm font-medium text-ink-muted">
        {done === "approve" ? "Approved, now live" : "Sent to manual review"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => act("review")}
          disabled={busy !== null}
          className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          {busy === "review" ? "Sending…" : "Manual review"}
        </button>
        <button
          type="button"
          onClick={() => act("approve")}
          disabled={busy !== null}
          className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
      </div>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}

/** Approves every filing on the page, after asking once. */
export function ApproveAll({ docIds }: { docIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Approve all ${docIds.length} filings shown? They go live straight away.`)) return;
          setBusy(true);
          setError(null);
          const failed = await decide(docIds, "approve");
          setBusy(false);
          if (failed) setError(failed);
          else router.refresh();
        }}
        className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
      >
        {busy ? "Approving…" : `Approve all ${docIds.length} shown`}
      </button>
      {error ? <span className="text-xs text-red-500">{error}</span> : null}
    </div>
  );
}
