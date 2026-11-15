import { NextResponse, type NextRequest } from "next/server";
import { senateReportPath } from "@congtrade/shared/senateReport";
import { adminUserId } from "@/lib/admin";
import { sql } from "@/lib/db";

/**
 * A Senate report the admin saved from eFD, for the ingest to read
 * (importSenateUploads.ts, every run), one per request:
 *
 *   { fileName, reportUrl, html }   the report page saved as HTML
 *   { fileName, reportUrl?, pdf }   the report printed to PDF, base64; its
 *                                   address may be left out, the ingest
 *                                   then reads it from the printed footer
 *
 * Only stored here: nothing is parsed or published until the ingest has read
 * it and the admin has approved the filing.
 *
 * Anyone but the admin gets a 404, as if the route did not exist.
 */
const MAX_HTML = 3_000_000;
// Base64, so about 2.2 MB of PDF: a printed report is a few hundred KB.
const MAX_PDF = 3_000_000;

export async function POST(req: NextRequest) {
  const admin = await adminUserId();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // JSON only, so another site cannot submit this with the admin's cookie.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }

  const body = (await req.json().catch(() => null)) as {
    fileName?: unknown;
    reportUrl?: unknown;
    html?: unknown;
    pdf?: unknown;
  } | null;
  const html = typeof body?.html === "string" && body.html ? body.html : null;
  const pdf = typeof body?.pdf === "string" && body.pdf ? body.pdf : null;
  const oneFile = (html === null) !== (pdf === null);
  if (!oneFile || (html && html.length > MAX_HTML)) {
    return NextResponse.json({ error: "Send the saved page's HTML (under 3 MB) or the printed PDF." }, { status: 400 });
  }
  // "%PDF" in base64.
  if (pdf && (pdf.length > MAX_PDF || !pdf.startsWith("JVBER") || !/^[A-Za-z0-9+/]+=*$/.test(pdf))) {
    return NextResponse.json({ error: "That is not a PDF (or it is over 2 MB)." }, { status: 400 });
  }
  const typed = typeof body?.reportUrl === "string" ? body.reportUrl.trim() : "";
  const report = typed ? senateReportPath(typed) : null;
  // A page has to come with its address; a PDF may leave it to its footer.
  if (typed ? !report : !pdf) {
    return NextResponse.json(
      { error: "That is not an eFD report address (…/search/view/ptr/… or …/search/view/paper/…)." },
      { status: 400 }
    );
  }
  const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 200) : null;

  // The same report waiting twice would only be read twice.
  const waiting = (await sql.query(
    report
      ? `SELECT id::text FROM senate_uploads WHERE report_url = $1 AND status = 'pending' LIMIT 1`
      : `SELECT id::text FROM senate_uploads WHERE pdf = $1 AND status = 'pending' LIMIT 1`,
    [report ? report.url : pdf]
  )) as { id: string }[];
  if (waiting.length) return NextResponse.json({ ok: true, id: waiting[0].id, duplicate: true });

  // A page is stored without naming the pdf column, so pages still go up
  // on a database the ingest has not yet given that column (ensureSchema).
  const rows = (await sql.query(
    pdf
      ? `INSERT INTO senate_uploads (uploaded_by, file_name, report_url, pdf) VALUES ($1, $2, $3, $4) RETURNING id::text`
      : `INSERT INTO senate_uploads (uploaded_by, file_name, report_url, html) VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [admin, fileName, report?.url ?? null, pdf ?? html]
  )) as { id: string }[];
  return NextResponse.json({ ok: true, id: rows[0].id, duplicate: false });
}
