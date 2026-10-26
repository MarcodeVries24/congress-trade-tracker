import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Link from "@/components/Link";
import { SenateUploader } from "@/components/admin/SenateUploader";
import { adminUserId } from "@/lib/admin";
import { sql } from "@/lib/db";

export const metadata: Metadata = {
  title: "Senate import | CongTrade",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface UploadRow {
  id: string;
  created_at: string;
  file_name: string | null;
  report_url: string;
  status: "pending" | "done" | "failed";
  note: string | null;
}

const STATUS_LABEL: Record<UploadRow["status"], string> = { pending: "Waiting", done: "Read", failed: "Failed" };
const STATUS_CLASS: Record<UploadRow["status"], string> = {
  pending: "text-ink-muted",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-500",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

/**
 * Senate filings by hand: eFD's bot protection turns the automated search
 * away, so the admin saves the new report pages from an ordinary browser
 * and uploads them here; the ingest reads them on its next run.
 */
export default async function SenateImportPage() {
  if (!(await adminUserId())) notFound();

  // Empty until the ingest has created the table, rather than an error.
  const [uploads, lastSenate] = (await Promise.all([
    sql
      .query(
        `SELECT id::text, created_at, file_name, report_url, status, note
         FROM senate_uploads ORDER BY created_at DESC, id DESC LIMIT 40`
      )
      .catch(() => []),
    sql.query(`SELECT MAX(filing_date) AS last FROM filings WHERE chamber = 'senate'`).catch(() => [{ last: null }]),
  ])) as [UploadRow[], { last: string | null }[]];
  const lastFiled = lastSenate[0]?.last ?? null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/admin" className="text-sm text-ink-muted hover:text-ink">
          ← Filings to approve
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Senate import</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The Senate site turns automated visits away, so new Senate reports come in through here.
          {lastFiled ? ` The newest Senate filing in CongTrade was filed on ${lastFiled}.` : ""}
        </p>

        <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-ink">
          <li>
            Open{" "}
            <a
              href="https://efdsearch.senate.gov/search/home/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              efdsearch.senate.gov
            </a>{" "}
            (from outside the US, with a US VPN) and tick the agreement.
          </li>
          <li>
            Search with <strong>Report type: Periodic Transactions</strong> and a <strong>From</strong> date a few days
            before {lastFiled ? <strong>{lastFiled}</strong> : "the last import"}.
          </li>
          <li>
            Open each report that is new and save it: <strong>⌘S</strong>, format <strong>Webpage, HTML Only</strong>{" "}
            (Chrome) or <strong>Page Source</strong> (Safari).
          </li>
          <li>Drop the saved files below and upload them.</li>
        </ol>

        <SenateUploader />

        <h2 className="mt-10 text-lg font-bold tracking-tight text-ink">Recent uploads</h2>
        {uploads.length ? (
          <ul className="mt-3 divide-y divide-line/60 rounded-lg border border-line bg-panel">
            {uploads.map((u) => (
              <li key={u.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={u.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-ink hover:underline"
                  >
                    {u.file_name ?? u.report_url}
                  </a>
                  <span className={`text-xs font-medium ${STATUS_CLASS[u.status]}`}>
                    {STATUS_LABEL[u.status]} · {when(u.created_at)}
                  </span>
                </div>
                {u.note ? <p className="mt-1 text-xs text-ink-muted">{u.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Nothing uploaded yet.</p>
        )}
      </main>
      <Footer />
    </>
  );
}
