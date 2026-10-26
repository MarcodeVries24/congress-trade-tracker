import type { Page } from "playwright";

/**
 * Who filed a Senate report and when, from the report page itself, for
 * reports uploaded by hand (importSenateUploads.ts). The automated search
 * read these from its results table; a saved report page carries them in
 * its heading instead:
 *
 *   The Honorable Shelley M Capito (Capito, Shelley M)
 *   Filed 10/15/2026 @ 3:31 PM
 *
 * The bracketed "Last, First" is how eFD names the filer, and the same
 * name the search's columns gave. A suffix, when there is one, sits between
 * the two ("McConnell, Jr., A. Mitchell"), and goes last in the display
 * name, as the search did it ("A. Mitchell McConnell, Jr.").
 */
export interface SenateReportHeader {
  filerName: string;
  lastName: string;
  /** ISO date the Senate received it. */
  filingDate: string;
}

export function senateHeaderFromText(heading: string, pageText: string): SenateReportHeader | null {
  const paren = heading.match(/\(([^()]+,[^()]+)\)/)?.[1];
  const filed = pageText.match(/Filed (\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!paren || !filed) return null;
  const parts = paren
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[0];
  const first = parts[parts.length - 1];
  const suffix = parts.length > 2 ? parts.slice(1, -1).join(", ") : "";
  const [, mm, dd, yyyy] = filed;
  return {
    filerName: `${first} ${last}${suffix ? `, ${suffix}` : ""}`,
    lastName: last,
    filingDate: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
  };
}

export async function readSenateReportHeader(page: Page): Promise<SenateReportHeader | null> {
  const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const heading = (await page.locator("h2.filedReport").first().textContent().catch(() => null)) ?? text;
  return senateHeaderFromText(heading, text);
}
