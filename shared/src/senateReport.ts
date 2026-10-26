/**
 * Senate eFD report addresses.
 *
 * Shared because Senate filings now arrive two ways that must agree on which
 * report is which: the old automated search (ingest/src/ingest/senate/
 * search.ts), and report pages the admin saves from eFD by hand and uploads
 * in /admin/senate. The id each is stored under is derived from the path
 * here, in ingest/src/ingest/senate/reportId.ts, which needs Node's crypto
 * and so is not in this browser-safe module.
 */

export const SENATE_EFD_ORIGIN = "https://efdsearch.senate.gov";

export interface SenateReportPath {
  /** "ptr" for an electronic report, "paper" for a scanned one. */
  kind: "ptr" | "paper";
  /** The id in the address: a UUID for electronic reports. */
  id: string;
  /** "/search/view/{kind}/{id}/", the form the search's links take. */
  path: string;
  /** The report's full address on eFD. */
  url: string;
}

const REPORT_PATH = /\/search\/view\/(ptr|paper)\/([A-Za-z0-9-]+)\/?/;

/** Reads a report address (full or path only); null when it is not one. */
export function senateReportPath(address: string): SenateReportPath | null {
  const m = address.trim().match(REPORT_PATH);
  if (!m) return null;
  const kind = m[1] as "ptr" | "paper";
  const path = `/search/view/${kind}/${m[2]}/`;
  return { kind, id: m[2], path, url: `${SENATE_EFD_ORIGIN}${path}` };
}

/**
 * Finds the address a saved report page came from, or null. Browsers write
 * it into the file in different ways, if at all: Chrome's "saved from url"
 * comment, a canonical link, or the page's own links back to itself.
 */
export function findSenateReportAddress(html: string): string | null {
  const saved = html.match(/saved from url=\(\d+\)(\S+?)\s*-->/i)?.[1];
  if (saved && REPORT_PATH.test(saved)) return saved;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
  if (canonical && REPORT_PATH.test(canonical)) return canonical;
  return html.match(REPORT_PATH)?.[0] ?? null;
}
