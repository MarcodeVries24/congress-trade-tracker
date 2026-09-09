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

/** Loads the eFD home page and accepts the click-through agreement. */
export async function acceptAgreementAndOpenSearch(page: Page): Promise<void> {
  const res = await page.goto(SENATE_EFD.homeUrl, { waitUntil: "domcontentloaded" });
  if (!res || !res.ok()) {
    throw new Error(`Failed to load eFD home page: ${res?.status()}`);
  }
  const checkbox = page.locator('input[type="checkbox"]').first();
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), checkbox.check()]);
}

/**
 * Searches for Periodic Transaction Reports filed/received in [startDate, endDate]
 * (MM/DD/YYYY strings). Results load via an in-page AJAX call (DataTables), not a
 * real navigation, so we wait for table rows rather than a navigation event.
 */
export async function searchPeriodicTransactionReports(
  page: Page,
  startDate: string,
  endDate?: string
): Promise<SenateSearchResult[]> {
  await page.check(`input[name="report_type"][value="${SENATE_EFD.periodicTransactionsReportType}"]`);
  await page.fill('input[name="submitted_start_date"]', startDate);
  if (endDate) await page.fill('input[name="submitted_end_date"]', endDate);

  await page.getByRole("button", { name: "Search Reports" }).click();
  await page
    .waitForSelector("table tbody tr", { timeout: 20000 })
    .catch(() => {
      /* legitimately zero results for this range */
    });

  const results: SenateSearchResult[] = [];
  let hasNextPage = true;
  let pageCount = 0;
  const MAX_PAGES = 400; // safety cap (400 * 25 rows = 10,000), not an expected real count

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount++;
    const rows = await page.$$eval("table tbody tr", (trs) =>
      trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        const link = tr.querySelector<HTMLAnchorElement>("a[href]");
        return {
          cellTexts: cells.map((c) => c.textContent?.trim() ?? ""),
          href: link?.getAttribute("href") ?? null,
        };
      })
    );

    for (const row of rows) {
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
      results.push({
        // Paper/scanned filings don't have a UUID in their URL the way
        // electronic ones do — hash the full row identity instead. A plain
        // prefix of the encoded href collided across rows that only differ
        // near the end (e.g. multiple "/search/view/paper/{uuid}/" hrefs
        // sharing the same "/search/view/paper/" prefix); a hash spreads
        // that difference across the whole digest instead.
        reportId: isElectronic
          ? reportId
          : `paper-${createHash("sha1").update(row.href ?? `${office}|${dateReceived}|${first}|${last}`).digest("hex").slice(0, 20)}`,
        reportUrl: row.href ?? "",
        filerName,
        lastName: last,
        officeText: office,
        dateReceived,
        isElectronic,
      });
    }

    // DataTables renders "Next" as an <a> with no href (so it has no
    // accessible "link" role at all — getByRole silently never matches it).
    // Target it directly by id/class instead.
    const nextLink = page.locator("#filedReports_next");
    const nextClassAttr = (await nextLink.getAttribute("class").catch(() => null)) ?? "disabled";
    if (nextClassAttr.includes("disabled")) {
      hasNextPage = false;
    } else {
      const firstRowBefore = await page.locator("table tbody tr").first().textContent();
      await nextLink.click();
      // Wait for the first row's text to actually change rather than a fixed
      // delay — this is a server-driven AJAX page swap, not instant.
      await page
        .waitForFunction(
          (prevText) => document.querySelector("table tbody tr")?.textContent !== prevText,
          firstRowBefore,
          { timeout: 15000 }
        )
        .catch(() => {});
    }
  }

  return results;
}
