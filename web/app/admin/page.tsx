import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FilingDecision, ApproveAll } from "@/components/admin/FilingDecision";
import { adminUserId } from "@/lib/admin";
import { sql } from "@/lib/db";
import { formatDate, formatDateFromTimestamp } from "@/lib/format";
import { memberDisplayName } from "@/lib/memberDisplay";

export const metadata: Metadata = {
  title: "Admin | CongTrade",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Filings shown at once. The rest wait their turn; the count says how many.
const PAGE = 50;

interface PendingFiling {
  doc_id: string;
  chamber: "house" | "senate";
  member_name: string;
  bioguide_id: string | null;
  state_district: string | null;
  filing_date: string | null;
  pdf_url: string;
  ingested_at: string;
  transaction_count: number;
}

interface PendingTrade {
  id: number;
  doc_id: string;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
  owner: string | null;
  transaction_type: string;
  transaction_date: string | null;
  amount_range: string | null;
}

interface ReviewFiling {
  doc_id: string;
  chamber: "house" | "senate";
  member_name: string;
  bioguide_id: string | null;
  filing_date: string | null;
  parse_status: string;
  transaction_count: number;
  pdf_url: string;
}

const TYPE_LABEL: Record<string, string> = { P: "Purchase", S: "Sale", E: "Exchange" };
const typeLabel = (code: string) => (/partial/i.test(code) ? "Partial sale" : (TYPE_LABEL[code[0]] ?? code));

const OWNER_LABEL: Record<string, string> = { SP: "Spouse", JT: "Joint", DC: "Child" };

const REVIEW_LABEL: Record<string, string> = {
  flagged: "Sent from here",
  ocr: "Scan, OCR draft",
  empty: "Scan, nothing read",
  unsupported: "Paper filing",
};

/**
 * Every filing the pipeline has parsed but nobody has approved, with what it
 * read, and the two decisions: Approve publishes it everywhere at once;
 * Manual review holds it back for the scan to be read by eye. Below, what is
 * already in that manual queue.
 *
 * Only for the admin (see lib/admin.ts); anyone else gets the site's 404.
 */
export default async function AdminPage() {
  if (!(await adminUserId())) notFound();

  const [pending, [{ count: pendingTotal }], review, [{ count: reviewTotal }]] = (await Promise.all([
    sql.query(
      `SELECT doc_id, chamber, member_name, bioguide_id, state_district, filing_date, pdf_url, ingested_at, transaction_count
       FROM filings
       WHERE parse_status IN ('ok', 'manual') AND approved_at IS NULL
       ORDER BY ingested_at ASC, doc_id
       LIMIT ${PAGE}`
    ),
    sql.query(`SELECT COUNT(*)::int AS count FROM filings WHERE parse_status IN ('ok', 'manual') AND approved_at IS NULL`),
    sql.query(
      `SELECT doc_id, chamber, member_name, bioguide_id, filing_date, parse_status, transaction_count, pdf_url
       FROM filings
       WHERE parse_status IN ('flagged', 'ocr', 'empty', 'unsupported')
       ORDER BY ingested_at DESC
       LIMIT ${PAGE}`
    ),
    sql.query(`SELECT COUNT(*)::int AS count FROM filings WHERE parse_status IN ('flagged', 'ocr', 'empty', 'unsupported')`),
  ])) as [PendingFiling[], { count: number }[], ReviewFiling[], { count: number }[]];

  const docIds = pending.map((f) => f.doc_id);
  const [trades, issues] = docIds.length
    ? ((await Promise.all([
        sql.query(
          `SELECT id, doc_id, asset_name, ticker, asset_type_code, owner, transaction_type, transaction_date, amount_range
           FROM transactions WHERE doc_id = ANY($1) ORDER BY doc_id, id`,
          [docIds]
        ),
        sql.query(`SELECT doc_id, raw_text FROM parse_issues WHERE doc_id = ANY($1) ORDER BY id`, [docIds]),
      ])) as [PendingTrade[], { doc_id: string; raw_text: string }[]])
    : [[], []];

  const tradesOf = (docId: string) => trades.filter((t) => t.doc_id === docId);
  const issuesOf = (docId: string) => issues.filter((i) => i.doc_id === docId);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Filings to approve</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {pendingTotal === 0
                ? "Nothing waiting. New filings appear here after each check, and only go live once approved."
                : `${pendingTotal} waiting, oldest first${pendingTotal > PAGE ? `, ${PAGE} shown` : ""}. Nothing here is on the site or in anyone's alerts until approved.`}
            </p>
          </div>
          {pending.length > 1 ? <ApproveAll docIds={docIds} /> : null}
        </div>

        <div className="mt-6 space-y-4">
          {pending.map((f) => {
            const rows = tradesOf(f.doc_id);
            const notes = issuesOf(f.doc_id);
            return (
              <section key={f.doc_id} className="rounded-lg border border-line bg-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      {memberDisplayName({ member_name: f.member_name, bioguide_id: f.bioguide_id })}
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {f.chamber === "senate" ? "Senate" : "House"}
                      {f.state_district ? ` · ${f.state_district}` : ""} · Filed {formatDate(f.filing_date)} · Found{" "}
                      {formatDateFromTimestamp(f.ingested_at)} · {f.transaction_count}{" "}
                      {f.transaction_count === 1 ? "transaction" : "transactions"} ·{" "}
                      <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                        Open filing ↗
                      </a>{" "}
                      <span className="text-ink-faint">({f.doc_id})</span>
                    </p>
                  </div>
                  <FilingDecision docId={f.doc_id} />
                </div>

                {rows.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                          <th className="py-1.5 pr-3 font-medium">Type</th>
                          <th className="py-1.5 pr-3 font-medium">Asset</th>
                          <th className="py-1.5 pr-3 font-medium">Owner</th>
                          <th className="py-1.5 pr-3 font-medium">Traded</th>
                          <th className="py-1.5 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((t) => (
                          <tr key={t.id} className="border-b border-line/60 last:border-0">
                            <td className="py-1.5 pr-3 whitespace-nowrap text-ink">{typeLabel(t.transaction_type)}</td>
                            <td className="py-1.5 pr-3 text-ink">
                              {t.ticker ? <span className="font-semibold">{t.ticker} </span> : null}
                              <span className="text-ink-muted">{t.asset_name}</span>
                              {t.asset_type_code && t.asset_type_code !== "ST" ? (
                                <span className="ml-1 text-xs text-ink-faint">[{t.asset_type_code}]</span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-ink-muted">
                              {t.owner ? (OWNER_LABEL[t.owner] ?? t.owner) : "Self"}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-ink-muted">{formatDate(t.transaction_date)}</td>
                            <td className="py-1.5 whitespace-nowrap text-ink">{t.amount_range ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">No transactions read: a filing that reports nothing.</p>
                )}

                {notes.length ? (
                  <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <p className="font-semibold">The parser could not place {notes.length === 1 ? "one line" : `${notes.length} lines`}:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {notes.slice(0, 5).map((n, i) => (
                        <li key={i} className="break-words">{n.raw_text.slice(0, 200)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <h2 className="mt-12 text-lg font-bold tracking-tight text-ink">In manual review ({reviewTotal})</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Read by eye before publishing: the ones sent from here, and scans the parser could not read reliably.
          Published with <code className="text-xs">npm run review:approve -- &lt;docId&gt;</code> once checked.
        </p>
        {review.length ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-panel">
            <table className="w-full min-w-[560px] text-left text-sm">
              <tbody>
                {review.map((f) => (
                  <tr key={f.doc_id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2 text-ink">{memberDisplayName({ member_name: f.member_name, bioguide_id: f.bioguide_id })}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">{f.chamber === "senate" ? "Senate" : "House"}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">Filed {formatDate(f.filing_date)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">{REVIEW_LABEL[f.parse_status] ?? f.parse_status}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">
                      {f.transaction_count ? `${f.transaction_count} draft rows` : "no rows"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                        Open ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Empty.</p>
        )}
      </main>
      <Footer />
    </>
  );
}
