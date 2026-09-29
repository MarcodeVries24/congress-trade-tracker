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
/**
 * The eFD Ticker column holds one symbol per row — except on an exchange,
 * where it holds two: the security given up and the one received, e.g.
 * "T WBD" for AT&T exchanged into Warner Bros. Discovery, or "-- WBD" when
 * the old symbol isn't known. Those went into the database verbatim, so 23
 * rows carried a ticker that matches no security and could never be filtered,
 * charted or priced.
 *
 * The received symbol is the one to keep: it is what the member holds
 * afterwards, it is always present (the other side is sometimes just "--"),
 * and it is the security the asset name describes as "(Received)".
 *
 * "--" alone still means no ticker, as before.
 */
export function normalizeTickerCell(cell: string | undefined): string | null {
  const parts = (cell ?? "").trim().split(/\s+/).filter((p) => p && p !== "--");
  return parts.length ? parts[parts.length - 1] : null;
}

/**
 * The Asset Name cell of an eFD report holds the name the filer typed and,
 * for a non-public holding, a detail block rendered inside the same cell:
 *
 *   MH Built to Last LLC Company: MH Built to Last LLC (New York, NY) Description: Partnership
 *
 * textContent flattens the two into one string, so the company blurb ended up
 * inside the asset name on 107 rows across 23 senators. The name is what the
 * site puts in a table row, and "Business Entity Company: Arp & Hammond
 * Hardware Company (Cheyenne, Wyoming) Description: Real Estate" is not a name
 * anyone can read there, so the block is dropped.
 *
 * Split on the labels rather than on the detail's shape: they are literal,
 * they are what the page renders, and no security is named "... Company: ...".
 * If a cell somehow leads with the block, the original text is kept rather
 * than returning nothing.
 */
/**
 * Names that describe what was traded without saying whose it was. A filer is
 * free to put one of these in the Asset Name field, and five rows did, which
 * leaves the entity's identity only in the Company part of the detail block.
 *
 * Deliberately a closed list of shapes rather than a length or word-count
 * heuristic: "More" is a whole company name and "Business Entity" is not, and
 * nothing about the strings themselves separates those two. Anything that does
 * not match keeps the filer's own wording, so the cost of this list being
 * incomplete is the old behaviour, not a wrong name.
 */
const PLACEHOLDER_ASSET_NAME =
  /^(?:business entity|(?:shares? of )?stock|common stock|(?:series [\w-]+ )?preferred stock|(?:membership|partnership|llc) interests?)$/i;

/** The last parenthesised group, which in the Company part is its location. */
function dropTrailingParenthetical(text: string): string {
  if (!text.endsWith(")")) return text;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ")") depth++;
    else if (text[i] === "(") {
      depth--;
      if (depth === 0) return text.slice(0, i).trimEnd() || text;
    }
  }
  return text;
}

/** The company named in the detail block, without its city and state. */
function companyFromDetail(text: string): string | null {
  const match = text.match(/\sCompany:\s(.+)$/);
  if (!match) return null;
  const company = dropTrailingParenthetical(match[1].split(/\sDescription:\s/)[0].trim());
  return company || null;
}

export function stripAssetDetail(cell: string | undefined): string {
  const text = (cell ?? "").trim();
  const name = text.split(/\s(?:Company|Description):\s/)[0].trim();
  if (!name) return text;
  // "Business Entity" names nothing. Where the filer left a placeholder, the
  // company in the detail block is the only identity the row has, so it
  // becomes the name rather than being dropped with the rest of the block.
  if (PLACEHOLDER_ASSET_NAME.test(name)) return companyFromDetail(text) ?? name;
  return name;
}

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

    const ticker = normalizeTickerCell(tickerCell);
    const { low, high } = parseAmountRange(amountCell);

    transactions.push({
      transactionDate: toIsoDateSlash(dateCell),
      owner,
      ticker,
      assetName: stripAssetDetail(assetNameCell) || "(unknown asset)",
      assetTypeCode: assetTypeCell || null,
      transactionType,
      amountRange: amountCell,
      amountLow: low,
      amountHigh: high,
    });
  }

  return transactions;
}
