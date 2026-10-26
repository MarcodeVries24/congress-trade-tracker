"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { findSenateReportAddress, senateReportPath } from "@congtrade/shared/senateReport";

interface Picked {
  key: string;
  fileName: string;
  html: string;
  /** Found in the file, or typed in when it was not. */
  reportUrl: string;
  state: "ready" | "sending" | "sent" | "duplicate" | "error";
  message?: string;
}

/**
 * Drop saved eFD report pages here. Each file's report address is read from
 * the file where the browser kept it; where it did not, the row asks for it
 * (copy it from the address bar of the report). Uploaded pages wait for the
 * next ingest run, which reads them.
 */
export function SenateUploader() {
  const router = useRouter();
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [, startTransition] = useTransition();

  const add = async (list: FileList | null) => {
    if (!list) return;
    const picked = await Promise.all(
      Array.from(list)
        .filter((f) => /\.html?$/i.test(f.name) || f.type === "text/html")
        .map(async (f, i) => {
          const html = await f.text();
          return {
            key: `${Date.now()}-${i}-${f.name}`,
            fileName: f.name,
            html,
            reportUrl: findSenateReportAddress(html) ?? "",
            state: "ready" as const,
          };
        })
    );
    setFiles((current) => [...current, ...picked]);
  };

  const update = (key: string, patch: Partial<Picked>) =>
    setFiles((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const send = async () => {
    setBusy(true);
    for (const f of files) {
      if (f.state === "sent" || f.state === "duplicate" || !senateReportPath(f.reportUrl)) continue;
      update(f.key, { state: "sending", message: undefined });
      try {
        const res = await fetch("/api/admin/senate-uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: f.fileName, reportUrl: f.reportUrl, html: f.html }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; duplicate?: boolean };
        if (!res.ok) update(f.key, { state: "error", message: data.error ?? `Failed (${res.status})` });
        else update(f.key, { state: data.duplicate ? "duplicate" : "sent" });
      } catch {
        update(f.key, { state: "error", message: "Could not reach the server." });
      }
    }
    setBusy(false);
    startTransition(() => router.refresh());
  };

  const sendable = files.filter((f) => f.state !== "sent" && f.state !== "duplicate" && senateReportPath(f.reportUrl));

  return (
    <div className="mt-6 rounded-lg border border-line bg-panel p-4 sm:p-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void add(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center text-sm ${
          dragging ? "border-accent text-ink" : "border-line text-ink-muted"
        }`}
      >
        <span className="font-medium text-ink">Drop saved report pages here</span>
        <span className="mt-1 text-xs">or click to choose them (.html)</span>
        <input type="file" accept=".html,.htm,text/html" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      </label>

      {files.length ? (
        <ul className="mt-4 divide-y divide-line/60 rounded-md border border-line">
          {files.map((f) => {
            const valid = Boolean(senateReportPath(f.reportUrl));
            return (
              <li key={f.key} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink">{f.fileName}</span>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {f.state === "sent"
                      ? "Uploaded"
                      : f.state === "duplicate"
                        ? "Already waiting"
                        : f.state === "sending"
                          ? "Uploading…"
                          : f.state === "error"
                            ? "Failed"
                            : valid
                              ? "Ready"
                              : "Needs its address"}
                  </span>
                </div>
                {f.state === "ready" || f.state === "error" ? (
                  <input
                    value={f.reportUrl}
                    onChange={(e) => update(f.key, { reportUrl: e.target.value, state: "ready" })}
                    placeholder="https://efdsearch.senate.gov/search/view/ptr/…"
                    className={`mt-1.5 block w-full rounded-md border bg-panel px-2 py-1 text-xs text-ink ${
                      valid ? "border-line" : "border-amber-500"
                    }`}
                  />
                ) : null}
                {f.message ? <p className="mt-1 text-xs text-red-500">{f.message}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          Read at the next ingest run (every 4 hours), then waiting for approval in the admin panel.
        </p>
        <button
          type="button"
          disabled={busy || sendable.length === 0}
          onClick={send}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Uploading…" : `Upload ${sendable.length || ""} ${sendable.length === 1 ? "page" : "pages"}`.replace("  ", " ")}
        </button>
      </div>
    </div>
  );
}
