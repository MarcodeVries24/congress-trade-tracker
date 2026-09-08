import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { HOUSE_CLERK, PATHS } from "../config.js";

export interface FilingIndexRow {
  docId: string;
  memberName: string;
  stateDistrict: string;
  filingType: string;
  filingDate: string;
  year: number;
}

async function downloadZip(year: number): Promise<Buffer> {
  const url = HOUSE_CLERK.indexZipUrl(year);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download index for ${year}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function toIsoDate(mmddyyyy: string): string | null {
  const m = mmddyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export async function fetchYearIndex(
  year: number,
  { useCache = true }: { useCache?: boolean } = {}
): Promise<FilingIndexRow[]> {
  fs.mkdirSync(PATHS.rawDir, { recursive: true });
  const zipPath = path.join(PATHS.rawDir, `${year}FD.zip`);

  let zipBuffer: Buffer;
  if (useCache && fs.existsSync(zipPath)) {
    zipBuffer = fs.readFileSync(zipPath);
  } else {
    zipBuffer = await downloadZip(year);
    fs.writeFileSync(zipPath, zipBuffer);
  }

  const zip = new AdmZip(zipBuffer);
  const txtEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".txt"));
  if (!txtEntry) throw new Error(`No .txt index found in ${year}FD.zip`);

  const text = zip.readAsText(txtEntry);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [header, ...rows] = lines;
  const cols = header.split("\t");
  const idx = (name: string) => cols.findIndex((c) => c.trim() === name);

  const iLast = idx("Last");
  const iFirst = idx("First");
  const iSuffix = idx("Suffix");
  const iPrefix = idx("Prefix");
  const iType = idx("FilingType");
  const iState = idx("StateDst");
  const iYear = idx("Year");
  const iDate = idx("FilingDate");
  const iDocId = idx("DocID");

  const out: FilingIndexRow[] = [];
  for (const line of rows) {
    const cells = line.split("\t");
    const docId = cells[iDocId]?.trim();
    if (!docId) continue;
    const first = cells[iFirst]?.trim() ?? "";
    const last = cells[iLast]?.trim() ?? "";
    const suffix = cells[iSuffix]?.trim() ?? "";
    const prefix = cells[iPrefix]?.trim() ?? "";
    const memberName = [prefix, first, last, suffix].filter(Boolean).join(" ");
    out.push({
      docId,
      memberName,
      stateDistrict: cells[iState]?.trim() ?? "",
      filingType: cells[iType]?.trim() ?? "",
      filingDate: toIsoDate(cells[iDate] ?? "") ?? "",
      year: Number(cells[iYear]?.trim() ?? year),
    });
  }
  return out;
}
