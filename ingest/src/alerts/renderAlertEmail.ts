import type { AlertFilters, AlertTradeRow } from "../../../web/lib/alertFilters";
import { describeAlert } from "../../../web/lib/alertFilters";
import { amountLabel } from "../../../web/lib/api";
import { memberDisplayName } from "../../../web/lib/memberDisplay";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * The badge for a transaction type: text, ink and a tint to sit it on.
 *
 * Tints rather than solid fills, because a solid green block is the visual
 * weight of a call to action and this is a label. Every pair was checked for
 * contrast at the text size it's used at.
 */
function typeLabel(type: string): { label: string; color: string; tint: string } {
  const t = type.toUpperCase();
  if (t.startsWith("P")) return { label: "Purchase", color: "#0a7d3c", tint: "#e7f5ec" };
  if (t.startsWith("S"))
    return { label: type.includes("partial") ? "Sale (partial)" : "Sale", color: "#a12b2b", tint: "#fcebea" };
  if (t.startsWith("E")) return { label: "Exchange", color: "#a35c00", tint: "#fdf3e3" };
  return { label: type, color: "#555", tint: "#f0f0f0" };
}

/** "House · NJ · Democrat", minus whichever parts the filing didn't carry. */
function memberContext(row: AlertTradeRow): string {
  return [row.chamber === "house" ? "House" : "Senate", row.member_state, row.party].filter(Boolean).join(" \u00b7 ");
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
    return `${memberDisplayName(row)} ${verb} ${assetLabel(row)} — ${alertName}`;
  }
  return `${totalMatched} new trades — ${alertName}`;
}

export function alertEmailHtml(input: AlertEmailInput): string {
  const { alertName, filters, trades, totalMatched, siteUrl, unsubscribeUrl } = input;
  const shown = trades.slice(0, MAX_ROWS_SHOWN);

  const chips = describeAlert(filters)
    .map(
      (chip) =>
        `<span style="display:inline-block;background:#eef2f6;border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;font-size:12px;line-height:1;color:#42505f;">${escapeHtml(
          chip
        )}</span>`
    )
    .join("");

  // One card per trade rather than a table row. An alert is read on a phone as
  // often as not, where five columns either scroll sideways or squeeze a
  // bond's name into four characters — which is exactly what the first cut of
  // this did. Each card leads with the person and the amount, because that is
  // the pair a reader scans for, and closes with the link to the filing.
  const cards = shown
    .map((row) => {
      const type = typeLabel(row.transaction_type);
      const asset = assetLabel(row);
      const company = row.company_name && row.company_name !== asset ? row.company_name : null;
      return `
      <tr>
        <td style="padding:0 0 12px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e3e8ee;border-radius:10px;background:#ffffff;">
            <tr>
              <td style="padding:16px 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:16px;font-weight:700;color:#10161d;line-height:1.3;">${escapeHtml(
                      memberDisplayName(row)
                    )}</td>
                    <td align="right" style="font-size:15px;font-weight:700;color:#10161d;white-space:nowrap;padding-left:12px;">${escapeHtml(
                      amountLabel(row.amount_range)
                    )}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:2px;font-size:12px;color:#8a95a1;">${escapeHtml(
                      memberContext(row)
                    )}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:12px;">
                      <span style="display:inline-block;background:${type.tint};color:${type.color};border-radius:6px;padding:4px 9px;font-size:12px;font-weight:700;line-height:1;">${escapeHtml(
                        type.label
                      )}</span>
                      <span style="display:inline-block;padding-left:8px;font-size:15px;font-weight:700;color:#10161d;">${escapeHtml(
                        asset
                      )}</span>
                      ${
                        company
                          ? `<span style="display:inline-block;padding-left:6px;font-size:13px;color:#5b6773;">${escapeHtml(
                              company
                            )}</span>`
                          : ""
                      }
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:12px;border-top:1px solid #f0f3f7;font-size:12px;color:#8a95a1;">
                      <span style="padding-top:10px;display:inline-block;">Traded ${escapeHtml(
                        formatDate(row.transaction_date)
                      )} &nbsp;&middot;&nbsp; Filed ${escapeHtml(formatDate(row.filing_date))} &nbsp;&middot;&nbsp;
                      <a href="${row.pdf_url}" style="color:#0369a1;text-decoration:none;font-weight:600;white-space:nowrap;">Original filing &rarr;</a></span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    })
    .join("");

  const more =
    totalMatched > shown.length
      ? `<tr><td style="padding:2px 0 14px 0;font-size:13px;color:#5b6773;">and ${
          totalMatched - shown.length
        } more in this batch.</td></tr>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Light only: half these greys inverted by a client's own dark mode stop
     carrying the meaning the colour was doing. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(alertName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;">
<!-- Preheader: the line a client prints beside the subject. Hidden in the
     body itself, or it would read twice. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${totalMatched} new disclosed trade${
    totalMatched === 1 ? "" : "s"
  } matched ${escapeHtml(alertName)}.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

        <tr>
          <td style="padding:0 2px 14px 2px;font-size:17px;font-weight:800;letter-spacing:-0.2px;">
            <a href="${siteUrl}" style="text-decoration:none;"><span style="color:#10161d;">Cong</span><span style="color:#0284c7;">Trade</span></a>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;border:1px solid #e3e8ee;border-radius:12px;padding:20px 18px;">
            <div style="font-size:20px;font-weight:800;color:#10161d;line-height:1.25;">${escapeHtml(alertName)}</div>
            <div style="padding-top:4px;font-size:14px;color:#5b6773;">
              ${totalMatched} new disclosed trade${totalMatched === 1 ? "" : "s"} matched this alert.
            </div>
            ${chips ? `<div style="padding-top:12px;">${chips}</div>` : ""}
          </td>
        </tr>

        <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>

        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${cards}
              ${more}
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:6px 0 4px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#0284c7;border-radius:8px;">
                  <a href="${siteUrl}/trades" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">See every match on CongTrade</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 6px 0 6px;border-top:1px solid #e3e8ee;margin-top:20px;font-size:12px;line-height:1.7;color:#8a95a1;">
            <div style="padding-bottom:8px;">
              You're getting this because you set up the &ldquo;${escapeHtml(
                alertName
              )}&rdquo; alert on CongTrade.
              <a href="${unsubscribeUrl}" style="color:#5b6773;">Turn this alert off</a> &nbsp;&middot;&nbsp;
              <a href="${siteUrl}/account" style="color:#5b6773;">All your alerts</a>
            </div>
            Figures come from the members&rsquo; own Periodic Transaction Reports, which disclose a value
            <em>bracket</em>, never an exact amount. Nothing here is investment advice.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function alertEmailText(input: AlertEmailInput): string {
  const { alertName, filters, trades, totalMatched, siteUrl, unsubscribeUrl } = input;
  const shown = trades.slice(0, MAX_ROWS_SHOWN);
  const lines = shown.map((row) => {
    const type = typeLabel(row.transaction_type).label;
    return `  ${memberDisplayName(row)} (${row.chamber === "house" ? "House" : "Senate"})
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
