import type { Metadata } from "next";
import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { InfoTip } from "@/components/InfoTip";
import { MemberPhoto } from "@/components/MemberPhoto";
import { TickerLogo } from "@/components/TickerLogo";
import { TradeWindowChart } from "@/components/TradeWindowChart";
import { alertDraftHref } from "@/lib/alertsClient";
import { amountLabel, ASSET_TYPE_LABELS, displayAssetName, ownerLabel } from "@/lib/api";
import { formatDate, isPartialSale, PARTIAL_SALE_NOTE, typeBadge } from "@/lib/format";
import { memberDisplayName } from "@/lib/memberDisplay";
import {
  formatMove,
  SINCE_TRADE_NOTE,
  moveBeforeDisclosure,
  moveSinceDisclosure,
  moveSinceTrade,
} from "@/lib/priceMath";
import { getPriceSeries } from "@/lib/priceSeries";
import { getTrade, type TradeDetail } from "@/lib/trade";
import { issuerSlug } from "@/lib/issuerSlug";


/**
 * One trade: what was traded and by whom, what the stock did while the trade
 * was still undisclosed and since, the dates whose gaps are the point of a
 * disclosure, and the rest of the filing it came in. The website's version of
 * the app's trade screen, linked from every trade list.
 *
 * Not indexed: the id in the URL changes when a filing is re-processed (see
 * lib/trade.ts), and the member and company pages are the durable ones.
 */

const LATE_DAYS = 45;
// Days of price either side of the trade-to-disclosure stretch in the close-up.
const MARGIN_DAYS = 30;

function offset(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
}

function verbOf(type: string): string {
  if (/^P/i.test(type)) return "bought";
  if (isPartialSale(type)) return "sold part of";
  if (/^S/i.test(type)) return "sold";
  if (/^E/i.test(type)) return "exchanged";
  return "traded";
}

function partyColor(party: string | null): string {
  const p = (party ?? "").toLowerCase();
  if (p.startsWith("d")) return "text-sky-600 dark:text-sky-400";
  if (p.startsWith("r")) return "text-rose-600 dark:text-rose-400";
  if (p.startsWith("i")) return "text-violet-600 dark:text-violet-400";
  return "text-ink-faint";
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = await getTrade(Number(id));
  if (!found) return { title: "Trade not found | CongTrade", robots: { index: false } };
  const t = found.trade;
  const title = `${memberDisplayName(t)} ${verbOf(t.transaction_type)} ${t.ticker ?? displayAssetName(t)} | CongTrade`;
  return {
    title,
    description: `${amountLabel(t.amount_range)}, traded ${formatDate(t.transaction_date)} and disclosed ${formatDate(t.filing_date)}, from the member's Periodic Transaction Report.`,
    robots: { index: false, follow: true },
  };
}

export default async function TradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ id }, { range: rangeParam }] = await Promise.all([params, searchParams]);
  const found = await getTrade(Number(id));
  if (!found) notFound();
  const { trade: t, siblings } = found;

  const name = memberDisplayName(t);
  const asset = displayAssetName(t);
  const badge = typeBadge(t.transaction_type);
  const late = t.days_to_file !== null && t.days_to_file > LATE_DAYS;
  const kind = /^P/i.test(t.transaction_type) ? "buy" : /^S/i.test(t.transaction_type) ? "sell" : "other";

  const before = moveBeforeDisclosure(t);
  const since = moveSinceDisclosure(t);
  const overall = moveSinceTrade(t);
  // Since the trade, counted in the member's favour: the rise since a
  // purchase, the fall since a sale. The page's headline figure.
  const edgeNow = overall === null || kind === "other" ? null : kind === "buy" ? overall : -overall;
  const priced = Boolean(t.ticker && t.transaction_date && (before !== null || overall !== null));

  // To today by default, since that is the headline figure; the close-up
  // around the trade is one tap away.
  const range = rangeParam === "around" ? "around" : "today";
  const series =
    priced && t.ticker && t.transaction_date ? await getPriceSeries(t.ticker, offset(t.transaction_date, -MARGIN_DAYS)) : null;
  const aroundEnd = t.filing_date ? offset(t.filing_date, MARGIN_DAYS) : null;
  const shown = series && range === "around" && aroundEnd ? series.filter((p) => p.d <= aroundEnd) : series;
  const canToggle = Boolean(series && aroundEnd && series.filter((p) => p.d > aroundEnd).length > 20);

  const alertHref = t.ticker ? alertDraftHref({ tickers: [t.ticker] }) : null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center text-xs text-ink-faint">
          <Link href="/trades" className="hover:text-ink-muted">
            Trades
          </Link>
          <span className="mx-1.5">/</span>
          {t.member_slug ? (
            <Link href={`/politicians/${t.member_slug}`} className="hover:text-ink-muted">
              {name}
            </Link>
          ) : (
            <span>{name}</span>
          )}
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{t.ticker ?? asset}</span>
        </nav>

        {/* What happened, in one line, with the amount beside it. */}
        <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-start gap-4">
            {t.ticker ? <TickerLogo ticker={t.ticker} size={56} /> : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  title={badge.title}
                  className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
                {late ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Disclosed late
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
                {name} {verbOf(t.transaction_type)} {asset}
                {t.ticker ? <span className="font-mono text-ink-muted"> ({t.ticker})</span> : null}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Disclosed amount <span className="font-semibold text-ink">{amountLabel(t.amount_range)}</span>
                {t.owner ? ` · owned by ${ownerLabel(t.owner).toLowerCase()}` : ""}
              </p>
              {isPartialSale(t.transaction_type) ? <p className="mt-1 text-xs text-ink-faint">{PARTIAL_SALE_NOTE}</p> : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {t.ticker ? (
              <Link
                href={`/issuers/${issuerSlug(t.ticker)}`}
                className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink hover:border-line-strong"
              >
                All {t.ticker} trades
              </Link>
            ) : null}
            {t.member_slug ? (
              <Link
                href={`/politicians/${t.member_slug}`}
                className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink hover:border-line-strong"
              >
                {name.endsWith("s") ? `${name}’` : `${name}’s`} trades
              </Link>
            ) : null}
            {alertHref ? (
              <Link
                href={alertHref}
                className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:opacity-90"
              >
                Alert me when {t.ticker} is traded
              </Link>
            ) : null}
          </div>
        </section>

        {priced ? (
          <section className="mt-5 rounded-xl border border-line bg-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-base font-semibold text-ink">
                  Since the trade
                  <InfoTip text={SINCE_TRADE_NOTE} />
                </h2>
                {overall !== null ? (
                  <p className="mt-1 max-w-xl text-sm text-ink-muted">
                    From {money(t.price_at_trade!)} on the day of the trade to {money(t.price_now!)} at the latest close (
                    {formatDate(t.price_now_day ?? null)})
                    {kind === "sell"
                      ? `: the stock has ${overall < 0 ? "fallen" : "risen"} ${formatMove(Math.abs(overall)).replace("+", "")} since they sold.`
                      : "."}
                    {before !== null && t.days_to_file ? (
                      <>
                        {" "}
                        When it was disclosed, {t.days_to_file} {t.days_to_file === 1 ? "day" : "days"} later
                        {late ? ` (past the ${LATE_DAYS} days the law allows)` : ""}, it stood at {money(t.price_at_filing!)},{" "}
                        {formatMove(before)} from the trade.
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {edgeNow !== null ? (
                <div className="text-right">
                  <div
                    className={`text-3xl font-bold tabular-nums sm:text-4xl ${edgeNow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                  >
                    {formatMove(edgeNow)}
                  </div>
                  <div className="text-xs font-semibold text-ink-muted">
                    {kind === "sell" ? "since they sold" : "since they bought"} ·{" "}
                    {edgeNow >= 0 ? "✓ went their way" : "went against them"}
                  </div>
                </div>
              ) : null}
            </div>

            {shown && shown.length > 4 && t.transaction_date ? (
              <div className="mt-4">
                {canToggle ? (
                  <div className="mb-2 inline-flex rounded-full border border-line p-0.5 text-xs">
                    {(["around", "today"] as const).map((r) => (
                      <Link
                        key={r}
                        href={`?range=${r}`}
                        scroll={false}
                        className={`rounded-full px-3 py-1 ${range === r ? "bg-ink text-panel" : "text-ink-muted hover:text-ink"}`}
                      >
                        {r === "around" ? "Around the trade" : "To today"}
                      </Link>
                    ))}
                  </div>
                ) : null}
                <TradeWindowChart points={shown} traded={t.transaction_date} filed={t.filing_date} kind={kind} />
              </div>
            ) : null}

            <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <MoveStat
                label="Stock since the trade"
                move={overall}
                note={t.price_now != null ? `${money(t.price_now)} at the close on ${formatDate(t.price_now_day ?? null)}` : null}
              />
              <MoveStat
                label="Stock before disclosure"
                move={before}
                note={
                  t.days_to_file
                    ? `the ${t.days_to_file} ${t.days_to_file === 1 ? "day" : "days"} only the member knew about`
                    : "disclosed the same day"
                }
              />
              <MoveStat
                label="Stock since disclosure"
                move={since}
                note={t.price_at_filing != null ? `from ${money(t.price_at_filing)} when it became public` : null}
              />
            </dl>
            <p className="mt-3 text-xs text-ink-faint">
              Daily closing prices, split-adjusted. The filing gives a value range, not the price the member paid or
              received, and a move in their favour is not evidence of anything.
            </p>
          </section>
        ) : null}

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
          <section className="rounded-xl border border-line bg-panel p-5">
            <h2 className="text-base font-semibold text-ink">Who</h2>
            <div className="mt-3 flex items-center gap-3">
              <MemberPhoto name={name} photoUrl={t.photo_url} />
              <div className="min-w-0">
                {t.member_slug ? (
                  <Link href={`/politicians/${t.member_slug}`} className="font-medium text-ink hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{name}</span>
                )}
                <div className="text-xs">
                  <span className={partyColor(t.party)}>{t.party ?? "Unknown party"}</span>
                  <span className="text-ink-faint">
                    {" · "}
                    {t.chamber === "senate" ? "Senate" : "House"}
                    {t.member_state ? ` · ${t.member_state}` : t.state_district ? ` · ${t.state_district}` : ""}
                  </span>
                </div>
              </div>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Asset type" value={t.asset_type_code ? (ASSET_TYPE_LABELS[t.asset_type_code] ?? t.asset_type_code) : null} />
              <Row label="Owner" value={ownerLabel(t.owner)} />
              <Row label="As filed" value={t.asset_name} />
            </dl>
          </section>

          <section className="rounded-xl border border-line bg-panel p-5">
            <h2 className="text-base font-semibold text-ink">Timeline</h2>
            <ol className="mt-3 space-y-3 text-sm">
              <Step label="Traded" date={t.transaction_date} />
              <Step label="Member notified" date={t.notification_date} />
              <Step
                label="Disclosed publicly"
                date={t.filing_date}
                note={
                  t.days_to_file !== null
                    ? `${t.days_to_file} ${t.days_to_file === 1 ? "day" : "days"} after the trade${late ? ", later than the law allows" : ""}`
                    : null
                }
                warn={late}
              />
            </ol>
            <a
              href={t.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm text-accent underline decoration-line-strong hover:decoration-current"
            >
              Read the original filing (PDF)
            </a>
          </section>
        </div>

        {siblings.length ? <Siblings rows={siblings} /> : null}
      </main>
      <Footer />
    </>
  );
}

function MoveStat({ label, move, note }: { label: string; move: number | null; note: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd
        className={`text-lg font-semibold tabular-nums ${move === null ? "text-ink-faint" : move >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
      >
        {move === null ? "–" : formatMove(move)}
      </dd>
      {note ? <dd className="text-xs text-ink-faint">{note}</dd> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink-muted">{value}</dd>
    </div>
  );
}

function Step({ label, date, note, warn }: { label: string; date: string | null; note?: string | null; warn?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${warn ? "bg-amber-500" : "bg-accent"}`} />
      <div>
        <div className="text-xs text-ink-faint">{label}</div>
        <div className="font-medium text-ink">{date ? formatDate(date) : "Not stated"}</div>
        {note ? <div className={`text-xs ${warn ? "text-amber-600 dark:text-amber-400" : "text-ink-faint"}`}>{note}</div> : null}
      </div>
    </li>
  );
}

/** The rest of the filing this trade came in, each one a link to its own page. */
function Siblings({ rows }: { rows: TradeDetail[] }) {
  const anyPartial = rows.some((r) => isPartialSale(r.transaction_type));
  return (
    <section className="mt-5 rounded-xl border border-line bg-panel">
      <h2 className="px-5 pt-5 text-base font-semibold text-ink">Also in this filing</h2>
      <ul className="mt-2 divide-y divide-line/60">
        {rows.map((r) => {
          const b = typeBadge(r.transaction_type);
          return (
            <li key={r.id}>
              <Link href={`/trades/${r.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-panel-muted">
                {r.ticker ? <TickerLogo ticker={r.ticker} size={28} /> : <span className="h-7 w-7 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{displayAssetName(r)}</div>
                  <div className="text-xs text-ink-faint">
                    {amountLabel(r.amount_range)} · traded {formatDate(r.transaction_date)}
                  </div>
                </div>
                <span title={b.title} className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${b.className}`}>
                  {b.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {anyPartial ? <p className="px-5 pb-4 text-xs text-ink-faint">{PARTIAL_SALE_NOTE}</p> : <div className="pb-2" />}
    </section>
  );
}
