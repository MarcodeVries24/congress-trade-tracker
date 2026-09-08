import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { HOUSE_CLERK, PATHS } from "../config.js";

export async function getPtrPdfText(
  year: number,
  docId: string,
  { useCache = true }: { useCache?: boolean } = {}
): Promise<string> {
  const dir = path.join(PATHS.pdfDir, String(year));
  fs.mkdirSync(dir, { recursive: true });
  const pdfPath = path.join(dir, `${docId}.pdf`);

  let buffer: Buffer;
  if (useCache && fs.existsSync(pdfPath)) {
    buffer = fs.readFileSync(pdfPath);
  } else {
    const url = HOUSE_CLERK.ptrPdfUrl(year, docId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download PDF ${url}: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(pdfPath, buffer);
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy?.();
  }
}
