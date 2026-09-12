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
// The amount is usually one of the STOCK Act's fixed brackets ("$X - $Y",
// "$1,000 or less", "Over $X"), all of which are whole dollars — but a
// divested/inherited asset can instead disclose an exact appraised value
// with cents (confirmed on a real filing, Kaptur doc 20022886: "$1,280.03",
// no bracket at all), so the plain-dollar-amount alternative allows an
// optional ".dd" on each figure it matches, not just on this one.
//
// A transaction in a spouse's or dependent child's asset can instead check
// column K ("Transaction in a Spouse or Dependent Child Asset over
// $1,000,000") in place of the usual bracket, and the form's own text-native
// rendering of that cell is "Spouse/DC Over $X" (confirmed on a real filing,
// Scott H. Peters doc 20021049: "Spouse/DC Over\n$1,000,000") — the leading
// "Spouse/DC " is optional in the pattern below so a plain "Over $X" still
// matches on its own.
const TXN_LINE =
  /^(.*?)\s*(P|S\s*\([^)]*\)|S|E)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\$[\d,]+(?:\.\d+)?(?:\s*-\s*\$[\d,]+(?:\.\d+)?)?|\$1,000 or less|(?:Spouse\/DC )?Over \$[\d,]+(?:\.\d+)?)\s*$/;

// A ticker only counts when it's parenthesized and starts with a letter —
// government securities are identified by a CUSIP instead (e.g. "(91282CGH8)"),
// which must NOT be mistaken for a ticker. Matched case-insensitively and
// uppercased at use: the same broken-font letter substitution that corrupts
// header labels (see LEADING_HEADER_TOKENS above) also hits letters inside
// real tickers, so a case-sensitive match was silently dropping a real,
// identifiable ticker to null (confirmed on real filings, Thomas Suozzi docs
// 20020253/20020552: "Dollar general Corporation (Dg) [ST]" and "blackRock,
// Inc. (bLK) [ST]" -- tickers are always uppercase in reality, so uppercasing
// what's captured here is always correct, never a guess).
const TICKER_PATTERN = /\(([A-Za-z][A-Za-z0-9.\/]{0,6})\)\s*\[([A-Za-z]{1,3})\]/;
// The asset type code ("[ST]", "[GS]", ...) is always the trailing bracketed
// tag regardless of what precedes it, so it's extracted separately from the
// ticker — otherwise CUSIP-identified assets (bonds, treasuries) silently lose
// their type code just because they have no real ticker.
const ASSET_TYPE_PATTERN = /\[([A-Za-z]{1,3})\]\s*$/;

// The table header ("ID Owner Asset Transaction Type Date Notification Date
// Amount Cap. Gains > $200?") repeats at the top of every page, and can leak
// into the window before the first asset name on a page. Strip any run of
// these tokens off the front, in whatever partial combination survived.
// Case-insensitive throughout: some filings render these header labels with
// certain capital letters substituted for their lowercase form by a broken
// font subset (confirmed on a real filing, Thomas Suozzi doc 20020195,
// where the header prints as "amount \tcap." / "gains >" / "$200?" — compare
// "FILINg STATUS" and "SUbHOLDINg OF" a few lines later in the same
// document), so a case-sensitive match silently let the header bleed into
// the first asset name on the page.
const LEADING_HEADER_TOKENS = [
  /^ID\s+/i,
  /^Owner Asset\s+/i,
  /^Transaction\s+/i,
  /^Type\s+/i,
  /^Notification\s+/i,
  /^Date\s+/i,
  /^Amount\s+/i,
  /^Cap\.\s+/i,
  /^Gains\s*>\s*/i,
  /^\$200\?\s*/,
];

// The rendered page prints "Filing ID #<docId>" and a "-- N of M --" page
// marker between pages (also used elsewhere to detect total page count),
// with no metadata-style label to recognize them by. Undetected, they sit
// between one record's last metadata line and the next page's first asset
// name and get collected as if they were part of that asset name (confirmed
// on a real filing, Thomas Suozzi doc 20020253: "Filing ID #20020253 -- 1 of
// 2 -- TJX Companies, Inc. (TJX) [ST]").
const PAGE_BREAK_MARKER = /^(?:Filing ID #\d+|--\s*\d+\s*of\s*\d+\s*--)$/;

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

// A metadata field's value (most commonly "Description:", which is free
// prose) routinely wraps across several physical lines with no blank line
// separating it from the next record's asset name (confirmed on a real
// filing, Brad Sherman doc 20021945: a description ending "...(4th asset
// listed on" / "page)." is followed immediately, on the very next line, by
// the next transaction's asset name "US Treasury Inflation Protected
// Note"). METADATA_LINE only recognizes the line that starts a field, so a
// wrapped continuation line was falling through into windowLines and
// polluting the following asset name.
//
// Terminal punctuation alone doesn't reliably mark the end of a field's
// text: some fields are short label-like phrases with no trailing period at
// all (confirmed on a real filing, Christopher L. Jacobs doc 20021398:
// "Description: Municipal Bond" and "Sub Holding Of: CL TRUST > LDJ FAM INV
// LLC > Parametric" both end a complete field on one line with no
// punctuation). What both of those share, though, is that their last word
// is a normal content word — never a short function word a real sentence
// wouldn't end on (an article, preposition, conjunction, etc.), which is
// exactly what every confirmed genuine wrap point (Sherman's "...listed on",
// "...Under the", "...This bond was") ends with instead. So: keep
// consuming continuation lines only while the line ends on one of those.
const MID_SENTENCE_END_WORDS = new Set([
  "a", "an", "the", "of", "on", "in", "at", "to", "by", "for", "and", "or",
  "but", "nor", "with", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "this", "that", "these", "those", "its", "their", "his",
  "her", "our", "your", "my", "per", "via", "not", "no", "so", "than",
  "then", "if", "when", "while", "because", "into", "onto", "over", "under",
  "between", "among", "about", "above", "below", "after", "before",
  "during", "through", "until", "upon", "within", "without",
]);

function endsMidSentence(line: string): boolean {
  const words = line.trim().replace(/[.,;:!?)"'\]]+$/, "").split(/\s+/);
  const lastRaw = words[words.length - 1] ?? "";
  // A lone uppercase letter is a share-class/series suffix ("Class A", "Series
  // B"), not the article "a" (confirmed on a real filing, doc 20020354: "sale
  // of 115 units Estee Lauder Companies Class A" is a complete description
  // that happens to end in "A"). A bare trailing number is likewise usually
  // an account/CUSIP suffix (confirmed on a real filing, doc 20030338:
  // "Sub Holding Of: Morgan Stanley - Select UMA Account # 1" is a complete
  // field that happens to end in "1"), not a year or figure awaiting its
  // qualifier — so neither is treated as a sign of a field that needs
  // continuing.
  if (/^[A-Z]$/.test(lastRaw) || /^\d+$/.test(lastRaw)) return false;
  return MID_SENTENCE_END_WORDS.has(lastRaw.toLowerCase());
}

function toIsoDateSlash(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// STOCK Act disclosure brackets, in the exact strings the site's own filter
// UI and every other parser in this codebase already store/expect (see
// e.g. AMOUNT_RANGES in web/lib/api.ts, and the equivalent list in
// ocrHousePtr.ts) — an exact disclosed value gets bucketed into whichever
// of these it falls in, rather than stored as its own one-off figure, so
// it behaves identically to every other row in the same bracket (sorts,
// filters, and displays the same way).
const STOCK_ACT_BRACKETS: { range: string; low: number; high: number | null }[] = [
  // Below the STOCK Act's own bottom bracket — the form has no checkbox for
  // this (column A starts at $1,001), so it only ever shows up as a typed
  // exact figure in a text-native e-filing (confirmed on real filings: Brian
  // Mast doc 20024743, three sub-$1 purchases in a dependent child's account
  // down to $172; Nancy Pelosi doc 20022320, $1.00 for 100 options that
  // expired worthless). Bucketed rather than excluded — even a nominal
  // options-expiration figure like Pelosi's can sit next to a real disclosed
  // loss in the filer's own comments, so hiding the row entirely hides that
  // context too.
  { range: "$1,000 or less", low: 0, high: 1000 },
  { range: "$1,001 - $15,000", low: 1001, high: 15000 },
  { range: "$15,001 - $50,000", low: 15001, high: 50000 },
  { range: "$50,001 - $100,000", low: 50001, high: 100000 },
  { range: "$100,001 - $250,000", low: 100001, high: 250000 },
  { range: "$250,001 - $500,000", low: 250001, high: 500000 },
  { range: "$500,001 - $1,000,000", low: 500001, high: 1000000 },
  { range: "$1,000,001 - $5,000,000", low: 1000001, high: 5000000 },
  { range: "$5,000,001 - $25,000,000", low: 5000001, high: 25000000 },
  { range: "$25,000,001 - $50,000,000", low: 25000001, high: 50000000 },
  { range: "Over $50,000,000", low: 50000001, high: null },
];

function bracketFor(value: number): { range: string; low: number; high: number | null } | null {
  return STOCK_ACT_BRACKETS.find((b) => value >= b.low && (b.high === null || value <= b.high)) ?? null;
}

function parseAmountRange(range: string): { low: number | null; high: number | null; displayRange: string } {
  const nums = [...range.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((m) => Math.round(Number(m[1].replace(/,/g, ""))));
  const lower = range.toLowerCase();
  if (lower.includes("or less")) return { low: 0, high: nums[0] ?? null, displayRange: range };
  if (lower.startsWith("spouse/dc")) {
    // Column K ("Transaction in a Spouse or Dependent Child Asset over
    // $1,000,000") isn't its own amount bracket — on the real form it's a
    // flag checked *alongside* whichever of the 10 real brackets (A-J)
    // actually applies (see resolveColumnRoles in ocrHousePtr.ts, which
    // reads the real bracket and ignores this flag entirely). But a
    // text-native e-filing can render just "Spouse/DC Over $1,000,000"
    // with no further bracket given (confirmed on a real filing, Scott H.
    // Peters doc 20021049) — with no more precise figure disclosed, bucket
    // it into the STOCK Act bracket that starts just above $1,000,000
    // rather than inventing a one-off "Over $1,000,000" label that
    // wouldn't match any real bracket or filter.
    const bracket = bracketFor(1_000_001)!;
    return { low: bracket.low, high: bracket.high, displayRange: bracket.range };
  }
  if (lower.includes("over")) return { low: nums[0] ?? null, high: null, displayRange: range };
  // A single figure with no "-" separator is an exact disclosed value (see
  // TXN_LINE's comment), not a range — bucket it into the STOCK Act
  // bracket it actually falls in (matching how every bracket-disclosed
  // transaction is stored) rather than keep it as a standalone figure,
  // which wouldn't match any of the site's known amount_range strings (so
  // it'd silently fall out of the trade-size filter, and read as a
  // one-off next to every peer row's plain bracket label). Only a figure
  // above $50,000,000 (outside the STOCK Act's own disclosure range —
  // shouldn't happen for something that had to be disclosed at all) falls
  // through bracketFor and keeps the raw one-off value below; anything at
  // or under $50,000,000, however small, lands in a real bracket now.
  if (nums.length === 1) {
    const bracket = bracketFor(nums[0]);
    if (bracket) return { low: bracket.low, high: bracket.high, displayRange: bracket.range };
    return { low: nums[0], high: nums[0], displayRange: range };
  }
  return { low: nums[0] ?? null, high: nums[1] ?? null, displayRange: range };
}

/**
 * The PDF layout sometimes wraps an amount range across a line break, e.g.
 * "...$50,001 -" / "$100,000", or the column K spouse/DC-over-$1M cell's
 * "...Over" / "$1,000,000" (confirmed on a real filing, Scott H. Peters doc
 * 20021049). Join those back into one line so TXN_LINE can match.
 */
function joinWrappedAmountRanges(text: string): string {
  return text
    .replace(/(\$[\d,]+)\s*-\s*\r?\n\s*(\$[\d,]+)/g, "$1 - $2")
    .replace(/\bOver\s*\r?\n\s*(\$[\d,]+)/g, "Over $1");
}

// The newer (modern e-filing) House PDF layout renders each row's "Cap.
// Gains > $200?" checkbox — and the form's other checkbox/radio widgets —
// with an icon font whose glyphs pdf-parse can't map, so they extract as a
// run of plain lowercase letters (e.g. "g<TAB>f<TAB>e<TAB>d<TAB>c"). That
// run lands at the end of the transaction line, right after the amount
// range, which breaks TXN_LINE's end-of-line anchor and silently drops the
// entire line — not just that field. Strip it before parsing.
function stripCheckboxGlyphs(text: string): string {
  return text.replace(/([ \t])[a-z](?:\t[a-z]){1,}[ \t]*$/gm, "");
}

export function parsePtrText(
  text: string,
  _docId: string
): { transactions: ParsedTransaction[]; issues: string[] } {
  const joined = joinWrappedAmountRanges(stripCheckboxGlyphs(text));
  const lines = joined
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  const transactions: ParsedTransaction[] = [];
  const issues: string[] = [];
  let windowLines: string[] = [];
  let inMetadataBlock = false;

  for (const line of lines) {
    const m = line.match(TXN_LINE);
    if (m) {
      const [, prefix, txnTypeRaw, date1, date2, amountRange] = m;
      const candidateLines = prefix.trim() ? [...windowLines, prefix.trim()] : windowLines;
      let assetText = stripLeadingHeaderJunk(candidateLines.join(" ").replace(/\s+/g, " ").trim());
      // The "ID" column is usually blank, but some filings (typically an
      // amendment) populate it with the House Clerk's internal 10-digit
      // transaction id ("2000######"), which then bleeds into the asset
      // name exactly like the table header does — with or without an owner
      // code after it (confirmed on real filings across 62 distinct
      // doc_ids, e.g. Debbie Wasserman Schultz doc 20021405: "2000078650 DC
      // EMCORE Corporation (EMKR) [ST]", and doc 20020080: "2000052768
      // Vaisala Oy Ordinary Shares -A- (VAIAF) [ST]" with no owner code at
      // all). Strip it before the owner check so both shapes end up clean.
      assetText = assetText.replace(/^2000\d{6}\s+/, "");

      let owner: string | null = null;
      const ownerMatch = assetText.match(/^(SP|JT|DC)\s+/);
      if (ownerMatch) {
        owner = ownerMatch[1];
        assetText = assetText.slice(ownerMatch[0].length).trim();
      }

      const tickerMatch = assetText.match(TICKER_PATTERN);
      const assetTypeMatch = assetText.match(ASSET_TYPE_PATTERN);
      const { low, high, displayRange } = parseAmountRange(amountRange);

      if (!assetText) {
        assetText = "(unknown asset)";
        issues.push(`No asset name found before transaction line: "${line}"`);
      }

      transactions.push({
        assetName: assetText,
        ticker: tickerMatch ? tickerMatch[1].toUpperCase() : null,
        assetTypeCode: tickerMatch ? tickerMatch[2] : assetTypeMatch ? assetTypeMatch[1] : null,
        owner,
        transactionType: txnTypeRaw.replace(/\s+/g, " ").trim(),
        transactionDate: toIsoDateSlash(date1),
        notificationDate: toIsoDateSlash(date2),
        amountRange: displayRange.replace(/\s+/g, " ").trim(),
        amountLow: low,
        amountHigh: high,
      });

      windowLines = [];
      inMetadataBlock = false;
      continue;
    }

    if (METADATA_LINE.test(line)) {
      windowLines = [];
      inMetadataBlock = endsMidSentence(line);
      continue;
    }

    if (inMetadataBlock) {
      inMetadataBlock = endsMidSentence(line);
      continue;
    }

    // Description-field continuation lines spell out per-share pricing; skip them
    // rather than let them pollute the next asset name.
    if (/@\s*\$[\d,.]+\s*\/\s*share/.test(line)) continue;
    if (/^\*/.test(line)) continue;
    if (PAGE_BREAK_MARKER.test(line)) continue;

    windowLines.push(line.trim());
    if (windowLines.length > 4) windowLines.shift();
  }

  return { transactions, issues };
}
