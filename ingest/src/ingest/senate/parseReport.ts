import type { Page } from "playwright";

export interface SenateTransaction {
  transactionDate: string | null; // ISO
  owner: string | null; // "SP" | "JT" | "DC" | null (self)
  ticker: string | null;
  assetName: string;
  assetTypeCode: string | null; // Senate's own text (e.g. "Stock", "Non-Public Stock") — not a short code like House's
  transactionType: string; // "P" | "S" | "S (partial)" | "E" | raw fallback
  amountRange: string;
  amountLow: number | null;
  amountHigh: number | null;
}

const OWNER_MAP: Record<string, string | null> = {
  self: null,
  spouse: "SP",
  joint: "JT",
  "dependent child": "DC",
  child: "DC",
};

const TYPE_MAP: Record<string, string> = {
  purchase: "P",
  "sale (full)": "S",
  "sale (partial)": "S (partial)",
  exchange: "E",
};

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
 * Parses an already-loaded electronically-filed PTR report page
 * (efdsearch.senate.gov/search/view/ptr/{id}/) into transaction rows.
 * Returns null if the page doesn't have the expected transactions table
 * (e.g. a paper/scanned filing rendered as an embedded image instead).
 */
export async function parseSenateReportPage(page: Page): Promise<SenateTransaction[] | null> {
  const hasTable = await page.locator("table thead th", { hasText: "Transaction Date" }).count();
  if (hasTable === 0) return null;

  const rawRows = await page.$$eval("table tbody tr", (trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim()))
  );

  const transactions: SenateTransaction[] = [];
  for (const cells of rawRows) {
    // #, Transaction Date, Owner, Ticker, Asset Name, Asset Type, Type, Amount, Comment
    if (cells.length < 8) continue;
    const [, dateCell, ownerCell, tickerCell, assetNameCell, assetTypeCell, typeCell, amountCell] = cells;

    const ownerKey = ownerCell.trim().toLowerCase();
    const owner = ownerKey in OWNER_MAP ? OWNER_MAP[ownerKey] : ownerCell || null;

    const typeKey = typeCell.trim().toLowerCase();
    const transactionType = TYPE_MAP[typeKey] ?? typeCell;

    const ticker = tickerCell && tickerCell !== "--" ? tickerCell : null;
    const { low, high } = parseAmountRange(amountCell);

    transactions.push({
      transactionDate: toIsoDateSlash(dateCell),
      owner,
      ticker,
      assetName: assetNameCell || "(unknown asset)",
      assetTypeCode: assetTypeCell || null,
      transactionType,
      amountRange: amountCell,
      amountLow: low,
      amountHigh: high,
    });
  }

  return transactions;
}
