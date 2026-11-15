"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { findSenateReportAddress, senateReportPath } from "@congtrade/shared/senateReport";

interface Picked {
  key: string;
  fileName: string;
  /** The saved page, or the printed report as base64: one of the two. */
  html?: string;
  pdf?: string;
  /**
   * Found in the file, or typed in when it was not. A PDF's address is
   * printed in its footer, which the ingest reads, so it may stay empty.
   */
  reportUrl: string;
  state: "ready" | "sending" | "sent" | "duplicate" | "error";
  message?: string;
}

const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
const isHtml = (f: File) => /\.html?$/i.test(f.name) || f.type === "text/html";

/** The file as base64, without the data: prefix. */
function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Whether a file can go up as it is: a page needs its address, a PDF only a valid one if typed. */
const addressOk = (f: Picked) => (f.pdf && !f.reportUrl.trim() ? true : Boolean(senateReportPath(f.reportUrl)));

/**
 * Drop saved eFD reports here: pages saved as HTML, or reports printed to
 * PDF. A page's address is read from the file where the browser kept it;
 * where it did not, the row asks for it (copy it from the address bar of the
 * report). A PDF's address is printed in its footer and read by the ingest.
 * Uploaded reports wait for the next ingest run, which reads them.
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
        .filter((f) => isHtml(f) || isPdf(f))
        .map(async (f, i): Promise<Picked> => {
          const key = `${Date.now()}-${i}-${f.name}`;
          if (isPdf(f)) return { key, fileName: f.name, pdf: await base64(f), reportUrl: "", state: "ready" };
          const html = await f.text();
          return { key, fileName: f.name, html, reportUrl: findSenateReportAddress(html) ?? "", state: "ready" };
        })
    );
    setFiles((current) => [...current, ...picked]);
  };

  const update = (key: string, patch: Partial<Picked>) =>
    setFiles((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const send = async () => {
    setBusy(true);
    for (const f of files) {
      if (f.state === "sent" || f.state === "duplicate" || !addressOk(f)) continue;
      update(f.key, { state: "sending", message: undefined });
      try {
        const res = await fetch("/api/admin/senate-uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: f.fileName, reportUrl: f.reportUrl.trim() || undefined, html: f.html, pdf: f.pdf }),
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

  const sendable = files.filter((f) => f.state !== "sent" && f.state !== "duplicate" && addressOk(f));

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
        <span className="font-medium text-ink">Drop saved reports here</span>
        <span className="mt-1 text-xs">or click to choose them (.html or .pdf)</span>
        <input
          type="file"
          accept=".html,.htm,text/html,.pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void add(e.target.files)}
        />
      </label>

      {files.length ? (
        <ul className="mt-4 divide-y divide-line/60 rounded-md border border-line">
          {files.map((f) => {
            const valid = addressOk(f);
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
                            : !valid
                              ? f.pdf
                                ? "Not an eFD address"
                                : "Needs its address"
                              : "Ready"}
                  </span>
                </div>
                {f.state === "ready" || f.state === "error" ? (
                  <input
                    value={f.reportUrl}
                    onChange={(e) => update(f.key, { reportUrl: e.target.value, state: "ready" })}
                    placeholder={
                      f.pdf
                        ? "Address: read from the PDF's footer (or paste it here)"
                        : "https://efdsearch.senate.gov/search/view/ptr/…"
                    }
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
          {busy ? "Uploading…" : `Upload ${sendable.length || ""} ${sendable.length === 1 ? "report" : "reports"}`.replace("  ", " ")}
        </button>
      </div>
    </div>
  );
}
