import type { AlertFilters, AlertTradeRow } from "../../../web/lib/alertFilters";
import { describeAlert } from "../../../web/lib/alertFilters";
import { amountLabel } from "../../../web/lib/api";

/**
 * The alert email itself.
 *
 * Kept apart from sendAlerts.ts so it can be rendered from fabricated rows
 * and eyeballed without touching the database or sending anything (see
 * `npm run alerts:send -- --dry-run`), the same way the daily report's review
 * section is.
 *
 * Every trade links to the original PDF on the House Clerk's or Senate's own
 * site: the whole product is "we read the disclosures for you", so the email
 * should always be one click from the primary source rather than asking the
 * recipient to take our word for it.
 */

export interface AlertEmailInput {
  alertName: string;
  filters: AlertFilters;
  trades: AlertTradeRow[];
  /** How many matched in total, when more matched than are shown. */
  totalMatched: number;
  siteUrl: string;
  unsubscribeUrl: string;
}

const MAX_ROWS_SHOWN = 40;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function displayName(name: string): string {
  return name.replace(/^Hon\.\s+/, "").trim();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function typeLabel(type: string): { label: string; color: string } {
  const t = type.toUpperCase();
  if (t.startsWith("P")) return { label: "Purchase", color: "#0a7d3c" };
  if (t.startsWith("S")) return { label: type.includes("partial") ? "Sale (partial)" : "Sale", color: "#a12b2b" };
  if (t.startsWith("E")) return { label: "Exchange", color: "#a35c00" };
  return { label: type, color: "#666" };
}

/** The asset as a recipient would name it: ticker if there is one, else the asset name. */
function assetLabel(row: AlertTradeRow): string {
  if (row.ticker && row.ticker.trim()) return row.ticker.trim();
  return row.asset_name.length > 60 ? `${row.asset_name.slice(0, 57)}…` : row.asset_name;
}

export function alertEmailSubject(input: Pick<AlertEmailInput, "alertName" | "totalMatched" | "trades">): string {
  const { alertName, totalMatched, trades } = input;
  // A single match is worth naming outright — "Tuberville bought NVDA" is a
  // far more useful subject line than "1 new match".
  if (totalMatched === 1 && trades[0]) {
    const row = trades[0];
    const verb = row.transaction_type.toUpperCase().startsWith("P") ? "bought" : row.transaction_type.toUpperCase().startsWith("S") ? "sold" : "exchanged";
    return `${displayName(row.member_name)} ${verb} ${assetLabel(row)} — ${alertName}`;
  }
  return `${totalMatched} new trades — ${alertName}`;
}

export function alertEmailHtml(input: AlertEmailInput): string {
  const { alertName, filters, trades, totalMatched, siteUrl, unsubscribeUrl } = input;
  const shown = trades.slice(0, MAX_ROWS_SHOWN);
  const chips = describeAlert(filters)
    .map(
      (chip) =>
        `<span style="display:inline-block;border:1px solid #e5e5e5;border-radius:999px;padding:2px 10px;margin:0 4px 4px 0;font-size:12px;color:#555;">${escapeHtml(chip)}</span>`
    )
    .join("");

  // One block per trade rather than a five-column table: an alert email is
  // read on a phone as often as not, and a wide table either scrolls
  // sideways or squeezes a bond's name into a four-character column (which
  // is exactly what the first cut of this did).
  const rows = shown
    .map((row) => {
      const type = typeLabel(row.transaction_type);
      const where = [row.chamber === "house" ? "House" : "Senate", row.member_state, row.party].filter(Boolean).join(" · ");
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <div style="font-size:15px;font-weight:600;color:#111;">${escapeHtml(displayName(row.member_name))}</div>
          <div style="font-size:12px;color:#888;margin-top:1px;">${escapeHtml(where)}</div>
          <div style="font-size:14px;color:#111;margin-top:6px;">
            <span style="color:${type.color};font-weight:600;">${type.label}</span>
            &nbsp;${escapeHtml(assetLabel(row))}
            &nbsp;<span style="color:#555;">${escapeHtml(amountLabel(row.amount_range))}</span>
          </div>
          <div style="font-size:12px;color:#888;margin-top:4px;">
            traded ${formatDate(row.transaction_date)} · filed ${formatDate(row.filing_date)} ·
            <a href="${row.pdf_url}" style="color:#0070f3;">original filing</a>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `
    <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111;">
      <h2 style="margin-bottom:2px;">${escapeHtml(alertName)}</h2>
      <p style="color:#666;margin-top:0;font-size:14px;">
        ${totalMatched} new disclosed trade${totalMatched === 1 ? "" : "s"} matched this alert.
      </p>
      <div style="margin:12px 0 4px;">${chips}</div>

      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      ${
        totalMatched > shown.length
          ? `<p style="color:#666;font-size:13px;">and ${totalMatched - shown.length} more — <a href="${siteUrl}/trades" style="color:#0070f3;">see them all on CongTrade</a>.</p>`
          : ""
      }

      <p style="margin-top:24px;font-size:14px;">
        <a href="${siteUrl}/trades" style="color:#0070f3;">Browse every trade</a> ·
        <a href="${siteUrl}/account" style="color:#0070f3;">Manage your alerts</a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p style="color:#999;font-size:12px;line-height:1.6;">
        You're getting this because you set up the \u201C${escapeHtml(alertName)}\u201D alert on CongTrade.
        <a href="${unsubscribeUrl}" style="color:#999;">Turn this alert off</a> ·
        <a href="${siteUrl}/account" style="color:#999;">All your alerts</a><br/>
        Figures come straight from the members' own Periodic Transaction Reports, which disclose a value
        <em>bracket</em>, never an exact amount. Nothing here is investment advice.
      </p>
    </div>
  `;
}

export function alertEmailText(input: AlertEmailInput): string {
  const { alertName, filters, trades, totalMatched, siteUrl, unsubscribeUrl } = input;
  const shown = trades.slice(0, MAX_ROWS_SHOWN);
  const lines = shown.map((row) => {
    const type = typeLabel(row.transaction_type).label;
    return `  ${displayName(row.member_name)} (${row.chamber === "house" ? "House" : "Senate"})
    ${type}  ${assetLabel(row)}  ${amountLabel(row.amount_range)}
    traded ${formatDate(row.transaction_date)}, filed ${formatDate(row.filing_date)}
    ${row.pdf_url}`;
  });

  return `${alertName}
${totalMatched} new disclosed trade${totalMatched === 1 ? "" : "s"} matched this alert.

Watching: ${describeAlert(filters).join(" · ")}

${lines.join("\n\n")}
${totalMatched > shown.length ? `\nand ${totalMatched - shown.length} more — ${siteUrl}/trades\n` : ""}
Manage your alerts: ${siteUrl}/account
Turn this alert off:  ${unsubscribeUrl}

Figures come from the members' own Periodic Transaction Reports, which disclose a
value bracket, never an exact amount. Nothing here is investment advice.
`;
}
