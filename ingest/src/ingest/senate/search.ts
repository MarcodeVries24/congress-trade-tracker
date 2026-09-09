import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { SENATE_EFD } from "../../config.js";

export interface SenateSearchResult {
  reportId: string;
  reportUrl: string;
  filerName: string;
  lastName: string;
  officeText: string;
  dateReceived: string; // as displayed, e.g. "09/09/2026"
  isElectronic: boolean; // false => paper/image filing, not parseable as HTML
}

interface RawRow {
  cellTexts: string[];
  href: string | null;
}

/** Loads the eFD home page and accepts the click-through agreement. */
export async function acceptAgreementAndOpenSearch(page: Page): Promise<void> {
  const res = await page.goto(SENATE_EFD.homeUrl, { waitUntil: "domcontentloaded" });
  if (!res || !res.ok()) {
    throw new Error(`Failed to load eFD home page: ${res?.status()}`);
  }
  const checkbox = page.locator('input[type="checkbox"]').first();
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), checkbox.check()]);
}

function parseMMDDYYYY(s: string): Date {
  const [m, d, y] = s.split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatMMDDYYYY(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${day}/${d.getUTCFullYear()}`;
}

function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}

function midpoint(a: Date, b: Date): Date {
  const t = Math.floor((a.getTime() + b.getTime()) / 2);
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Fetches exactly one DataTables page for [startDate, endDate] — no "Next"
 * clicking. The eFD search results are server-paginated with no stable
 * secondary sort key, so consecutive AJAX page requests for the *same* broad
 * query can silently reorder rows across the page boundary (verified live:
 * paging through a 421-row search with generous settling waits between each
 * page still dropped ~15% of rows, even after ruling out every client-side
 * timing race). A single request can't have a boundary-reordering bug, so we
 * avoid pagination entirely: narrow the date range until everything fits in
 * one page instead. The results table also silently caps at 100 rows even if
 * a larger page length is requested (its own "Showing 1 to N" text lies
 * above 100), so 100 is the real ceiling for what one query can return.
 */
async function fetchSinglePage(page: Page, startDate: string, endDate: string): Promise<{ rows: RawRow[]; total: number }> {
  await page.goto(SENATE_EFD.searchUrl, { waitUntil: "domcontentloaded" });
  await page.check(`input[name="report_type"][value="${SENATE_EFD.periodicTransactionsReportType}"]`);
  await page.fill('input[name="submitted_start_date"]', startDate);
  await page.fill('input[name="submitted_end_date"]', endDate);
  await page.getByRole("button", { name: "Search Reports" }).click();
  await page
    .waitForSelector("#filedReports tbody tr", { timeout: 20000 })
    .catch(() => {
      /* legitimately zero results for this range */
    });

  const total = await page
    .locator("#filedReports_info")
    .textContent()
    .then((t) => Number(t?.match(/of ([\d,]+) entries/)?.[1]?.replace(/,/g, "") ?? "0"))
    .catch(() => 0);

  if (total === 0) return { rows: [], total: 0 };

  if (total > 25) {
    // Default page length is 25 — bump it so this one range fits on one page.
    await page.evaluate(() => {
      // DataTables/jQuery are loaded globally by the page itself.
      (window as unknown as { jQuery: any }).jQuery("#filedReports").DataTable().page.len(100).draw();
    });
    await page
      .waitForFunction(
        (expected) => document.querySelectorAll("#filedReports tbody tr").length >= Math.min(expected, 100),
        total,
        { timeout: 15000 }
      )
      .catch(() => {});
  }

  const rows = await page.$$eval("#filedReports tbody tr", (trs) =>
    trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td"));
      const link = tr.querySelector<HTMLAnchorElement>("a[href]");
      return {
        cellTexts: cells.map((c) => c.textContent?.trim() ?? ""),
        href: link?.getAttribute("href") ?? null,
      };
    })
  );

  return { rows, total };
}

/** Recursively bisects [start, end] until every leaf range's total fits in one page. */
async function searchRange(page: Page, start: Date, end: Date): Promise<RawRow[]> {
  const { rows, total } = await fetchSinglePage(page, formatMMDDYYYY(start), formatMMDDYYYY(end));

  if (total <= 100) {
    if (rows.length !== total) {
      console.warn(
        `  WARNING: ${formatMMDDYYYY(start)}–${formatMMDDYYYY(end)} reported ${total} filings but the page rendered ${rows.length}.`
      );
    }
    return rows;
  }

  if (start.getTime() >= end.getTime()) {
    // A single day reporting >100 filings isn't realistic for the Senate —
    // guard against infinite recursion rather than actually expect this.
    console.warn(`  WARNING: ${formatMMDDYYYY(start)} alone reports ${total} filings, more than one page can hold; some may be missed.`);
    return rows;
  }

  const mid = midpoint(start, end);
  const left = await searchRange(page, start, mid);
  const right = await searchRange(page, addDays(mid, 1), end);
  return [...left, ...right];
}

/**
 * Searches for Periodic Transaction Reports filed/received in [startDate, endDate]
 * (MM/DD/YYYY strings, endDate defaults to today).
 */
export async function searchPeriodicTransactionReports(
  page: Page,
  startDate: string,
  endDate?: string
): Promise<SenateSearchResult[]> {
  const start = parseMMDDYYYY(startDate);
  const end = endDate ? parseMMDDYYYY(endDate) : midpoint(new Date(), new Date()); // "today", normalized to UTC midnight

  const rawRows = await searchRange(page, start, end);

  const results: SenateSearchResult[] = [];
  const seenReportIds = new Set<string>();

  for (const row of rawRows) {
    if (row.cellTexts.length < 5) continue;
    const [first, lastRaw, office, , dateReceived] = row.cellTexts;
    // "Last Name (Suffix)" column is literally "{last}, {suffix}" — with
    // no suffix that's still "Moran," (trailing comma, nothing after),
    // and with one it's "McConnell, Jr." Split on the first comma so the
    // bare last name (used for the members_reference lookup key) never
    // includes the suffix, but keep the full "Last, Suffix" for display.
    const last = lastRaw.split(",")[0].trim();
    const suffix = lastRaw.includes(",") ? lastRaw.slice(lastRaw.indexOf(",") + 1).trim() : "";
    const filerName = [first, last].filter(Boolean).join(" ") + (suffix ? `, ${suffix}` : "");
    const isElectronic = !!row.href && row.href.includes("/search/view/ptr/");
    const reportId = isElectronic ? (row.href!.match(/\/ptr\/([a-f0-9-]+)\//)?.[1] ?? "") : "";
    if (isElectronic && !reportId) continue;
    const finalReportId = isElectronic
      ? reportId
      : // Paper/scanned filings don't have a UUID in their URL the way
        // electronic ones do — hash the full row identity instead. A plain
        // prefix of the encoded href collided across rows that only differ
        // near the end (e.g. multiple "/search/view/paper/{uuid}/" hrefs
        // sharing the same "/search/view/paper/" prefix); a hash spreads
        // that difference across the whole digest instead.
        `paper-${createHash("sha1").update(row.href ?? `${office}|${dateReceived}|${first}|${last}`).digest("hex").slice(0, 20)}`;
    // Defensive: date-range chunks are built not to overlap, but de-dupe
    // anyway rather than risk double-counting a filing.
    if (seenReportIds.has(finalReportId)) continue;
    seenReportIds.add(finalReportId);
    results.push({
      reportId: finalReportId,
      reportUrl: row.href ?? "",
      filerName,
      lastName: last,
      officeText: office,
      dateReceived,
      isElectronic,
    });
  }

  return results;
}
