export interface ParsedTransaction {
  assetName: string;
  ticker: string | null;
  assetTypeCode: string | null;
  owner: string | null;
  transactionType: string;
  transactionDate: string | null;
  notificationDate: string | null;
  amountRange: string;
  amountLow: number | null;
  amountHigh: number | null;
}

// House PTR PDFs render bold field labels (e.g. "Filing Status:", "Sub Holding Of:")
// through a font whose glyphs pdf-parse can't map, producing literal NUL bytes in
// place of most letters, e.g. "S<NUL><NUL>...<NUL> O<NUL>: Putnam Investments".
// These lines mark metadata/description blocks that we want to skip rather than
// mistake for the next asset name.
const NUL_CHAR = String.fromCharCode(0);
const METADATA_LINE = new RegExp("^[A-Za-z][A-Za-z" + NUL_CHAR + "\\s]{0,40}:");

// Matches a transaction detail line: [asset text] TxnType Date Date AmountRange
// The asset text is only present when the whole record sits on one line.
const TXN_LINE =
  /^(.*?)\s*(P|S\s*\([^)]*\)|S|E)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\$[\d,]+(?:\s*-\s*\$[\d,]+)?|\$1,000 or less|Over \$[\d,]+)\s*$/;

// A ticker only counts when it's parenthesized and starts with a letter —
// government securities are identified by a CUSIP instead (e.g. "(91282CGH8)"),
// which must NOT be mistaken for a ticker.
const TICKER_PATTERN = /\(([A-Z][A-Z0-9.\/]{0,6})\)\s*\[([A-Za-z]{1,3})\]/;
// The asset type code ("[ST]", "[GS]", ...) is always the trailing bracketed
// tag regardless of what precedes it, so it's extracted separately from the
// ticker — otherwise CUSIP-identified assets (bonds, treasuries) silently lose
// their type code just because they have no real ticker.
const ASSET_TYPE_PATTERN = /\[([A-Za-z]{1,3})\]\s*$/;

// The table header ("ID Owner Asset Transaction Type Date Notification Date
// Amount Cap. Gains > $200?") repeats at the top of every page, and can leak
// into the window before the first asset name on a page. Strip any run of
// these tokens off the front, in whatever partial combination survived.
const LEADING_HEADER_TOKENS = [
  /^ID\s+/,
  /^Owner Asset\s+/,
  /^Transaction\s+/,
  /^Type\s+/,
  /^Notification\s+/,
  /^Date\s+/,
  /^Amount\s+/,
  /^Cap\.\s+/,
  /^Gains\s*>\s*/i,
  /^\$200\?\s*/,
];

function stripLeadingHeaderJunk(text: string): string {
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of LEADING_HEADER_TOKENS) {
      const stripped = text.replace(re, "");
      if (stripped !== text) {
        text = stripped.trim();
        changed = true;
      }
    }
  }
  return text;
}

function toIsoDateSlash(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseAmountRange(range: string): { low: number | null; high: number | null } {
  const nums = [...range.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  const lower = range.toLowerCase();
  if (lower.includes("or less")) return { low: 0, high: nums[0] ?? null };
  if (lower.includes("over")) return { low: nums[0] ?? null, high: null };
  return { low: nums[0] ?? null, high: nums[1] ?? null };
}

/**
 * The PDF layout sometimes wraps an amount range across a line break, e.g.
 * "...$50,001 -" / "$100,000". Join those back into one line so TXN_LINE can match.
 */
function joinWrappedAmountRanges(text: string): string {
  return text.replace(/(\$[\d,]+)\s*-\s*\r?\n\s*(\$[\d,]+)/g, "$1 - $2");
}

export function parsePtrText(
  text: string,
  _docId: string
): { transactions: ParsedTransaction[]; issues: string[] } {
  const joined = joinWrappedAmountRanges(text);
  const lines = joined
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  const transactions: ParsedTransaction[] = [];
  const issues: string[] = [];
  let windowLines: string[] = [];

  for (const line of lines) {
    const m = line.match(TXN_LINE);
    if (m) {
      const [, prefix, txnTypeRaw, date1, date2, amountRange] = m;
      const candidateLines = prefix.trim() ? [...windowLines, prefix.trim()] : windowLines;
      let assetText = stripLeadingHeaderJunk(candidateLines.join(" ").replace(/\s+/g, " ").trim());

      let owner: string | null = null;
      const ownerMatch = assetText.match(/^(SP|JT|DC)\s+/);
      if (ownerMatch) {
        owner = ownerMatch[1];
        assetText = assetText.slice(ownerMatch[0].length).trim();
      }

      const tickerMatch = assetText.match(TICKER_PATTERN);
      const assetTypeMatch = assetText.match(ASSET_TYPE_PATTERN);
      const { low, high } = parseAmountRange(amountRange);

      if (!assetText) {
        assetText = "(unknown asset)";
        issues.push(`No asset name found before transaction line: "${line}"`);
      }

      transactions.push({
        assetName: assetText,
        ticker: tickerMatch ? tickerMatch[1] : null,
        assetTypeCode: tickerMatch ? tickerMatch[2] : assetTypeMatch ? assetTypeMatch[1] : null,
        owner,
        transactionType: txnTypeRaw.replace(/\s+/g, " ").trim(),
        transactionDate: toIsoDateSlash(date1),
        notificationDate: toIsoDateSlash(date2),
        amountRange: amountRange.replace(/\s+/g, " ").trim(),
        amountLow: low,
        amountHigh: high,
      });

      windowLines = [];
      continue;
    }

    if (METADATA_LINE.test(line)) {
      windowLines = [];
      continue;
    }

    // Description-field continuation lines spell out per-share pricing; skip them
    // rather than let them pollute the next asset name.
    if (/@\s*\$[\d,.]+\s*\/\s*share/.test(line)) continue;
    if (/^\*/.test(line)) continue;

    windowLines.push(line.trim());
    if (windowLines.length > 4) windowLines.shift();
  }

  return { transactions, issues };
}
