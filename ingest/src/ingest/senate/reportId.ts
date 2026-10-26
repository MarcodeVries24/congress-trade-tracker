import { createHash } from "node:crypto";
import type { SenateReportPath } from "@congtrade/shared/senateReport";

/**
 * The id a Senate report is stored under in filings.doc_id.
 *
 * An electronic report keeps the UUID from its address. A paper (scanned)
 * one has no usable id of its own, so it is "paper-" plus a hash of the
 * link the eFD search gives it, the same derivation search.ts has always
 * used, so a report uploaded by hand lands on the row the search made.
 */
export function senateDocId(report: SenateReportPath): string {
  if (report.kind === "ptr") return report.id;
  return `paper-${createHash("sha1").update(report.path).digest("hex").slice(0, 20)}`;
}
