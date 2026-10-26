import { NextResponse, type NextRequest } from "next/server";
import { senateReportPath } from "@congtrade/shared/senateReport";
import { adminUserId } from "@/lib/admin";
import { sql } from "@/lib/db";

/**
 * A Senate report page the admin saved from eFD, for the ingest to read
 * (importSenateUploads.ts, every run). { fileName, reportUrl, html }, one
 * page per request. Only stored here: nothing is parsed or published until
 * the ingest has read it and the admin has approved the filing.
 *
 * Anyone but the admin gets a 404, as if the route did not exist.
 */
const MAX_HTML = 3_000_000;

export async function POST(req: NextRequest) {
  const admin = await adminUserId();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // JSON only, so another site cannot submit this with the admin's cookie.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }

  const body = (await req.json().catch(() => null)) as { fileName?: unknown; reportUrl?: unknown; html?: unknown } | null;
  const html = typeof body?.html === "string" ? body.html : "";
  if (!html || html.length > MAX_HTML) {
    return NextResponse.json({ error: "Send the saved page's HTML (under 3 MB)." }, { status: 400 });
  }
  const report = typeof body?.reportUrl === "string" ? senateReportPath(body.reportUrl) : null;
  if (!report) {
    return NextResponse.json(
      { error: "That is not an eFD report address (…/search/view/ptr/… or …/search/view/paper/…)." },
      { status: 400 }
    );
  }
  const fileName = typeof body?.fileName === "string" ? body.fileName.slice(0, 200) : null;

  // The same report waiting twice would only be read twice.
  const waiting = (await sql.query(
    `SELECT id::text FROM senate_uploads WHERE report_url = $1 AND status = 'pending' LIMIT 1`,
    [report.url]
  )) as { id: string }[];
  if (waiting.length) return NextResponse.json({ ok: true, id: waiting[0].id, duplicate: true });

  const rows = (await sql.query(
    `INSERT INTO senate_uploads (uploaded_by, file_name, report_url, html) VALUES ($1, $2, $3, $4) RETURNING id::text`,
    [admin, fileName, report.url, html]
  )) as { id: string }[];
  return NextResponse.json({ ok: true, id: rows[0].id, duplicate: false });
}
