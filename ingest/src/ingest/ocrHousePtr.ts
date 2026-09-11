import { pdf } from "pdf-to-img";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import type { ParsedTransaction } from "./parsePtr.js";

/**
 * Extracts transaction data from a scanned/paper-filed House PTR via OCR.
 *
 * Some House filings — hand-delivered paper forms, mostly — have no
 * extractable text at all (see run.ts's 'empty' status); they're rendered
 * as scanned page images inside the PDF. The paper PTR form is a fixed
 * grid: owner, "Full Asset Name", 3-4 Transaction-Type checkboxes
 * (Purchase/Sale/[Partial Sale]/Exchange — the form gained a "Partial
 * Sale" column at some point; both variants are handled), two dates, and
 * ten lettered Amount-of-Transaction checkbox columns (A-J), rendered
 * landscape.
 *
 * Approach, arrived at after the first attempt (single full-page OCR pass)
 * turned out unreliable — Tesseract's default segmentation gets confused
 * by a page this dense with checkbox grid lines, garbling even the plain
 * printed dates near it:
 *
 *  1. Row and column boundaries are found from the scanned grid lines
 *     themselves (pixel-darkness scans, both directions) — not OCR, not
 *     hardcoded pixel positions. This adapts to each scan's own slightly
 *     different cropping/scaling, and to the 3- vs 4-type-column template
 *     variants, rather than assuming one fixed layout.
 *  2. Each text field (owner, asset name, date, date notified) is OCR'd as
 *     its *own* tightly-cropped, padded cell image — full-column or
 *     full-row OCR passes were unreliable even when the content was
 *     visually unambiguous; small isolated crops are dramatically more
 *     accurate. Several (page-segmentation-mode, padding) combinations are
 *     tried per cell; the first result matching that field's expected
 *     shape (a date pattern, a real owner code, non-empty text) wins.
 *  3. Type/Amount checkboxes are read by ink density within each cell, not
 *     OCR — a checked box has meaningfully more dark pixels than an empty
 *     one's outline alone, and this doesn't depend on distinguishing an
 *     "X" from a "✓" as text (both scan-style variants occur).
 *  4. Anything no attempt can confidently resolve is *not* guessed at: the
 *     row is either skipped (no asset name — nothing usable to attribute)
 *     or kept with the specific field left unresolved, and an issue is
 *     recorded either way. Callers get both the transactions and the issue
 *     list, for exactly the "tell me what you couldn't figure out" case.
 *
 * Still meaningfully less certain than text-native extraction — mark
 * results distinctly (parse_status = 'ocr'), not with the same confidence.
 */

const RENDER_SCALE = 3;

export interface HouseOcrIssue {
  page: number;
  row: number;
  field: string;
  reason: string;
  context: string;
}

export interface HouseOcrResult {
  transactions: ParsedTransaction[];
  issues: HouseOcrIssue[];
  // True when every page that declined to produce a grid was confirmed to
  // be a non-PTR document (a Campaign Notice disclosure exemption, so far
  // — see looksLikeNonPtrDocument) rather than a genuinely unread PTR page.
  // Callers should record this distinctly from a real parse failure: zero
  // transactions here is correct, not a gap.
  notAPtr: boolean;
}

const OWNER_VALUES = new Set(["SP", "DC", "JT"]);

// Government-form dollar brackets, in order — always the last 10 non-flag
// columns of the amount grid, regardless of how many Type columns precede
// them (see resolveColumnRoles).
const AMOUNT_RANGES: { range: string; low: number | null; high: number | null }[] = [
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

const TYPE_CODES_3COL = ["P", "S", "E"];
const TYPE_CODES_4COL = ["P", "S", "S (partial)", "E"];

const EXAMPLE_ASSET_DENYLIST = /\bmega\s*corp\b/i;

// A scanned form's own printed "Full Asset Name" text frequently ends with
// the ticker in parens — e.g. "Alibaba Group Holding (BABA)" — the same way
// a text-native e-filing renders it (see TICKER_PATTERN in parsePtr.ts), but
// nothing here was ever extracting it: every OCR row hardcoded ticker: null.
// Confirmed on a real filing, Byron Donalds doc 8220682 (167 rows, all with
// a real ticker sitting right there in the OCR'd text). A trailing "|" is a
// common OCR artifact from an adjacent column's border line bleeding into
// the cell, tolerated here the same way it's tolerated elsewhere.
//
// Two false positives turned up checking this against the live database
// before shipping it: "...COMPANY (THE)" (part of a formal company name,
// e.g. "Procter & Gamble Company (The)") and "...(NEW)" (means newly-issued
// shares, not a ticker) — both denylisted rather than trusted blindly.
const OCR_TICKER_PATTERN = /\(([A-Z]{1,6}(?:\.[A-Z])?)\)\s*\|?\s*$/;
const OCR_TICKER_DENYLIST = new Set(["THE", "NEW", "OLD"]);

function extractOcrTicker(assetName: string): string | null {
  const match = assetName.match(OCR_TICKER_PATTERN);
  if (!match) return null;
  const ticker = match[1];
  return OCR_TICKER_DENYLIST.has(ticker) ? null : ticker;
}

// A bold, centered printed checkmark (one real filing, printed with its own
// small drawn checkbox square inside the cell) and a fainter, off-center
// handwritten "X" (another filing, no inner box at all — just a mark placed
// anywhere in the plain table cell) turned out to need genuinely different
// treatment, not just different thresholds on the same measurement:
//  - The printed-checkbox style has a *large* inner border (its own drawn
//    square) contributing ~30% baseline darkness even well inside the
//    cell, so it needs a deep inset (0.32) to get past that box's own
//    border and see whether the interior is filled in.
//  - The plain-cell handwritten style has no such inner box, so a mark can
//    sit anywhere — including near an edge or corner — and a deep inset
//    crops it out of the measured region entirely (verified: a confirmed,
//    visible "X" positioned low in its cell measured *zero* darkness at
//    inset 0.32). Its own outer table gridline is the only border to avoid,
//    and that line's stroke width turned out to matter too: at inset 0.05
//    a single thick gridline stroke can outweigh a genuine but faint mark
//    in a neighboring cell (verified: an empty cell's right border alone
//    outscored a real "X" one cell over). Insetting a bit further (0.10)
//    reliably clears the gridline stroke while still keeping off-center
//    marks in frame.
// Rather than pick one inset, both are measured and cross-checked — see
// pickMarkedCell. Each inset's own pass uses thresholds calibrated to its
// own signal scale (the printed-checkbox regime measures ~0.3-0.4 when
// marked; the plain-cell handwritten regime measures ~0.02-0.07) — a
// shared threshold would either be too strict for the faint case or too
// loose for the bold one.
const CHECKBOX_INSET_TIGHT = 0.1;
const CHECKBOX_INSET_WIDE = 0.32;
const CHECKBOX_TIGHT_FLOOR = 0.01;
const CHECKBOX_TIGHT_GAP_MIN = 0.008;
const CHECKBOX_WIDE_FLOOR = 0.15;
const CHECKBOX_WIDE_GAP_MIN = 0.06;
const OWNER_INSET = 0.2;
const OWNER_DARK_THRESHOLD = 0.05;
const ASSET_INSET = 0.15;
// Calibrated against a real typed (not handwritten) filing where every row
// was genuinely filled but measured only 0.10-0.13 — apparently a typeset
// asset name just doesn't fill as much of its cell as handwriting does —
// against a confirmed-blank row on that same page/template measuring 0.00.
// 0.12 (the original threshold, tuned only against handwritten samples) was
// silently dropping that filing's real rows one at a time.
const ASSET_DARK_THRESHOLD = 0.095;
// Handwriting occasionally spills outside its printed cell (verified on a
// real filing: a wrapped two-line entry left only its second line inside
// the detected row bounds, the rest bleeding into the row above), landing
// between "genuinely blank" (empty cells measured ~0.06-0.08 in
// calibration) and the confident-content threshold above. Below this floor
// is still treated as blank; between the two is flagged rather than
// silently skipped, since it's evidence of real content the row-grid just
// didn't fully capture.
const ASSET_MAYBE_THRESHOLD = 0.08;

interface GridLines {
  rows: number[]; // y boundaries, table body only (header excluded)
  cols: number[]; // x boundaries, left to right
}

interface ColumnRoles {
  ownerIdx: number; // column index (0-based, into cols/cols+1 pairs) for owner
  assetIdx: number;
  typeIdxs: number[]; // one per Purchase/Sale/[Partial]/Exchange
  typeCodes: string[];
  dateIdx: number;
  dateNotifiedIdx: number;
  amountIdxs: number[]; // exactly 10, in AMOUNT_RANGES order
}

async function greyscaleRaw(imageBuffer: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(imageBuffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Fraction of dark pixels within a region — inset inward from the given
 * bounds by `insetFrac` of the region's own width/height first. The cell's
 * own border lines contribute a large, inconsistent baseline darkness
 * (calibrated: a small checkbox's outline alone measures ~30% dark on the
 * *full* cell — comparable to or larger than an actual checkmark's own
 * contribution), so measuring border-to-border swamps the real signal.
 * Insetting past the border leaves only genuine content ink, which turned
 * out to separate empty from marked far more reliably (measured: empty
 * checkbox interiors ≤0.17, marked ones ≥0.28, at inset=0.32).
 */
function darkFraction(raw: Buffer, imgWidth: number, imgHeight: number, x0: number, y0: number, x1: number, y1: number, insetFrac = 0): number {
  const insetX = (x1 - x0) * insetFrac;
  const insetY = (y1 - y0) * insetFrac;
  const cx0 = Math.max(0, Math.round(x0 + insetX));
  const cy0 = Math.max(0, Math.round(y0 + insetY));
  const cx1 = Math.min(imgWidth, Math.round(x1 - insetX));
  const cy1 = Math.min(imgHeight, Math.round(y1 - insetY));
  if (cx1 <= cx0 || cy1 <= cy0) return 0;
  let dark = 0;
  let total = 0;
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      if (raw[y * imgWidth + x] < 140) dark++;
      total++;
    }
  }
  return total === 0 ? 0 : dark / total;
}

/**
 * Single-inset pick: which candidate (if any) clearly leads its closest
 * competitor, by absolute gap. Compares against the single runner-up, not
 * the group average — with up to 10 candidates (the Amount row), averaging
 * in eight near-zero cells hides a close, genuine second-place competitor
 * behind an artificially large-looking "gap to the group"; the runner-up is
 * the only comparison that actually reflects the ambiguity between the top
 * two candidates (verified against real conflicting-mark rows: two visibly
 * marked cells in the same row consistently measure within ~0.005 of each
 * other, while a genuine single mark leads its nearest empty neighbor by
 * 0.01+).
 */
function pickAtInset(darkness: number[], floor: number, gapMin: number): number | null {
  if (darkness.length === 0) return null;
  const ranked = darkness.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d);
  const top = ranked[0];
  const runnerUp = ranked.length > 1 ? ranked[1].d : 0;
  if (top.d < floor || top.d - runnerUp < gapMin) return null;
  return top.i;
}

type MarkPick = { index: number; agreed: boolean } | null;

/**
 * Picks the marked cell (if any) from a row's group of checkbox candidates,
 * measured at both a tight and a wide inset (see the constants above for
 * why neither alone is reliable across different scans). If both insets
 * agree on the same cell, that's a confident pick. If only one finds a
 * clear leader, that's accepted too — a real mark that only *one* inset
 * isolates well is still a real mark, not a coin flip — but flagged as not
 * fully agreed so callers can decide whether to log it. If they pick
 * *different* cells, that's a genuine conflict: returns null rather than
 * arbitrarily preferring one inset over the other.
 */
function pickMarkedCell(cellBounds: { x0: number; y0: number; x1: number; y1: number }[], raw: Buffer, imgWidth: number, imgHeight: number): MarkPick {
  const tight = cellBounds.map((c) => darkFraction(raw, imgWidth, imgHeight, c.x0, c.y0, c.x1, c.y1, CHECKBOX_INSET_TIGHT));
  const wide = cellBounds.map((c) => darkFraction(raw, imgWidth, imgHeight, c.x0, c.y0, c.x1, c.y1, CHECKBOX_INSET_WIDE));
  const tightPick = pickAtInset(tight, CHECKBOX_TIGHT_FLOOR, CHECKBOX_TIGHT_GAP_MIN);
  const widePick = pickAtInset(wide, CHECKBOX_WIDE_FLOOR, CHECKBOX_WIDE_GAP_MIN);

  if (tightPick !== null && widePick !== null) {
    return tightPick === widePick ? { index: tightPick, agreed: true } : null; // conflicting picks — don't guess
  }
  const solo = tightPick ?? widePick;
  return solo !== null ? { index: solo, agreed: false } : null;
}

/** Finds evenly (or near-evenly) spaced grid lines along one axis within a band of the perpendicular axis. */
function findGridLines(
  raw: Buffer,
  imgWidth: number,
  imgHeight: number,
  axis: "row" | "col",
  bandStart: number,
  bandEnd: number
): number[] {
  const length = axis === "row" ? imgHeight : imgWidth;
  const darkFrac = new Array(length).fill(0);
  for (let p = 0; p < length; p++) {
    let dark = 0;
    const bandLen = bandEnd - bandStart;
    for (let q = bandStart; q < bandEnd; q++) {
      const idx = axis === "row" ? p * imgWidth + q : q * imgWidth + p;
      if (raw[idx] < 100) dark++;
    }
    darkFrac[p] = bandLen === 0 ? 0 : dark / bandLen;
  }
  const hits: number[] = [];
  for (let p = 0; p < length; p++) if (darkFrac[p] > 0.75) hits.push(p);
  const lines: number[] = [];
  let runStart: number | null = null;
  let prev: number | null = null;
  for (const p of hits) {
    if (runStart === null) runStart = p;
    else if (prev !== null && p - prev > 3) {
      lines.push(Math.round((runStart + prev) / 2));
      runStart = p;
    }
    prev = p;
  }
  if (runStart !== null && prev !== null) lines.push(Math.round((runStart + prev) / 2));
  // A blurry/skewed scan can split one real gridline into two detections a
  // few pixels apart — genuine columns in this form are never closer than
  // ~50px, so collapse anything tighter than that into a single line.
  return mergeCloseLines(lines, 50);
}

function mergeCloseLines(lines: number[], minGap: number): number[] {
  if (lines.length === 0) return lines;
  const merged: number[] = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] - merged[merged.length - 1] < minGap) {
      merged[merged.length - 1] = Math.round((merged[merged.length - 1] + lines[i]) / 2);
    } else {
      merged.push(lines[i]);
    }
  }
  return merged;
}

/** Longest run of consecutive lines spaced ~equally (the real table grid, not header/filer-info borders). */
function longestConsistentRun(lines: number[], toleranceFrac = 0.12): number[] {
  if (lines.length < 3) return lines;
  const deltas = lines.slice(1).map((v, i) => v - lines[i]);
  const rounded = deltas.map((d) => Math.round(d / 5) * 5);
  const counts = new Map<number, number>();
  for (const r of rounded) counts.set(r, (counts.get(r) ?? 0) + 1);
  const modeDelta = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const tolerance = Math.max(6, modeDelta * toleranceFrac);

  let best: number[] = [];
  let current: number[] = [lines[0]];
  for (let i = 0; i < deltas.length; i++) {
    if (Math.abs(deltas[i] - modeDelta) <= tolerance) {
      current.push(lines[i + 1]);
    } else {
      if (current.length > best.length) best = current;
      current = [lines[i + 1]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

/**
 * Maps detected column boundaries to semantic roles. The amount grid is
 * always the last 10 columns before any trailing flag column; owner/asset
 * are always the first two; everything between asset and the date columns
 * is Type checkboxes (3 or 4 of them, depending on form era) — dates are
 * identified as the two columns immediately before the amount grid.
 *
 * Two column-count variants are recognized: the standard template carries a
 * trailing "K" flag column (Transaction in a Spouse/Dependent Child Asset)
 * after the amount grid, giving 18 (3 type columns) or 19 (4, "Partial
 * Sale" added later) total columns. An older/simpler paper template omits
 * that flag column entirely — verified against a real filing with a fully
 * legible table that was otherwise being declined outright — giving 17
 * columns for its 3 type columns. The flag column's presence or absence
 * doesn't shift anything *before* it, so this only changes which column
 * count maps to which type count, not the index arithmetic below.
 */
function resolveColumnRoles(cols: number[]): ColumnRoles | null {
  const colCount = cols.length - 1; // N boundaries -> N-1 columns

  // A further template variant carries two extra single-purpose checkbox
  // columns between the 3 Transaction-Type boxes and the date columns —
  // "Capital Gains Exceed $200" and "Partial Transaction" — confirmed
  // visually against a real filing (Khanna doc 8218940, p5, rotated
  // upright): a ~430px-wide Asset Name column at index 1 (matching "Full
  // Asset Name"), then six columns of ~60-120px before the two date
  // columns, then exactly 10 Amount columns, then a trailing K flag
  // column, for 20 total. Neither extra column is Transaction Type and
  // neither is tracked by our schema, so both are skipped entirely (not
  // read, not logged) rather than folded into typeIdxs.
  //
  // 20 columns can also appear as a coincidental false positive on a
  // *wrong*-orientation candidate (verified against a real filing, Khanna
  // 9116328 p3: its genuinely-upright reading is 19 columns via the
  // existing branch below, but the same page rotated 180° also detects 20
  // columns purely by geometric coincidence). Column *count* alone can't
  // tell these apart, but column *shape* can: the real template's Asset
  // Name column is always by far the widest column on the page (~430px vs
  // a ~60-130px max elsewhere in the confirmed-correct case), which a
  // coincidental match doesn't reproduce (the same wrong-orientation
  // candidate measured its index-1 column at only ~90px, no wider than
  // several others). Requiring asset to be at least 2x the next-widest
  // column is a cheap, purely structural guard against exactly that
  // false-positive, with no OCR involved.
  if (colCount === 20) {
    const widths = cols.slice(1).map((v, i) => v - cols[i]);
    const assetWidth = widths[1];
    const maxOtherWidth = Math.max(...widths.filter((_, i) => i !== 1));
    if (assetWidth < maxOtherWidth * 2) return null; // doesn't look like a real Asset Name column — decline rather than guess

    return {
      ownerIdx: 0,
      assetIdx: 1,
      typeIdxs: [2, 3, 4], // Purchase, Sale, Exchange — 5 and 6 (Capital Gains Exceed $200, Partial Transaction) are skipped
      typeCodes: TYPE_CODES_3COL,
      dateIdx: 7,
      dateNotifiedIdx: 8,
      amountIdxs: Array.from({ length: 10 }, (_, i) => 9 + i),
    };
  }

  const typeCount = colCount === 17 ? 3 : colCount - 15;
  if (typeCount !== 3 && typeCount !== 4) return null; // unrecognized template — decline rather than guess

  const ownerIdx = 0;
  const assetIdx = 1;
  const typeIdxs = Array.from({ length: typeCount }, (_, i) => 2 + i);
  const dateIdx = 2 + typeCount;
  const dateNotifiedIdx = dateIdx + 1;
  const amountIdxs = Array.from({ length: 10 }, (_, i) => dateNotifiedIdx + 1 + i);

  return {
    ownerIdx,
    assetIdx,
    typeIdxs,
    typeCodes: typeCount === 3 ? TYPE_CODES_3COL : TYPE_CODES_4COL,
    dateIdx,
    dateNotifiedIdx,
    amountIdxs,
  };
}

function toIsoDateSlash(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, yyRaw] = m;
  const mmN = Number(mm),
    ddN = Number(dd);
  if (mmN < 1 || mmN > 12 || ddN < 1 || ddN > 31) return null;
  // A misread digit can drop a 4-digit year to 3 (OCR read "2026" as
  // "261") — that's neither a real 2-digit nor 4-digit year, and silently
  // treating it as one produced a ~1765-years-off date that made it all the
  // way into production (e.g. "261-07-20"). Only accept the two lengths
  // that are actually unambiguous.
  if (yyRaw.length !== 2 && yyRaw.length !== 4) return null;
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

type CellValidator = (raw: string) => string | null; // returns normalized value, or null if invalid

const VALIDATE_DATE: CellValidator = (raw) => {
  const cleaned = raw.replace(/[^\d/]/g, "");
  return toIsoDateSlash(cleaned) ? cleaned : null;
};
const VALIDATE_OWNER: CellValidator = (raw) => {
  const cleaned = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  return OWNER_VALUES.has(cleaned) ? cleaned : null;
};
const VALIDATE_NONEMPTY: CellValidator = (raw) => {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned.length >= 2 ? cleaned : null;
};

const OCR_ATTEMPTS: { psm: PSM; pad: number }[] = [
  { psm: PSM.SINGLE_LINE, pad: 20 },
  { psm: PSM.AUTO, pad: 20 },
  { psm: PSM.SPARSE_TEXT, pad: 0 },
  { psm: PSM.SINGLE_LINE, pad: 0 },
  { psm: PSM.SINGLE_WORD, pad: 0 },
];

interface CellOcrResult {
  value: string | null;
  /** false when at least two OCR attempts validly disagreed on the value — a
   *  format-valid result isn't necessarily a *correct* one (a misread digit
   *  still produces a valid-looking date), so cross-checking multiple
   *  independent attempts against each other is the only signal available
   *  for "plausible but possibly wrong" as opposed to "clearly unreadable". */
  confident: boolean;
}

/** Crops one cell, tries several OCR configs, returns the first result passing `validate`. */
async function ocrCell(worker: Worker, pageImage: Buffer, region: { x0: number; y0: number; x1: number; y1: number }, validate: CellValidator): Promise<string | null> {
  const r = await ocrCellChecked(worker, pageImage, region, validate);
  return r.value;
}

/** Like ocrCell, but runs every attempt (not just until the first success) and reports whether they agreed. */
async function ocrCellChecked(
  worker: Worker,
  pageImage: Buffer,
  region: { x0: number; y0: number; x1: number; y1: number },
  validate: CellValidator
): Promise<CellOcrResult> {
  const width = Math.max(1, Math.round(region.x1 - region.x0));
  const height = Math.max(1, Math.round(region.y1 - region.y0));
  const cropped = await sharp(pageImage)
    .extract({ left: Math.round(region.x0), top: Math.round(region.y0), width, height })
    .toBuffer();

  const validResults: string[] = [];
  for (const { psm, pad } of OCR_ATTEMPTS) {
    const input = pad > 0 ? await sharp(cropped).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 255, g: 255, b: 255 } }).toBuffer() : cropped;
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(input, {}, { text: true });
    const validated = validate(data.text);
    if (validated) validResults.push(validated);
  }
  if (validResults.length === 0) return { value: null, confident: false };

  const counts = new Map<string, number>();
  for (const v of validResults) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { value: ranked[0][0], confident: ranked.length === 1 };
}

interface TableStructure {
  raw: Buffer;
  width: number;
  height: number;
  rowLines: number[];
  colLines: number[];
  roles: ColumnRoles;
}

// A filing whose first page is entirely the transactions table (the usual
// case for a multi-page filing's continuation pages, and what this module
// was originally calibrated against) has no other horizontal dividers for
// the row-line scan below to confuse the real row grid with. A single-page
// filing — the whole report, filer-info box and table together on one page
// (confirmed on real filings: Sarbanes doc 8219524, San Nicolas doc
// 8219092) — does: the info box above the table has its own irregular
// horizontal dividers (Name/Telephone row, Member-of-Congress row, IPO
// Yes/No row, etc.), and picking the "most evenly-spaced run" among ALL of
// them can lock onto a few of those instead of the real (much shorter)
// table below. The table's own printed column headers — "TYPE",
// "TRANSACTION", "DATE", "ASSET", etc. — sit directly above the table on
// every page that has this info-box layout, so finding the lowest one
// anchors the row search to just the real table, without needing to
// distinguish the two by pixel geometry alone (verified more reliable than
// a pixel-only approach — see the full-page-width darkness heuristic this
// replaced, which didn't cleanly separate the two on a real sample).
const TABLE_HEADER_WORD_PATTERN = /^(ASSET|TYPE|TRANSACTION|DATE|NOTIFIED|AMOUNT)$/i;

async function findTableHeaderBottom(worker: Worker, pageImage: Buffer, pageWidth: number, pageHeight: number): Promise<number | null> {
  // The info box + table header always sit in the page's upper portion; a
  // continuation page (no info box, table starts near the top) has no
  // matching words up here either, and this returns null — callers fall
  // back to the original unrestricted search in that case.
  const searchHeight = Math.round(pageHeight * 0.7);
  const strip = await sharp(pageImage).extract({ left: 0, top: 0, width: pageWidth, height: searchHeight }).toBuffer();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(strip, {}, { text: true, blocks: true });
  let maxY1: number | null = null;
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          if (TABLE_HEADER_WORD_PATTERN.test(word.text.trim()) && (maxY1 === null || word.bbox.y1 > maxY1)) {
            maxY1 = word.bbox.y1;
          }
        }
      }
    }
  }
  return maxY1;
}

// A doc_id filed under the House Clerk's PTR filing-type code isn't always
// an actual trade report — a House candidate who hasn't raised or spent
// over $5,000 (and so is exempt from any financial disclosure) files a
// one-page "Campaign Notice" instead, and the Clerk's own index doesn't
// distinguish it from a real PTR (confirmed on a real filing: Richard B.
// Reisdorf, doc 8218652 — a signed notice titled "CAMPAIGN NOTICE
// REGARDING FINANCIAL DISCLOSURE REQUIREMENT", zero trades, by design,
// not by a reading failure). No recognizable transaction grid on such a
// page isn't a declined read the way a genuine hard-to-scan PTR is — it's
// confirmation there was never a table here to find. Checked only once
// every other page in the PDF has already failed detectTableWithRotation
// (this document type never has a real table, so there's nothing lost by
// checking last rather than first).
const NON_PTR_DOCUMENT_MARKER = /CAMPAIGN\s+NOTICE|WITHDRAWAL\s+OF\s+CANDIDACY|THRESHOLD\s+NOT\s+EXCEEDED/i;

async function looksLikeNonPtrDocument(worker: Worker, pageImage: Buffer): Promise<boolean> {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(pageImage, {}, { text: true });
  return NON_PTR_DOCUMENT_MARKER.test(data.text);
}

/**
 * Locates the transaction grid in an already-upright page image: row lines
 * (the longest evenly-spaced run, wherever the table body sits under a
 * possible filer-info header) and column lines (scanned from a thin band at
 * a row boundary — see findGridLines). Returns null if no recognizable grid
 * is present (cover/certification page, or a column count that matches
 * neither known template).
 */
async function detectTable(pageImage: Buffer, worker?: Worker): Promise<TableStructure | null> {
  const { data: raw, width, height } = await greyscaleRaw(pageImage);
  const headerBottom = worker ? await findTableHeaderBottom(worker, pageImage, width, height) : null;
  const rowSearchStart = headerBottom ? headerBottom + 10 : 0;
  const allRowLines = findGridLines(raw, width, height, "row", Math.round(0.43 * width), Math.round(0.55 * width)).filter(
    (y) => y >= rowSearchStart
  );
  const rowLines = longestConsistentRun(allRowLines);
  if (rowLines.length < 2) return null;

  // 25px rather than a razor-thin band: on one real scan, several column
  // lines didn't read as fully continuous within the first ~12px below the
  // row boundary (mild blur/skew right at the edge), undercounting columns
  // — verified safe against checkmark-ink interference up to 25px on both
  // dev samples (same column counts as the thinner band).
  const colBandStart = rowLines[0];
  const colBandEnd = Math.min(rowLines[0] + 25, rowLines[1]);
  const colLines = findGridLines(raw, width, height, "col", colBandStart, colBandEnd);
  const roles = resolveColumnRoles(colLines);
  if (!roles) return null;

  return { raw, width, height, rowLines, colLines, roles };
}

// The full official header ("UNITED STATES HOUSE OF REPRESENTATIVES") only
// actually appears on a filing's first/cover page — verified against a real
// filing (Khanna 8218940): its continuation pages (e.g. p5) carry only the
// per-page "NAME: <member>  Page X of Y" line at the top instead. Relying on
// the official-header phrase alone meant looksUpright could never confirm a
// continuation page as upright regardless of its actual orientation, always
// declining the tiebreak on exactly the multi-candidate pages that need it
// most. "PAGE \d+ OF \d+" came through fairly clean in OCR even when the
// surrounding "NAME:" text itself garbled badly (confirmed: "Page 5 of 67"
// read correctly apart from a misread digit, right next to "AMY:
// Bchitihaces Pugs oF" for what should have been "NAME: Rohit Khanna Page
// __ of __"), so it's used as a second, independent confirmation signal
// rather than tightening/replacing the original pattern.
//
// A single-page filing (the whole report — header and transaction table
// together on one page, e.g. Sarbanes doc 8219524) is neither of those
// cases: no "Page X of Y" line at all, and "HOUSE OF REPRESENTATIVES" sits
// low enough in the header box that it falls below looksUpright's top-15%
// strip. That page's own title, "Periodic Transaction Report", prints at
// the very top of every page — cover, continuation, or single-page alike —
// and was the only thing in that strip that actually OCR'd as real text at
// the correct rotation (confirmed: the wrong rotation's strip read as pure
// noise, "COO O00O000000000", while the correct one read "HAND DELIVERED /
// Periodic Transaction Report" cleanly) — added as a third, independent
// signal for exactly this case.
const HEADER_TEXT_PATTERN = /UNITED\s+STATES|HOUSE\s+OF\s+REPRESENTATIVES|PAGE\s*\d+\s*OF\s*\d+|PERIODIC\s+TRANSACTION\s+REPORT/i;

/**
 * Checks whether a page image is right-side up by OCRing its top strip for
 * the form's own printed header ("UNITED STATES HOUSE OF REPRESENTATIVES"
 * on a cover page) or its per-page "Page X of Y" line (present on every
 * page, cover or continuation). Needed because the *grid* geometry alone
 * can't tell a correct rotation from its 180°-opposite: a rectangular grid
 * of evenly-spaced lines looks identical read forwards or backwards, so a
 * landscape page rotated 90° and the same page rotated 270° both pass grid
 * detection with the *same* column count (verified against a real filing)
 * — only the actual header text, which sits above the table, disambiguates
 * which one is upright.
 */
async function looksUpright(worker: Worker, pageImage: Buffer): Promise<boolean> {
  const meta = await sharp(pageImage).metadata();
  if (!meta.width || !meta.height) return false;
  const stripHeight = Math.round(meta.height * 0.15);
  const strip = await sharp(pageImage).extract({ left: 0, top: 0, width: meta.width, height: stripHeight }).toBuffer();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(strip, {}, { text: true });
  return HEADER_TEXT_PATTERN.test(data.text);
}

/**
 * An as-is (0°) grid pass is trusted unconditionally *unless* a 90° or 270°
 * candidate shows a substantially denser grid — the actual signature of a
 * confirmed failure mode (Khanna doc 8218940 p5: 0° coincidentally read a
 * sparse 3-row "grid" off an unrelated pixel pattern while the true
 * orientation, 270° away, had 18 real rows) — rather than blanket-checking
 * every page against every rotation.
 *
 * 180° is deliberately excluded from that comparison. It's 0°'s geometric
 * mirror-twin: a rectangular grid of evenly-spaced lines looks identical
 * read forwards or backwards, so whenever 0° is genuinely upright, 180°
 * routinely passes too with the *same* row/column counts (verified — this
 * is not rare, it's close to universal for a real table). Comparing 0°
 * against 180° for "is this ambiguous" would treat that routine, harmless
 * tie as a reason to distrust a page that was fine all along — confirmed by
 * an earlier version of this fix that pooled all four rotations unconditionally
 * and, on a real filing (Khanna 9116328), fell through to the header-text
 * tiebreaker on nearly every page (since 0/180 tied on rows almost every
 * time), which is unreliable on continuation pages and silently dropped six
 * pages' worth of otherwise-correct transactions (99 → 61 total). 90°/270°
 * don't share that structural symmetry with 0° (a sideways scan's row
 * spacing bears no routine relationship to the upright grid's), so a large
 * gap there is actual evidence, not routine noise.
 */
async function detectTableWithRotation(worker: Worker, pageImage: Buffer): Promise<{ pageImage: Buffer; table: TableStructure } | null> {
  const upright = await detectTable(pageImage, worker);

  const sideways: { pageImage: Buffer; table: TableStructure }[] = [];
  for (const rotation of [90, 270] as const) {
    const candidate = await sharp(pageImage).rotate(rotation).toBuffer();
    const table = await detectTable(candidate, worker);
    if (table) sideways.push({ pageImage: candidate, table });
  }

  if (upright) {
    const uprightRows = upright.rowLines.length;
    const denser = sideways.filter((c) => c.table.rowLines.length >= Math.max(uprightRows * 2, uprightRows + 3));
    if (denser.length === 0) return { pageImage, table: upright };
    if (denser.length === 1) return denser[0];
    for (const candidate of denser) {
      if (await looksUpright(worker, candidate.pageImage)) return candidate;
    }
    return null; // multiple plausible sideways orientations, none confirmed — don't guess
  }

  // 0° found nothing at all — the original, proven ambiguous-page path: a
  // page fed into the scanner sideways or upside down, where the
  // header-text tiebreak is the only way to pick among whichever rotations
  // do produce a grid.
  const candidates = [...sideways];
  const flippedImage = await sharp(pageImage).rotate(180).toBuffer();
  const flippedTable = await detectTable(flippedImage, worker);
  if (flippedTable) candidates.push({ pageImage: flippedImage, table: flippedTable });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  for (const candidate of candidates) {
    if (await looksUpright(worker, candidate.pageImage)) return candidate;
  }
  return null; // multiple plausible orientations, none confirmed — don't guess
}

async function ocrPage(
  worker: Worker,
  pageImageIn: Buffer,
  pageNum: number,
  issues: HouseOcrIssue[]
): Promise<{ transactions: ParsedTransaction[]; notAPtr: boolean }> {
  const found = await detectTableWithRotation(worker, pageImageIn);
  if (!found) {
    const notAPtr = await looksLikeNonPtrDocument(worker, pageImageIn);
    issues.push({
      page: pageNum,
      row: 0,
      field: "template",
      reason: notAPtr
        ? "This page is a Campaign Notice / disclosure-exemption document, not a Periodic Transaction Report — correctly has no transaction grid."
        : "No recognizable transaction grid found on this page in any orientation (or its orientation couldn't be confirmed) — page declined rather than misread.",
      context: "",
    });
    return { transactions: [], notAPtr };
  }
  const pageImage = found.pageImage;
  const { raw, width, height, rowLines, colLines, roles } = found.table;

  const cellX = (idx: number) => ({ x0: colLines[idx], x1: colLines[idx + 1] });

  const transactions: ParsedTransaction[] = [];

  // Row 0 in a consistent run starting right after the header is always the
  // pre-printed "Example" row on a filing's first transactions page; a
  // continuation page has no Example row, so this would incorrectly treat
  // its first real row as one to inspect for a denylist match, but the
  // denylist check below only *acts* on rows whose asset text genuinely
  // matches "Mega Corp" — a real filer's row is unaffected.
  for (let r = 0; r < rowLines.length - 1; r++) {
    const y0 = rowLines[r];
    const y1 = rowLines[r + 1];

    const assetX = cellX(roles.assetIdx);
    // A genuinely blank cell has just anti-aliasing/scan noise — OCR can
    // still hallucinate 2-3 garbage characters ("Lo", "oo") out of that
    // alone, which would otherwise pass VALIDATE_NONEMPTY. Gate on real ink
    // being present at all before even attempting to read it.
    const assetCellDarkness = darkFraction(raw, width, height, assetX.x0, y0, assetX.x1, y1, ASSET_INSET);
    if (assetCellDarkness < ASSET_MAYBE_THRESHOLD) continue; // blank row (unused template row) — nothing to record, not an error
    if (assetCellDarkness < ASSET_DARK_THRESHOLD) {
      issues.push({
        page: pageNum,
        row: r,
        field: "assetName",
        reason: "Row has faint content that couldn't be confirmed as real text (possibly handwriting spilling outside this cell) — skipped rather than guessed.",
        context: "",
      });
      continue;
    }

    const assetText = await ocrCell(worker, pageImage, { x0: assetX.x0, y0, x1: assetX.x1, y1 }, VALIDATE_NONEMPTY);
    if (!assetText) {
      issues.push({ page: pageNum, row: r, field: "assetName", reason: "Row has content (not blank) but the asset name couldn't be read confidently — skipped rather than recorded with an unknown asset.", context: "" });
      continue;
    }
    if (EXAMPLE_ASSET_DENYLIST.test(assetText)) continue;

    const dateX = cellX(roles.dateIdx);
    const dateResult = await ocrCellChecked(worker, pageImage, { x0: dateX.x0, y0, x1: dateX.x1, y1 }, VALIDATE_DATE);
    const transactionDate = dateResult.value ? toIsoDateSlash(dateResult.value) : null;
    if (!transactionDate) {
      issues.push({ page: pageNum, row: r, field: "transactionDate", reason: "Could not read a valid date from this row's Date of Transaction cell.", context: assetText });
    } else if (!dateResult.confident) {
      issues.push({ page: pageNum, row: r, field: "transactionDate", reason: `Repeated OCR attempts disagreed on this date — using "${dateResult.value}", but verify against the source.`, context: assetText });
    }

    const dateNotifiedX = cellX(roles.dateNotifiedIdx);
    const dateNotifiedResult = await ocrCellChecked(worker, pageImage, { x0: dateNotifiedX.x0, y0, x1: dateNotifiedX.x1, y1 }, VALIDATE_DATE);
    const notificationDate = dateNotifiedResult.value ? toIsoDateSlash(dateNotifiedResult.value) : null;
    if (!notificationDate) {
      issues.push({ page: pageNum, row: r, field: "notificationDate", reason: "Could not read a valid date from this row's Date Notified cell.", context: assetText });
    } else if (!dateNotifiedResult.confident) {
      issues.push({ page: pageNum, row: r, field: "notificationDate", reason: `Repeated OCR attempts disagreed on this date — using "${dateNotifiedResult.value}", but verify against the source.`, context: assetText });
    }

    const ownerX = cellX(roles.ownerIdx);
    const ownerCellDarkness = darkFraction(raw, width, height, ownerX.x0, y0, ownerX.x1, y1, OWNER_INSET);
    let owner: string | null = null;
    if (ownerCellDarkness > OWNER_DARK_THRESHOLD) {
      // Cell has real ink (not a blank "self" row) — try to read it, but
      // don't guess if OCR can't confirm one of SP/DC/JT.
      const ownerResult = await ocrCellChecked(worker, pageImage, { x0: ownerX.x0, y0, x1: ownerX.x1, y1 }, VALIDATE_OWNER);
      owner = ownerResult.value;
      if (!owner) {
        issues.push({ page: pageNum, row: r, field: "owner", reason: "Owner cell has content but couldn't be confidently read as SP/DC/JT.", context: assetText });
      } else if (!ownerResult.confident) {
        issues.push({ page: pageNum, row: r, field: "owner", reason: `Repeated OCR attempts disagreed on the owner code — using "${owner}", but verify against the source.`, context: assetText });
      }
    }

    const typeCells = roles.typeIdxs.map((idx) => ({ ...cellX(idx), y0, y1 }));
    const typePick = pickMarkedCell(typeCells, raw, width, height);
    const transactionType = typePick !== null ? roles.typeCodes[typePick.index] : "";
    if (!transactionType) {
      issues.push({ page: pageNum, row: r, field: "transactionType", reason: "No Transaction Type checkbox read as clearly marked.", context: assetText });
    } else if (!typePick!.agreed) {
      issues.push({ page: pageNum, row: r, field: "transactionType", reason: `Only one of two cross-checks confirmed "${transactionType}" as marked — verify against the source.`, context: assetText });
    }

    const amountCells = roles.amountIdxs.map((idx) => ({ ...cellX(idx), y0, y1 }));
    const amountPick = pickMarkedCell(amountCells, raw, width, height);
    const amountRange = amountPick !== null ? AMOUNT_RANGES[amountPick.index].range : "";
    const amountLow = amountPick !== null ? AMOUNT_RANGES[amountPick.index].low : null;
    const amountHigh = amountPick !== null ? AMOUNT_RANGES[amountPick.index].high : null;
    if (!amountRange) {
      issues.push({ page: pageNum, row: r, field: "amountRange", reason: "No Amount of Transaction checkbox read as clearly marked.", context: assetText });
    } else if (!amountPick!.agreed) {
      issues.push({ page: pageNum, row: r, field: "amountRange", reason: `Only one of two cross-checks confirmed "${amountRange}" as marked — verify against the source.`, context: assetText });
    }

    const ocrTicker = extractOcrTicker(assetText);
    transactions.push({
      assetName: assetText,
      ticker: ocrTicker,
      // A ticker only ever shows up in this OCR'd text for a company/fund
      // that's exchange-traded — see extractOcrTicker's comment. Nothing on
      // the physical form breaks the type out further, so this is the most
      // specific code that's actually knowable from it (matches the manual
      // convention used for every such row fixed by hand this session).
      assetTypeCode: ocrTicker ? "ST" : null,
      owner,
      // "(unreadable)" rather than defaulting to a real code (e.g.
      // "Purchase") when unresolved — a guess here would misrepresent an
      // actual trade's direction, which is worse than admitting uncertainty.
      transactionType: transactionType || "(unreadable)",
      transactionDate,
      notificationDate,
      amountRange: amountRange || "(unreadable)",
      amountLow,
      amountHigh,
    });
  }

  return { transactions, notAPtr: false };
}

/**
 * OCRs every page of a scanned House PTR PDF. Returns null only if no page
 * has a recognizable transactions grid at all (cover-letter-only PDF,
 * genuinely unreadable scan). Otherwise returns whatever could be
 * extracted plus a full list of anything that couldn't be confidently
 * resolved, for the caller to log/report rather than silently drop.
 */
export async function ocrHousePtr(pdfBuffer: Buffer): Promise<HouseOcrResult | null> {
  const worker = await createWorker("eng");
  try {
    const pages = await pdf(pdfBuffer, { scale: RENDER_SCALE });
    const issues: HouseOcrIssue[] = [];
    const allTransactions: ParsedTransaction[] = [];
    let sawTable = false;
    let pageNum = 0;

    let sawNonPtrPage = false;

    for await (const pageImage of pages) {
      pageNum++;
      const before = issues.length;
      const { transactions: pageTxns, notAPtr } = await ocrPage(worker, pageImage, pageNum, issues);
      if (notAPtr) {
        // Its own issue (an informational note, not a declined-read
        // warning) shouldn't count as "found something" the way a real
        // page's issues do — a confirmed non-PTR page has nothing to sawTable.
        sawNonPtrPage = true;
      } else if (pageTxns.length > 0 || issues.length > before) {
        sawTable = true;
      }
      allTransactions.push(...pageTxns);
    }

    // A confirmed non-PTR page (see looksLikeNonPtrDocument) only overrides
    // the "declined, nothing usable" null return — if a real transaction
    // grid was also found somewhere in this same PDF, that's the correct
    // result regardless of what any other page turned out to be.
    if (!sawTable) return sawNonPtrPage ? { transactions: [], issues: [], notAPtr: true } : null;
    return { transactions: allTransactions, issues, notAPtr: false };
  } finally {
    await worker.terminate();
  }
}
