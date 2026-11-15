import { senateTransactionFromCells, type SenateTransaction } from "./parseReport.js";
import { senateHeaderFromText, type SenateReportHeader } from "./reportHeader.js";

/**
 * Reading an eFD report the admin printed to PDF (Print > Save as PDF) and
 * uploaded in /admin/senate, as importSenateUploads.ts does for a saved
 * HTML page. Chrome prints the report as:
 *
 *   15/11/2026, 09:11 eFD: Print Periodic Transaction Report      (page top)
 *   Periodic Transaction Report for 10/26/2026
 *   The Honorable Richard Blumenthal (Blumenthal, Richard)
 *    Filed 10/26/2026 @ 10:42 AM
 *    Transactions (32 transactions total) ...
 *   #  Transaction Date  Owner  Ticker  Asset Name  Asset Type  Type  Amount  Comment
 *   32 10/07/2026 Spouse -- MH Built to Last LLC  Other  Purchase  $15,001 -  ...
 *                                                                  $50,000
 *   https://efdsearch.senate.gov/search/view/ptr/{id}/  1/6        (page foot)
 *
 * The PDF keeps text, not table cells, so each piece of text is put in a
 * column by where it sits: the column edges come from the header row, which
 * is repeated on every page. A row starts at a line with a number in the #
 * column; the lines below it, until the next number, wrap its cells. The
 * cells then go through the same row parser as the HTML page.
 *
 * The address comes from the footer, which Chrome prints unless "Headers and
 * footers" is switched off in the print dialog.
 */

/** A piece of text on a page: its left edge, baseline and width in points. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

export interface SenatePdfReport {
  /** The report's eFD address from the footer, or null when not printed. */
  address: string | null;
  header: SenateReportHeader | null;
  transactions: SenateTransaction[];
  /** "Transactions (N transactions total)": what the report says it holds. */
  declared: number | null;
  /** False when no page had the transactions table's header row. */
  hasTable: boolean;
}

const ADDRESS = /https:\/\/efdsearch\.senate\.gov\/search\/view\/(?:ptr|paper)\/[\w-]+\/?/;

interface Line {
  y: number;
  items: PdfTextItem[];
  text: string;
}

/** Text on the same baseline (to the point) forms a line; lines run top to bottom. */
function linesOf(items: PdfTextItem[]): Line[] {
  const byY = new Map<number, PdfTextItem[]>();
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.y);
    const line = byY.get(y);
    if (line) line.push(it);
    else byY.set(y, [it]);
  }
  return [...byY.entries()]
    .sort(([a], [b]) => b - a)
    .map(([y, its]) => {
      const sorted = its.sort((a, b) => a.x - b.x);
      return { y, items: sorted, text: sorted.map((i) => i.str).join("") };
    });
}

/**
 * Where each column starts, from the header row. Cells are left-aligned
 * under their labels, so a column starts just before its label; "Transaction
 * Date" is printed over two lines and its "Date" sits a little in from the
 * cell's edge. The # column starts at the left margin.
 */
function columnStarts(head: Line): number[] | null {
  let text = "";
  const xs: number[] = [];
  for (const it of head.items) {
    for (let i = 0; i < it.str.length; i++) {
      text += it.str[i];
      xs.push(it.x + (it.width * i) / it.str.length);
    }
  }
  const at = (label: string, from = 0) => text.indexOf(label, from);
  const owner = at("Owner");
  const ticker = at("Ticker");
  const asset = at("Asset Name");
  const assetType = at("Type", asset);
  const type = at("Type", assetType + 4);
  const amount = at("Amount");
  const comment = at("Comment");
  const date = at("Date");
  if ([owner, ticker, asset, assetType, type, amount, comment, date].some((i) => i < 0)) return null;
  return [
    -Infinity,
    xs[date] - 14,
    xs[owner] - 4,
    xs[ticker] - 4,
    xs[asset] - 4,
    xs[assetType] - 4,
    xs[type] - 4,
    xs[amount] - 4,
    xs[comment] - 4,
  ];
}

const isHeaderRow = (l: Line) => /Owner/.test(l.text) && /Amount/.test(l.text) && /Ticker/.test(l.text);

/** Reads a printed report from its pages' text. Pure, so it can be tested without a PDF. */
export function senateReportFromPages(pages: PdfTextItem[][]): SenatePdfReport {
  let all = "";
  let address: string | null = null;
  let hasTable = false;
  // Cells of each row, one list of text pieces per column.
  const rows: string[][][] = [];

  for (const items of pages) {
    const lines = linesOf(items);
    for (const l of lines) {
      all += `${l.text}\n`;
      address ??= l.text.match(ADDRESS)?.[0] ?? null;
    }
    const headAt = lines.findIndex(isHeaderRow);
    if (headAt < 0) continue;
    const starts = columnStarts(lines[headAt]);
    if (!starts) continue;
    hasTable = true;
    const columnOf = (x: number) => {
      let c = 0;
      for (let i = 0; i < starts.length; i++) if (x >= starts[i]) c = i;
      return c;
    };

    for (const l of lines.slice(headAt + 1)) {
      // The footer: the address and the page count.
      if (ADDRESS.test(l.text)) continue;
      const cells: string[] = Array(starts.length).fill("");
      for (const it of l.items) cells[columnOf(it.x)] += it.str;
      if (/^\s*\d+\s*$/.test(cells[0])) rows.push(starts.map(() => []));
      const row = rows[rows.length - 1];
      if (!row) continue;
      cells.forEach((c, i) => {
        if (c.trim()) row[i].push(c.trim());
      });
    }
  }

  const flat = all.replace(/\s+/g, " ");
  const heading = flat.match(/Periodic Transaction Report for [\d/]+ (.+?\([^()]+,[^()]+\))/)?.[1] ?? flat;
  const declared = flat.match(/Transactions \((\d+) transactions? total\)/)?.[1];

  const transactions = rows
    .map((row) =>
      row.map((pieces, i) => {
        const cell = pieces.join(" ").replace(/\s+/g, " ").trim();
        // "$1,001 -" over "$15,000" joins as "$1,001 - $15,000", the page's form.
        return i === 7 ? cell.replace(/\s*-\s*\$/, " - $") : cell;
      })
    )
    .map(senateTransactionFromCells)
    .filter((t): t is SenateTransaction => t !== null);

  return {
    address,
    header: senateHeaderFromText(heading, flat),
    transactions,
    declared: declared ? Number(declared) : null,
    hasTable,
  };
}

/** Reads a printed report from the PDF file's bytes. */
export async function readSenatePdfReport(data: Uint8Array): Promise<SenatePdfReport> {
  // The legacy build runs in Node without a worker set up.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise;
  try {
    const pages: PdfTextItem[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(
        content.items.flatMap((it) =>
          "str" in it ? [{ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }] : []
        )
      );
    }
    return senateReportFromPages(pages);
  } finally {
    await doc.destroy();
  }
}
