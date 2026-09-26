import { amountLabel } from "@/lib/api";
import { formatDate, typeBadge } from "@/lib/format";
import { memberDisplayName } from "@/lib/memberDisplay";
import type { ProofTrade } from "@/lib/upgradeProof";

/**
 * What an alert email actually looks like, built from real filings.
 *
 * Describing an alert in a bullet point asks someone to imagine the product;
 * this shows it. The rows are genuine disclosures pulled from the same tables
 * the site serves, which is also why it can't quietly become a nicer-looking
 * fiction than the thing people are paying for.
 *
 * Laid out like ingest/src/alerts/renderAlertEmail.ts — member, then what they
 * did, then when — rather than as a table, for the same reason that one isn't
 * a table: half these are read on a phone.
 */
/** The asset as a recipient sees it, matching the email's own assetLabel(). */
function assetLabel(trade: ProofTrade): string {
  if (trade.ticker && trade.ticker.trim()) return trade.ticker.trim();
  return trade.asset_name.length > 60 ? `${trade.asset_name.slice(0, 57)}…` : trade.asset_name;
}

export function AlertEmailPreview({ trades }: { trades: ProofTrade[] }) {
  if (trades.length === 0) return null;
  const first = trades[0];
  // Both forms the sender actually produces: it names the trade outright when
  // only one matched, because "Tuberville bought NVDA" beats "1 new match".
  const subject =
    trades.length === 1
      ? `${memberDisplayName(first)} bought ${assetLabel(first)} — House purchases over $50K`
      : `${trades.length} new trades — House purchases over $50K`;

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="border-b border-line bg-panel-muted px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">Subject</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-ink">{subject}</p>
      </div>

      <div className="px-4 py-4">
        <p className="text-sm font-semibold text-ink">House purchases over $50K</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {trades.length} new disclosed trade{trades.length === 1 ? "" : "s"} matched this alert.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {["House", "Purchases", "Over $50,001"].map((chip) => (
            <span key={chip} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
              {chip}
            </span>
          ))}
        </div>

        <ul className="mt-3 divide-y divide-line">
          {trades.map((t, i) => {
            const badge = typeBadge(t.transaction_type);
            const where = [t.chamber === "house" ? "House" : "Senate", t.state, t.party].filter(Boolean).join(" · ");
            return (
              <li key={`${t.member_name}-${t.ticker}-${i}`} className="py-3">
                <p className="text-sm font-semibold text-ink">{memberDisplayName(t)}</p>
                <p className="text-[11px] text-ink-faint">{where}</p>
                <p className="mt-1.5 text-sm text-ink">
                  <span className={`font-semibold ${badge.label.startsWith("Purchase") ? "text-emerald-500" : "text-rose-500"}`}>
                    {badge.label}
                  </span>{" "}
                  {assetLabel(t)}{" "}
                  <span className="text-ink-muted">{amountLabel(t.amount_range)}</span>
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  traded {formatDate(t.transaction_date)} · filed {formatDate(t.filing_date)} · original filing
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <figcaption className="border-t border-line bg-panel-muted px-4 py-2.5 text-[11px] leading-relaxed text-ink-faint">
        A real alert email, using filings currently in the database. Every trade links to the member&apos;s own filing on
        the House Clerk&apos;s site.
      </figcaption>
    </figure>
  );
}
