import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FilingDecision, ApproveAll } from "@/components/admin/FilingDecision";
import { Cong } from "@/components/Cong";
import { MemberPhoto } from "@/components/MemberPhoto";
import { adminUserId } from "@/lib/admin";
import { ALERT_FROM_SQL } from "@/lib/alertFilters";
import { amountLabel, displayAssetName, type Trade } from "@/lib/api";
import { sql, PLAUSIBLE_DATES_SQL } from "@/lib/db";
import { compactAmountRange, formatDate, formatDateFromTimestamp, memberLocation, typeBadge } from "@/lib/format";
import { memberDisplayName } from "@/lib/memberDisplay";
import { PRICE_JOINS_SQL } from "@/lib/prices";
import { TRADE_COLUMNS_SQL } from "@/lib/trade";

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
  photo_url: string | null;
  party: string | null;
  member_state: string | null;
}

/** A row exactly as the site would read it, plus whether the site would show it at all. */
type PendingTrade = Trade & { plausible: boolean };

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
    // The member as the site resolves them: the same two tables, the same
    // precedence (members_history by bioguide id, then the seat).
    sql.query(
      `SELECT f.doc_id, f.chamber, f.member_name, f.bioguide_id, f.state_district, f.filing_date, f.pdf_url,
              f.ingested_at, f.transaction_count,
              COALESCE(mh.photo_url, mr.photo_url) AS photo_url,
              COALESCE(mh.party, mr.party) AS party,
              COALESCE(mh.state, mr.state) AS member_state
       FROM filings f
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       LEFT JOIN members_reference mr ON mr.state_district = f.state_district
       WHERE f.parse_status IN ('ok', 'manual') AND f.approved_at IS NULL
       ORDER BY f.ingested_at ASC, f.doc_id
       LIMIT ${PAGE}`,
    ),
    sql.query(
      `SELECT COUNT(*)::int AS count FROM filings WHERE parse_status IN ('ok', 'manual') AND approved_at IS NULL`,
    ),
    sql.query(
      `SELECT doc_id, chamber, member_name, bioguide_id, filing_date, parse_status, transaction_count, pdf_url
       FROM filings
       WHERE parse_status IN ('flagged', 'ocr', 'empty', 'unsupported')
       ORDER BY ingested_at DESC
       LIMIT ${PAGE}`,
    ),
    sql.query(
      `SELECT COUNT(*)::int AS count FROM filings WHERE parse_status IN ('flagged', 'ocr', 'empty', 'unsupported')`,
    ),
  ])) as [PendingFiling[], { count: number }[], ReviewFiling[], { count: number }[]];

  const docIds = pending.map((f) => f.doc_id);
  const [trades, issues] = docIds.length
    ? ((await Promise.all([
        // The query the trade pages use, minus the publish gate: what each
        // row will look like once approved.
        sql.query(
          `SELECT ${TRADE_COLUMNS_SQL}, ${PLAUSIBLE_DATES_SQL} AS plausible
           ${ALERT_FROM_SQL} ${PRICE_JOINS_SQL}
           WHERE t.doc_id = ANY($1)
           ORDER BY t.doc_id, t.transaction_date DESC NULLS LAST, t.id`,
          [docIds],
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

        {pendingTotal === 0 ? <Cong mood="all-quiet" width={110} className="mx-auto mt-8" /> : null}

        <div className="mt-6 space-y-4">
          {pending.map((f) => {
            const rows = tradesOf(f.doc_id);
            const notes = issuesOf(f.doc_id);
            return (
              <section key={f.doc_id} className="rounded-lg border border-line bg-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberPhoto
                      name={memberDisplayName({ member_name: f.member_name, bioguide_id: f.bioguide_id })}
                      photoUrl={f.photo_url}
                      className="h-12 w-12"
                    />
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-ink">
                        {memberDisplayName({ member_name: f.member_name, bioguide_id: f.bioguide_id })}
                      </h2>
                      <p className="text-xs text-ink-muted">
                        {[
                          f.party,
                          f.chamber === "senate" ? (f.member_state ?? f.state_district) : f.state_district,
                          f.chamber === "senate" ? "Senate" : "House",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {f.photo_url ? "" : " · no photo on file"}
                        {f.bioguide_id ? "" : " · not matched to a member record"}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Filed {formatDate(f.filing_date)} · Found {formatDateFromTimestamp(f.ingested_at)} ·{" "}
                        {f.transaction_count} {f.transaction_count === 1 ? "transaction" : "transactions"} ·{" "}
                        <a
                          href={f.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-accent hover:underline"
                        >
                          Open filing ↗
                        </a>{" "}
                        <span className="text-ink-faint">({f.doc_id})</span>
                      </p>
                    </div>
                  </div>
                  <FilingDecision docId={f.doc_id} />
                </div>

                {rows.length ? (
                  <>
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-faint">
                      As visitors will see it
                    </p>
                    <ul className="mt-1.5 divide-y divide-line/60 rounded-md border border-line">
                      {rows.map((t) => {
                        const badge = typeBadge(t.transaction_type);
                        return (
                          <li key={t.id} className={`px-3 py-2.5 ${t.plausible ? "" : "bg-amber-500/10"}`}>
                            <div className="flex items-center gap-3">
                              <MemberPhoto name={t.member_name} photoUrl={t.photo_url} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-ink">{memberDisplayName(t)}</div>
                                <div className="truncate text-xs text-ink-faint">
                                  {t.ticker ? `${t.ticker} · ` : ""}
                                  {displayAssetName(t)}
                                </div>
                              </div>
                              <div className="shrink-0 whitespace-nowrap text-right">
                                <span
                                  title={badge.title}
                                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                                <div className="mt-1 text-xs text-ink-muted">
                                  {compactAmountRange(t.amount_low, t.amount_high, amountLabel(t.amount_range))}
                                </div>
                              </div>
                            </div>
                            {/* The raw reading, to check the line above against the PDF. */}
                            <p className="mt-1 pl-11 text-[11px] text-ink-faint">
                              Traded {formatDate(t.transaction_date)} ·{" "}
                              {t.owner ? (OWNER_LABEL[t.owner] ?? t.owner) : "Self"} · {t.amount_range ?? "no amount"} ·{" "}
                              {memberLocation(t) ?? "no state"}
                              {t.asset_type_code && t.asset_type_code !== "ST" ? ` · ${t.asset_type_code}` : ""}
                              {t.ticker ? "" : " · no ticker"} · as filed: {t.asset_name}
                              {t.plausible ? null : (
                                <span className="font-semibold text-amber-700 dark:text-amber-300">
                                  {" "}
                                  · hidden on the site: traded after the filing date
                                </span>
                              )}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">No transactions read: a filing that reports nothing.</p>
                )}

                {notes.length ? (
                  <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <p className="font-semibold">
                      The parser could not place {notes.length === 1 ? "one line" : `${notes.length} lines`}:
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {notes.slice(0, 5).map((n, i) => (
                        <li key={i} className="break-words">
                          {n.raw_text.slice(0, 200)}
                        </li>
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
                    <td className="px-4 py-2 text-ink">
                      {memberDisplayName({ member_name: f.member_name, bioguide_id: f.bioguide_id })}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">
                      {f.chamber === "senate" ? "Senate" : "House"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">Filed {formatDate(f.filing_date)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">
                      {REVIEW_LABEL[f.parse_status] ?? f.parse_status}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-ink-muted">
                      {f.transaction_count ? `${f.transaction_count} draft rows` : "no rows"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <a
                        href={f.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent hover:underline"
                      >
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
