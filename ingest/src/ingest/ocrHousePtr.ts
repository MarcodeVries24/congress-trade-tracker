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

/**
 * Locates the transaction grid in an already-upright page image: row lines
 * (the longest evenly-spaced run, wherever the table body sits under a
 * possible filer-info header) and column lines (scanned from a thin band at
 * a row boundary — see findGridLines). Returns null if no recognizable grid
 * is present (cover/certification page, or a column count that matches
 * neither known template).
 */
async function detectTable(pageImage: Buffer): Promise<TableStructure | null> {
  const { data: raw, width, height } = await greyscaleRaw(pageImage);
  const allRowLines = findGridLines(raw, width, height, "row", Math.round(0.43 * width), Math.round(0.55 * width));
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

const HEADER_TEXT_PATTERN = /UNITED\s+STATES|HOUSE\s+OF\s+REPRESENTATIVES/i;

/**
 * Checks whether a page image is right-side up by OCRing its top strip for
 * the form's own printed header ("UNITED STATES HOUSE OF REPRESENTATIVES").
 * Needed because the *grid* geometry alone can't tell a correct rotation
 * from its 180°-opposite: a rectangular grid of evenly-spaced lines looks
 * identical read forwards or backwards, so a landscape page rotated 90° and
 * the same page rotated 270° both pass grid detection with the *same*
 * column count (verified against a real filing) — only the actual header
 * text, which sits above the table, disambiguates which one is upright.
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
 * Most scans render upright, and the grid check on an as-is page is trusted
 * on its own when it succeeds — exactly the original, unambiguous behavior,
 * with no header OCR involved. That matters because the grid check alone
 * can't be trusted to *disambiguate* rotations: a checkbox-dense table can
 * pass column-count detection at more than one rotation by sheer geometric
 * coincidence (verified on real filings — some pages passed at 0°, 90°,
 * *and* 270° simultaneously), and the header-text tiebreaker below is
 * itself unreliable on a poor scan. Running that tiebreaker on an
 * already-upright page risked *rejecting* a page that was fine all along,
 * so it's reserved for the real failure case: a page fed into the scanner
 * sideways, where rotation 0 finds no table at all (confirmed against a
 * real filing that read entirely at 90° off). Only then are 90/180/270
 * tried, with the header-text check picking whichever is actually
 * right-side up — and if more than one of *those* claims to be upright,
 * that's a genuine ambiguity, declined rather than guessed.
 */
async function detectTableWithRotation(worker: Worker, pageImage: Buffer): Promise<{ pageImage: Buffer; table: TableStructure } | null> {
  const upright = await detectTable(pageImage);
  if (upright) return { pageImage, table: upright };

  const candidates: { pageImage: Buffer; table: TableStructure }[] = [];
  for (const rotation of [90, 180, 270] as const) {
    const candidate = await sharp(pageImage).rotate(rotation).toBuffer();
    const table = await detectTable(candidate);
    if (table) candidates.push({ pageImage: candidate, table });
  }
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
): Promise<ParsedTransaction[]> {
  const found = await detectTableWithRotation(worker, pageImageIn);
  if (!found) {
    issues.push({
      page: pageNum,
      row: 0,
      field: "template",
      reason:
        "No recognizable transaction grid found on this page in any orientation (or its orientation couldn't be confirmed) — page declined rather than misread.",
      context: "",
    });
    return [];
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

    transactions.push({
      assetName: assetText,
      ticker: null,
      assetTypeCode: null,
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

  return transactions;
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

    for await (const pageImage of pages) {
      pageNum++;
      const before = issues.length;
      const pageTxns = await ocrPage(worker, pageImage, pageNum, issues);
      if (pageTxns.length > 0 || issues.length > before) sawTable = true;
      allTransactions.push(...pageTxns);
    }

    if (!sawTable) return null;
    return { transactions: allTransactions, issues };
  } finally {
    await worker.terminate();
  }
}
