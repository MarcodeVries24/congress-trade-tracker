import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";
import type { Page } from "playwright";
import type { SenateTransaction } from "./parseReport.js";

/**
 * Extracts transaction data from a paper/scanned Senate PTR filing via OCR.
 *
 * Paper filings are rendered as a sequence of full-page scanned images
 * (~3400x4400px, ~400dpi) rather than an HTML table. The transaction pages
 * use the standard Senate PTR schedule — the same fixed form layout for
 * every filer — with a 13-column grid: row #, "Identification of Assets",
 * three Transaction Type checkbox columns (Purchase/Sale/Exchange), a
 * Transaction Date column, and nine Amount-of-Transaction checkbox columns.
 * The type/amount cells hold a handwritten-or-typed "X", not text, so which
 * *column* an "X" falls in is the actual signal — recovered here by OCR'ing
 * each page for word bounding boxes and classifying every "X" against the
 * known column-center x-positions, calibrated once against a real filing
 * (see the constants below) since the form template itself doesn't vary
 * between filers.
 *
 * This is meaningfully less certain than text-native extraction (House PDFs,
 * Senate's own electronic HTML reports) — OCR misreads happen, and a
 * borderline "X" can land in the wrong column bucket. Callers should mark
 * results from this module distinctly (parse_status = 'ocr') rather than
 * presenting them with the same confidence as directly-extracted text.
 *
 * The form template itself has changed over time — filings through at least
 * 2024 use a wider amount-of-transaction grid (more/different dollar
 * brackets) than the current one this module is calibrated against. Rather
 * than guess at an uncalibrated layout, `ocrPaperFiling` declines the whole
 * filing (returns null) if it detects a bracket that doesn't belong to the
 * known template — see UNSUPPORTED_TEMPLATE_MARKER.
 */

const OWNER_PREFIX_MAP: Record<string, string | null> = {
  s: "SP",
  sp: "SP",
  jt: "JT",
  dc: "DC",
};

// Column center x-positions (pixels), calibrated against a real filing at
// the standard ~3400px-wide page size. Nearest-column classification below
// tolerates modest per-scan drift; it doesn't need exact boundaries.
const TYPE_COLUMNS: { x: number; code: string }[] = [
  { x: 1431, code: "P" },
  { x: 1519, code: "S" },
  { x: 1607, code: "E" },
];

const AMOUNT_COLUMNS: { x: number; range: string; low: number | null; high: number | null }[] = [
  { x: 1975, range: "$1,001 - $15,000", low: 1001, high: 15000 },
  { x: 2068, range: "$15,001 - $50,000", low: 15001, high: 50000 },
  { x: 2161, range: "$50,001 - $100,000", low: 50001, high: 100000 },
  { x: 2244, range: "$100,001 - $250,000", low: 100001, high: 250000 },
  { x: 2336, range: "$250,001 - $500,000", low: 250001, high: 500000 },
  { x: 2408, range: "$500,001 - $1,000,000", low: 500001, high: 1000000 },
  { x: 2528, range: "Over $1,000,000***", low: 1000001, high: null },
  { x: 2610, range: "$1,000,001 - $5,000,000", low: 1000001, high: 5000000 },
  { x: 2678, range: "$5,000,001 - $25,000,000", low: 5000001, high: 25000000 },
];

// The Asset/Date columns sit to the left of the checkbox grid; anything at
// or past this x is part of the Type/Amount grid instead. The row-number
// ("#") column sits further left still, outside the Asset column itself.
const ASSET_COLUMN_LEFT_EDGE = 700;
const ASSET_COLUMN_RIGHT_EDGE = 1380;
const DATE_COLUMN_RIGHT_EDGE = 1937;
// Below this y, we're past the header into the actual table body — derived
// from the header calibration (first data row observed at y≈1577).
const TABLE_BODY_TOP = 1500;

// The first transactions page of a filing (never a "(continued)" page)
// carries two pre-printed EXAMPLE rows ("IBM Corp", "(DC) Microsoft") above
// row 1, illustrating how to fill the form. Their own "date" cells are
// literal placeholder text ("2/1/1X"), which never matches a real date
// pattern, so they can't be picked up as row anchors — but their asset text
// can still bleed into the *next* real row's name via the "asset text since
// the previous row" window below. Denylist them by name as a hard safety
// net, on top of excluding everything above the "Example" label itself.
const EXAMPLE_ASSET_DENYLIST = /\bibm\b|\bmicrosoft\b/i;

// This module is calibrated against the current-era Senate PTR schedule
// (9 amount-range columns, topping out at "$5,000,001 - $25,000,000"). An
// older template with more/different columns was in use through at least
// 2024 — extracting against the wrong template would misclassify amount
// brackets, which is worse than not extracting at all. Bail out (treat the
// whole filing as unsupported) if a page's header doesn't match what we
// calibrated for.
const UNSUPPORTED_TEMPLATE_MARKER = /\$25,000,001|\$50,000,000/;

interface OcrWord {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function nearestColumn<T extends { x: number }>(columns: T[], x: number): T {
  let best = columns[0];
  let bestDist = Math.abs(x - best.x);
  for (const col of columns.slice(1)) {
    const dist = Math.abs(x - col.x);
    if (dist < bestDist) {
      best = col;
      bestDist = dist;
    }
  }
  return best;
}

// A row's own "#" label and a trailing "(Descriptor)(TICKER)" pair (e.g.
// "Alpha Teknova Inc (Stock)(TKNO)") — used to recover ticker/asset-type
// fields that the printed form doesn't put in their own columns the way
// the electronic reports do, and to anchor each row's own text (below).
const ROW_NUMBER_PATTERN = /^\d{1,3}$/;
const TICKER_LIKE = /^[A-Z0-9.]{1,10}$/;
const TYPE_DESCRIPTOR_WORDS = /^(Stock|Common Stock|Non[- ]?Public Stock|Bond|Fund|ETF|Note|Warrant|Option|ADR|ADS)$/i;

/** Strips trailing "(Descriptor)" / "(TICKER)" parens, recovering each as a field. */
function extractTickerAndType(name: string): { name: string; ticker: string | null; assetTypeCode: string | null } {
  let text = name;
  let ticker: string | null = null;
  let assetTypeCode: string | null = null;
  for (let i = 0; i < 3; i++) {
    // OCR sometimes tacks on a stray quote/apostrophe past the closing
    // paren — strip that before matching, not just at the very end.
    text = text.replace(/['"“”‘’]+$/, "").trim();
    const m = text.match(/^(.*?)\s*\(([^()]{1,20})\)\s*$/);
    if (!m) break;
    const inner = m[2].trim();
    if (!ticker && TICKER_LIKE.test(inner) && /[A-Z]/.test(inner)) {
      ticker = inner;
    } else if (!assetTypeCode && TYPE_DESCRIPTOR_WORDS.test(inner)) {
      assetTypeCode = inner.replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
    } else {
      break; // an unrecognized trailing paren is probably part of the real name — stop
    }
    text = m[1].trim();
  }
  return { name: text, ticker, assetTypeCode };
}

function toIsoDateSlash(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, yyRaw] = m;
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

async function extractWords(worker: Worker, imageBuffer: Buffer): Promise<OcrWord[]> {
  const { data } = await worker.recognize(imageBuffer, {}, { text: true, blocks: true });
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          words.push({ text: word.text, x0: word.bbox.x0, x1: word.bbox.x1, y0: word.bbox.y0, y1: word.bbox.y1 });
        }
      }
    }
  }
  return words;
}

/** Parses one page image into transaction rows, anchored on each detected date. */
function parsePageWords(words: OcrWord[]): SenateTransaction[] {
  // If this page has the "Example" boilerplate, nothing above (and
  // including) it is real data — push the body's start down past it.
  const exampleWord = words.find((w) => /^example$/i.test(w.text.trim()));
  const effectiveBodyTop = exampleWord ? Math.max(TABLE_BODY_TOP, exampleWord.y1 + 40) : TABLE_BODY_TOP;

  const bodyWords = words.filter((w) => w.y0 >= effectiveBodyTop && !EXAMPLE_ASSET_DENYLIST.test(w.text));

  const dateWords = bodyWords
    .filter((w) => toIsoDateSlash(w.text) !== null)
    .sort((a, b) => a.y0 - b.y0);

  const transactions: SenateTransaction[] = [];
  let prevDateBottom = effectiveBodyTop;

  for (const dateWord of dateWords) {
    const rowTop = prevDateBottom;
    const rowBottom = dateWord.y1 + 15; // small pad below the date's own line
    const rowCenter = (dateWord.y0 + dateWord.y1) / 2;
    const rowBand = 60; // "X" marks are a single line; stay tight to this row

    // Every printed row — dated or not — carries its own "#" label in the
    // narrow column left of "Identification of Assets". An asset-only row
    // (a holding with no transaction this period, e.g. a parent LLC listed
    // for context) has no date of its own, so naively looking back to the
    // *previous date* swept its text into the next dated row's name too.
    // Anchor on the nearest row-number at/before this row's own date
    // instead — the row-number strictly closest to it is this row's own,
    // so nothing from an earlier asset-only row bleeds in.
    const rowNumberMarkers = bodyWords
      .filter((w) => w.x1 < ASSET_COLUMN_LEFT_EDGE && w.y0 >= rowTop && w.y0 <= dateWord.y1 && ROW_NUMBER_PATTERN.test(w.text.trim()))
      .sort((a, b) => a.y0 - b.y0);
    const effectiveRowTop = rowNumberMarkers.length > 0 ? rowNumberMarkers[rowNumberMarkers.length - 1].y0 - 5 : rowTop;

    // Asset text: everything left of the Date column, from this row's own
    // "#" marker through the *bottom* of its date line — the asset name and
    // date sit on the same printed line for a single-line entry, so the
    // window has to include the date's own row, not stop before it.
    const assetWords = bodyWords
      .filter(
        (w) =>
          w.x0 >= ASSET_COLUMN_LEFT_EDGE &&
          w.x1 <= ASSET_COLUMN_RIGHT_EDGE &&
          w.y0 >= effectiveRowTop &&
          w.y0 <= dateWord.y1 &&
          // The row-number column occasionally lands just inside this x
          // range too — a bare 1-2 digit token is never real asset text.
          !/^\d{1,2}$/.test(w.text.trim())
      )
      .sort((a, b) => (Math.abs(a.y0 - b.y0) < 10 ? a.x0 - b.x0 : a.y0 - b.y0));
    let assetName = assetWords
      .map((w) => w.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    let owner: string | null = null;
    const ownerMatch = assetName.match(/^\(?(S|SP|JT|DC)\)?\s*/i);
    if (ownerMatch) {
      const key = ownerMatch[1].toLowerCase();
      if (key in OWNER_PREFIX_MAP) {
        owner = OWNER_PREFIX_MAP[key];
        assetName = assetName.slice(ownerMatch[0].length).trim();
      }
    }

    const { name: strippedName, ticker, assetTypeCode } = extractTickerAndType(assetName);
    assetName = strippedName || assetName;

    const xMarksThisRow = bodyWords.filter(
      (w) => w.text.trim() === "X" && Math.abs((w.y0 + w.y1) / 2 - rowCenter) <= rowBand
    );

    let transactionType = "";
    let amountRange = "";
    let amountLow: number | null = null;
    let amountHigh: number | null = null;

    for (const mark of xMarksThisRow) {
      const markX = (mark.x0 + mark.x1) / 2;
      if (markX < DATE_COLUMN_RIGHT_EDGE) {
        transactionType = nearestColumn(TYPE_COLUMNS, markX).code;
      } else {
        const col = nearestColumn(AMOUNT_COLUMNS, markX);
        amountRange = col.range;
        amountLow = col.low;
        amountHigh = col.high;
      }
    }

    if (assetName && (transactionType || amountRange)) {
      transactions.push({
        transactionDate: toIsoDateSlash(dateWord.text),
        owner,
        ticker,
        assetName,
        assetTypeCode,
        transactionType: transactionType || "P",
        amountRange: amountRange || "(unreadable)",
        amountLow,
        amountHigh,
      });
    }

    prevDateBottom = rowBottom;
  }

  return transactions;
}

/** Extracts the full-resolution page image URLs for a paper filing's report view. */
export async function getPaperFilingImageUrls(page: Page, reportUrl: string): Promise<string[]> {
  await page.goto(reportUrl, { waitUntil: "domcontentloaded" });
  const srcs = await page.$$eval("img.filingImage", (imgs) => imgs.map((img) => (img as HTMLImageElement).src));
  return srcs;
}

/**
 * OCRs every page of a paper filing and returns its transactions. Returns
 * null if no page looks like it contains the standard transactions grid at
 * all (e.g. this "page" is a cover letter or certification page only) —
 * callers should treat that the same as an unparseable filing, not as zero
 * real transactions.
 */
export async function ocrPaperFiling(imageUrls: string[]): Promise<SenateTransaction[] | null> {
  if (imageUrls.length === 0) return null;

  const worker = await createWorker("eng");
  try {
    let sawTransactionsTable = false;
    const allTransactions: SenateTransaction[] = [];

    for (const url of imageUrls) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const png = await sharp(buf).png().toBuffer();

      const words = await extractWords(worker, png);

      if (words.some((w) => UNSUPPORTED_TEMPLATE_MARKER.test(w.text))) {
        // A different form template (more/different amount brackets) than
        // what this module is calibrated for — extracting against it would
        // silently mislabel amounts, so decline the whole filing instead.
        return null;
      }

      const hasTable = words.some((w) => /identification/i.test(w.text)) || words.some((w) => toIsoDateSlash(w.text) !== null);
      if (!hasTable) continue;
      sawTransactionsTable = true;

      allTransactions.push(...parsePageWords(words));
    }

    if (!sawTransactionsTable) return null;
    return allTransactions;
  } finally {
    await worker.terminate();
  }
}
