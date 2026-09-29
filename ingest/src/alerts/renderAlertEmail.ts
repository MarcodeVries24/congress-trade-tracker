import type { AlertFilters, AlertTradeRow } from "../../../web/lib/alertFilters";
import { describeAlert } from "../../../web/lib/alertFilters";
import { amountLabel } from "../../../web/lib/api";
import { memberDisplayName } from "@congtrade/shared/memberDisplay";

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

/**
 * Every match goes in the email. The only ceiling is Gmail's: it clips a
 * message over roughly 102KB behind a "View entire message" link, and what
 * gets hidden is the end — which is where the unsubscribe link lives. An
 * email that buries its own unsubscribe is worse than one that says a few
 * rows are missing.
 *
 * So the cards are laid in until the document approaches that limit rather
 * than until some round number of rows is reached. The sender already caps a
 * run at 200 matches, and at this budget a run of that size is the only one
 * that ever spills.
 */
const MAX_HTML_BYTES = 92_000;

/** Roughly what the header, button and footer cost, kept off the card budget. */
const CHROME_BYTES = 4_000;

/** Written once and reused, because it appears on every line of every card. */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

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

  const chips = describeAlert(filters)
    .map(
      (chip) =>
        `<span style="display:inline-block;background:#eef2f6;border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;font-size:12px;line-height:1;color:#42505f;">${escapeHtml(
          chip
        )}</span>`
    )
    .join("");

  // Cards where they fit, dense lines where they don't. A batch big enough to
  // overflow is one where the reader wants to see the whole shape of it
  // anyway, and dropping two thirds of a run to keep the layout roomy is the
  // wrong trade for an alert whose job is to tell you what was filed.
  const rendered: string[] = [];
  let budget = MAX_HTML_BYTES - CHROME_BYTES;
  const asCards = trades.reduce((n, row) => n + renderCard(row).length, 0) <= budget;
  for (const row of trades) {
    const block = asCards ? renderCard(row) : renderRow(row);
    if (rendered.length > 0 && block.length > budget) break;
    rendered.push(block);
    budget -= block.length;
  }

  // Cards carry their own box; the dense rows need one put round them, or the
  // list reads as loose text dropped under the header.
  const body = asCards
    ? rendered.join("")
    : `<tr><td style="background:#ffffff;border:1px solid #e3e8ee;border-radius:12px;padding:2px 16px 4px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rendered.join(
        ""
      )}</table></td></tr>`;

  const missing = totalMatched - rendered.length;
  const more =
    missing > 0
      ? `<tr><td style="padding:2px 0 14px 0;font-size:13px;color:#5b6773;">and ${missing} more in this batch &mdash; <a href="${siteUrl}/trades" style="color:#0369a1;font-weight:600;text-decoration:none;">see them on CongTrade</a>.</td></tr>`
      : "";

  return document({ alertName, totalMatched, chips, cards: body, more, siteUrl, unsubscribeUrl });
}

/**
 * One trade, as a card.
 *
 * A card rather than a table row: an alert is read on a phone as often as
 * not, where five columns either scroll sideways or squeeze a bond's name
 * into four characters, which is exactly what the first cut of this did. It
 * leads with the person and the amount, the pair a reader scans for, and
 * closes with the link to the filing.
 */
function renderCard(row: AlertTradeRow): string {
  const type = typeLabel(row.transaction_type);
  const asset = assetLabel(row);
  const company = row.company_name && row.company_name !== asset ? row.company_name : null;

  // Only the name-and-amount line needs a table; Outlook wants one for two
  // columns on a row, but handles stacked divs. Keeping the other three lines
  // as divs halves the card's bytes, which is not housekeeping here: it is
  // twice as many trades before Gmail's clip limit bites.
  return `<tr><td style="padding:0 0 10px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e3e8ee;border-radius:10px;background:#ffffff;"><tr><td style="padding:14px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font:700 16px/1.3 ${FONT};color:#10161d;">${escapeHtml(memberDisplayName(row))}</td>
<td align="right" style="font:700 15px/1.3 ${FONT};color:#10161d;white-space:nowrap;padding-left:12px;">${escapeHtml(
    amountLabel(row.amount_range)
  )}</td></tr></table>
<div style="padding-top:2px;font:400 12px/1.5 ${FONT};color:#8a95a1;">${escapeHtml(memberContext(row))}</div>
<div style="padding-top:11px;">
<span style="background:${type.tint};color:${type.color};border-radius:6px;padding:4px 9px;font:700 12px/1 ${FONT};">${escapeHtml(
    type.label
  )}</span>
<span style="padding-left:8px;font:700 15px/1.4 ${FONT};color:#10161d;">${escapeHtml(asset)}</span>${
    company ? `<span style="padding-left:6px;font:400 13px/1.4 ${FONT};color:#5b6773;">${escapeHtml(company)}</span>` : ""
  }</div>
<div style="margin-top:12px;padding-top:10px;border-top:1px solid #f0f3f7;font:400 12px/1.5 ${FONT};color:#8a95a1;">Traded ${escapeHtml(
    formatDate(row.transaction_date)
  )} &nbsp;&middot;&nbsp; Filed ${escapeHtml(
    formatDate(row.filing_date)
  )} &nbsp;&middot;&nbsp; <a href="${row.pdf_url}" style="color:#0369a1;text-decoration:none;font-weight:600;white-space:nowrap;">Original filing &rarr;</a></div>
</td></tr></table></td></tr>`;
}

/**
 * One trade as a single dense line, for batches too large to card.
 *
 * Roughly a fifth of a card's bytes, which is what lets a 200-match run show
 * every one of its matches instead of the first forty-odd and an apology. The
 * information is the same; only the room it gets is smaller.
 */
function renderRow(row: AlertTradeRow): string {
  const type = typeLabel(row.transaction_type);
  return `<tr><td style="padding:9px 2px;border-bottom:1px solid #e9edf2;font:400 13px/1.5 ${FONT};color:#5b6773;">
<span style="color:${type.color};font-weight:700;">${escapeHtml(type.label)}</span>
<a href="${row.pdf_url}" style="color:#10161d;font-weight:700;text-decoration:none;">${escapeHtml(
    assetLabel(row)
  )}</a> ${escapeHtml(amountLabel(row.amount_range))}
<div style="font:400 12px/1.5 ${FONT};color:#8a95a1;">${escapeHtml(memberDisplayName(row))} &middot; ${escapeHtml(
    memberContext(row)
  )} &middot; filed ${escapeHtml(formatDate(row.filing_date))}</div></td></tr>`;
}

/** The shell the cards sit in: header, stack, button, footer. */
function document(parts: {
  alertName: string;
  totalMatched: number;
  chips: string;
  cards: string;
  more: string;
  siteUrl: string;
  unsubscribeUrl: string;
}): string {
  const { alertName, totalMatched, chips, cards, more, siteUrl, unsubscribeUrl } = parts;
  const plural = totalMatched === 1 ? "" : "s";

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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${totalMatched} new disclosed trade${plural} matched ${escapeHtml(
    alertName
  )}.</div>

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
              ${totalMatched} new disclosed trade${plural} matched this alert.
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
          <td style="padding:22px 6px 0 6px;border-top:1px solid #e3e8ee;font-size:12px;line-height:1.7;color:#8a95a1;">
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
  // No cap here: the size limit that shapes the HTML is a Gmail rendering
  // quirk, and the text alternative doesn't hit it.
  const lines = trades.map((row) => {
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
${totalMatched > trades.length ? `\nand ${totalMatched - trades.length} more: ${siteUrl}/trades\n` : ""}
Manage your alerts: ${siteUrl}/account
Turn this alert off:  ${unsubscribeUrl}

Figures come from the members' own Periodic Transaction Reports, which disclose a
value bracket, never an exact amount. Nothing here is investment advice.
`;
}
