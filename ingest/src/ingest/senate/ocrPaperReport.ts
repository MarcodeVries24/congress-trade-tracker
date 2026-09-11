import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
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

/**
 * Legacy paper-filing template support (pre-2025-ish; still in active use
 * for filings from ~2022-2024). This template's amount-of-transaction grid
 * has 11 dollar-bracket columns instead of the 9 the constants above are
 * calibrated for, so a page using it can't be read with TYPE_COLUMNS /
 * AMOUNT_COLUMNS without silently misclassifying every mark into the wrong
 * bracket — this used to make `ocrPaperFiling` decline the whole filing via
 * UNSUPPORTED_TEMPLATE_MARKER.
 *
 * In practice that decline path rarely even fired: the marker regex needs a
 * clean "$25,000,001" or "$50,000,000" token surviving whole-page OCR, and
 * on a real legacy filing (Dianne Feinstein, filed 2022-02-15, paper report
 * paper-f80e641017d0443cb76b) whole-page `extractWords` found zero usable
 * text anywhere below the form's own header — not just the amount-bracket
 * labels, but the two real data rows' asset names, dates, and marks too.
 * The filing landed as parse_status='empty' (zero transactions) rather than
 * 'unsupported', despite every field on the page being perfectly legible by
 * eye. Per-cell cropped OCR (the same technique ocrHousePtr.ts already
 * relies on for the House module, for the same reason) reliably recovers
 * every field on that same page — confirmed against the real image, not
 * assumed.
 *
 * Column positions below are measured directly from that filing's gridlines
 * (a fixed government form — identical layout for every filer using this
 * era's template, per this module's own top-of-file note), the same way
 * TYPE_COLUMNS/AMOUNT_COLUMNS above were presumably calibrated against a
 * real current-era filing. Row positions are NOT hardcoded — found
 * per-page via gridline detection, since the number of filled rows varies
 * filing to filing.
 */
const LEGACY_ASSET_COLUMN = { left: 229, right: 1108 };
const LEGACY_DATE_COLUMN = { left: 1467, right: 1843 };
const LEGACY_TYPE_COLUMNS: { x: number; code: string }[] = [
  { x: 1164, code: "P" },
  { x: 1286, code: "S" }, // the only mark directly confirmed against real ink (two independent rows)
  { x: 1409, code: "E" },
];
// The "Over $1,000,000***" bracket (present between $500,001-$1,000,000 and
// $1,000,001-$5,000,000) carries a footnote reference this module has no
// visibility into the meaning of — rather than guess which asterisked
// special case it represents, a mark there is recorded with an unresolved
// amount, same as any other field this module can't confidently read.
const LEGACY_AMOUNT_COLUMNS: { x: number; range: string; low: number | null; high: number | null }[] = [
  { x: 1902, range: "$1,001 - $15,000", low: 1001, high: 15000 },
  { x: 2020, range: "$15,001 - $50,000", low: 15001, high: 50000 },
  { x: 2139, range: "$50,001 - $100,000", low: 50001, high: 100000 },
  { x: 2258, range: "$100,001 - $250,000", low: 100001, high: 250000 },
  { x: 2376, range: "$250,001 - $500,000", low: 250001, high: 500000 },
  { x: 2494, range: "$500,001 - $1,000,000", low: 500001, high: 1000000 },
  { x: 2612, range: "(unreadable)", low: null, high: null }, // "Over $1,000,000***" — see note above
  { x: 2731, range: "$1,000,001 - $5,000,000", low: 1000001, high: 5000000 },
  { x: 2849, range: "$5,000,001 - $25,000,000", low: 5000001, high: 25000000 },
  { x: 2968, range: "$25,000,001 - $50,000,000", low: 25000001, high: 50000000 },
  { x: 3087, range: "Over $50,000,000", low: 50000001, high: null },
];
// The amount grid's own left border — anything left of this is Type/Date,
// anything at or past it is the amount grid. Also doubles as this
// template's fingerprint: if the expected column lines aren't found near
// here, this isn't the legacy layout and grid parsing should decline
// rather than misread.
const LEGACY_AMOUNT_GRID_LEFT_EDGE = 1843;
const LEGACY_GRID_LINE_TOLERANCE = 12; // px — allows for modest per-scan drift

async function greyscaleRaw(imageBuffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function darkFraction(raw: Buffer, imgWidth: number, x0: number, y0: number, x1: number, y1: number): number {
  let dark = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (raw[y * imgWidth + x] < 140) dark++;
      total++;
    }
  }
  return total === 0 ? 0 : dark / total;
}

/** Horizontal gridlines (row boundaries) found by scanning a vertical band that's bordered regardless of row content. */
function findRowLines(raw: Buffer, imgWidth: number, imgHeight: number, xBandStart: number, xBandEnd: number): number[] {
  const hits: number[] = [];
  for (let y = 0; y < imgHeight; y++) {
    let dark = 0;
    const bandLen = xBandEnd - xBandStart;
    for (let x = xBandStart; x < xBandEnd; x++) {
      if (raw[y * imgWidth + x] < 140) dark++;
    }
    if (bandLen > 0 && dark / bandLen > 0.75) hits.push(y);
  }
  const lines: number[] = [];
  let run: number[] = [];
  for (const y of hits) {
    if (run.length === 0 || y - run[run.length - 1] <= 3) run.push(y);
    else {
      lines.push(Math.round(run.reduce((a, b) => a + b, 0) / run.length));
      run = [y];
    }
  }
  if (run.length) lines.push(Math.round(run.reduce((a, b) => a + b, 0) / run.length));
  return lines;
}

/** Finds vertical gridlines within [xStart,xEnd) at a given y-band, same collapsing approach as findRowLines. */
function findColLinesInBand(raw: Buffer, imgWidth: number, y0: number, y1: number, xStart: number, xEnd: number): number[] {
  const hits: number[] = [];
  for (let x = xStart; x < xEnd; x++) {
    let dark = 0;
    for (let y = y0; y < y1; y++) {
      if (raw[y * imgWidth + x] < 140) dark++;
    }
    if ((y1 - y0) > 0 && dark / (y1 - y0) > 0.85) hits.push(x);
  }
  const lines: number[] = [];
  let run: number[] = [];
  for (const x of hits) {
    if (run.length === 0 || x - run[run.length - 1] <= 3) run.push(x);
    else {
      lines.push(Math.round(run.reduce((a, b) => a + b, 0) / run.length));
      run = [x];
    }
  }
  if (run.length) lines.push(Math.round(run.reduce((a, b) => a + b, 0) / run.length));
  return lines;
}

/**
 * Picks the marked column (if any) among candidates by comparing full-cell
 * darkness fractions — this template's X marks are thin typed/printed
 * characters, not filled boxes, so they read much fainter than
 * ocrHousePtr.ts's checkbox marks (confirmed real marks measured
 * ~0.08-0.12; every unmarked cell in the same rows measured exactly 0.000)
 * — calibrated to that gap, not reused from the House module's thresholds.
 */
function pickMarkedColumn<T extends { x: number }>(
  columns: T[],
  columnWidth: number,
  raw: Buffer,
  imgWidth: number,
  y0: number,
  y1: number
): T | null {
  const inset = Math.round(columnWidth * 0.15);
  const scored = columns.map((col) => ({
    col,
    darkness: darkFraction(raw, imgWidth, col.x - columnWidth / 2 + inset, y0 + 6, col.x + columnWidth / 2 - inset, y1 - 6),
  }));
  scored.sort((a, b) => b.darkness - a.darkness);
  const top = scored[0];
  const runnerUp = scored.length > 1 ? scored[1].darkness : 0;
  if (top.darkness < 0.03 || top.darkness - runnerUp < 0.02) return null; // no confident single mark — decline rather than guess
  return top.col;
}

const OCR_CELL_ATTEMPTS: { psm: PSM; pad: number }[] = [
  { psm: PSM.AUTO, pad: 20 },
  { psm: PSM.SINGLE_LINE, pad: 20 },
  { psm: PSM.SPARSE_TEXT, pad: 0 },
];

/** Crops one cell and returns the first non-empty OCR read across a few PSM configs (first-valid, not cross-checked — see module note). */
async function ocrCellText(worker: Worker, pageImage: Buffer, x0: number, y0: number, x1: number, y1: number): Promise<string> {
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const cropped = await sharp(pageImage).extract({ left: x0, top: y0, width, height }).toBuffer();
  for (const { psm, pad } of OCR_CELL_ATTEMPTS) {
    const input =
      pad > 0 ? await sharp(cropped).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 255, g: 255, b: 255 } }).toBuffer() : cropped;
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(input, {}, { text: true });
    const text = data.text.replace(/\s+/g, " ").trim();
    if (text.length > 0) return text;
  }
  return "";
}

function parseLegacyOwnerAndAsset(rawText: string): { assetName: string; owner: string | null; ticker: string | null; assetTypeCode: string | null } {
  // Border-line bleed commonly leaves stray "|" characters at either end of
  // a cropped cell's OCR text — strip before matching.
  let text = rawText.replace(/^[|\s]+|[|\s]+$/g, "").trim();
  let owner: string | null = null;
  const ownerMatch = text.match(/^\(?(S|SP|JT|DC)\)?\s*/i);
  if (ownerMatch) {
    const key = ownerMatch[1].toLowerCase();
    if (key in OWNER_PREFIX_MAP) {
      owner = OWNER_PREFIX_MAP[key];
      text = text.slice(ownerMatch[0].length).trim();
    }
  }
  const { name, ticker, assetTypeCode } = extractTickerAndType(text);
  return { assetName: name || text, owner, ticker, assetTypeCode };
}

/**
 * Grid-based fallback for a single page: used when word-extraction found
 * the transactions table but zero usable rows in it (see the module note
 * above for why that happens on real scans, not just legacy-template
 * ones). Returns null if this page's amount grid doesn't match the legacy
 * template's calibrated column positions — declines rather than guesses at
 * an unrecognized layout.
 *
 * `words` is the same whole-page OCR word list the caller already
 * extracted (word-level text recognition is much more reliable for a big
 * bold header than for the dense body text this fallback exists for at
 * all) — reused here purely to anchor where the real table starts, so row
 * detection doesn't wander up into the letterhead/instructions block above
 * it, which has its own share of wide dark horizontal strokes that would
 * otherwise be mistaken for row gridlines.
 */
async function parsePageByGrid(worker: Worker, pageImage: Buffer, words: OcrWord[]): Promise<SenateTransaction[] | null> {
  const { data: raw, width, height } = await greyscaleRaw(pageImage);

  // Confirm this page matches the legacy template's fingerprint: 12 column
  // lines (11 cells) starting at LEGACY_AMOUNT_GRID_LEFT_EDGE. Probed at a
  // fixed y-band near the top of the table body, where the grid is always
  // fully drawn regardless of which rows have content.
  const probeBand = findColLinesInBand(raw, width, 2100, 2860, LEGACY_AMOUNT_GRID_LEFT_EDGE - 5, 3200);
  const expectedFirst = LEGACY_AMOUNT_GRID_LEFT_EDGE;
  if (probeBand.length < 12 || Math.abs(probeBand[0] - expectedFirst) > LEGACY_GRID_LINE_TOLERANCE) {
    return null; // not the legacy layout (or too degraded to trust) — decline
  }

  // Anchor the search to just below "Identification of Assets" (the table's
  // own header, reliably OCR'd even when the body below it isn't) or the
  // "Example" label if that's what's visible on this page (a continuation
  // page has no "Identification of Assets" header of its own). Without
  // this anchor, row-line detection can pick up unrelated dark strokes from
  // the letterhead/instructions block above the table.
  const anchorWord = words.find((w) => /identification/i.test(w.text) || /^example$/i.test(w.text.trim()));
  const bodyTop = anchorWord ? anchorWord.y1 + 10 : Math.round(height * 0.4);

  // Row boundaries: dynamic, since populated-row count varies per filing.
  // Probed inside the amount grid (always bordered) across the whole page.
  const rowLines = findRowLines(raw, width, height, LEGACY_AMOUNT_GRID_LEFT_EDGE + 50, LEGACY_AMOUNT_GRID_LEFT_EDGE + 900).filter(
    (y) => y >= bodyTop
  );
  if (rowLines.length < 2) return null;

  // The form's first transactions page always carries two pre-printed
  // "Example" rows (IBM Corp / DC Microsoft) directly below the header,
  // before row 1 — fixed by the template, not by what any given filer
  // submitted. Their placeholder text sits inside the row-number column
  // rather than the asset-name cell this loop reads, so it can't be
  // filtered by content; skipping the first two row-bands after the anchor
  // is reliable instead. A continuation page (no "Identification of
  // Assets" header, no Example rows) anchors on "Example" itself and has
  // none to skip — detected via the same word search above.
  const hasExampleRows = /identification/i.test(anchorWord?.text ?? "");
  const dataRowStart = hasExampleRows ? 2 : 0;

  const transactions: SenateTransaction[] = [];

  for (let i = dataRowStart; i < rowLines.length - 1; i++) {
    const y0 = rowLines[i];
    const y1 = rowLines[i + 1];
    if (y1 - y0 < 80) continue; // narrower than a real data row (e.g. a stray line inside the header) — skip

    // A blank template row has, at most, faint anti-aliasing/gridline bleed
    // in the asset-name cell; real content reads meaningfully darker.
    // Confirmed against a real filing's actual blank rows (measured
    // ~0.000-0.006) vs. its two real rows (~0.03-0.05) — this floor sits
    // clearly above the former and below the latter.
    const assetDarkness = darkFraction(raw, width, LEGACY_ASSET_COLUMN.left, y0 + 10, LEGACY_ASSET_COLUMN.right, y1 - 10);
    if (assetDarkness < 0.015) continue;

    const rawAssetText = await ocrCellText(worker, pageImage, LEGACY_ASSET_COLUMN.left, y0, LEGACY_ASSET_COLUMN.right, y1);
    // A genuinely blank cell can still OCR-hallucinate 1-2 garbage
    // characters from scan noise — require at least two consecutive
    // letters (no real asset name is shorter) before trusting the read.
    if (!rawAssetText || !/[A-Za-z]{2,}/.test(rawAssetText)) continue;
    const { assetName, owner, ticker, assetTypeCode } = parseLegacyOwnerAndAsset(rawAssetText);
    if (!assetName || !/[A-Za-z]{2,}/.test(assetName)) continue;

    const rawDateText = await ocrCellText(worker, pageImage, LEGACY_DATE_COLUMN.left, y0, LEGACY_DATE_COLUMN.right, y1);
    const dateDigits = rawDateText.replace(/[^\d/]/g, "");
    const transactionDate = toIsoDateSlash(dateDigits);

    const typeCellWidth = LEGACY_TYPE_COLUMNS.length > 1 ? LEGACY_TYPE_COLUMNS[1].x - LEGACY_TYPE_COLUMNS[0].x : 120;
    const typeMark = pickMarkedColumn(LEGACY_TYPE_COLUMNS, typeCellWidth, raw, width, y0, y1);

    const amountCellWidth = LEGACY_AMOUNT_COLUMNS[1].x - LEGACY_AMOUNT_COLUMNS[0].x;
    const amountMark = pickMarkedColumn(LEGACY_AMOUNT_COLUMNS, amountCellWidth, raw, width, y0, y1);

    transactions.push({
      transactionDate,
      owner,
      ticker,
      assetName,
      assetTypeCode,
      transactionType: typeMark?.code ?? "",
      amountRange: amountMark?.range ?? "(unreadable)",
      amountLow: amountMark?.low ?? null,
      amountHigh: amountMark?.high ?? null,
    });
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

      let pageTransactions = parsePageWords(words);
      if (pageTransactions.length === 0) {
        // Whole-page word extraction found the table but no usable rows —
        // on a real filing this happened even though the page was fully
        // legible (see parsePageByGrid's doc comment). Retry with
        // per-cell-cropped OCR before giving up on this page.
        const gridResult = await parsePageByGrid(worker, png, words);
        if (gridResult) pageTransactions = gridResult;
      }

      allTransactions.push(...pageTransactions);
    }

    if (!sawTransactionsTable) return null;
    return allTransactions;
  } finally {
    await worker.terminate();
  }
}
