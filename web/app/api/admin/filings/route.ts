import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { adminUserId } from "@/lib/admin";

/**
 * The admin's decision on filings waiting in /admin.
 *
 *   { "docIds": [...], "action": "approve" }  publishes them: approved_at is
 *       what PUBLISHED_FILING_SQL waits for, so they appear on every page,
 *       count and alert on the next read.
 *   { "docIds": [...], "action": "review" }   sends them to manual review:
 *       parse_status 'flagged', which puts them in the same queue as scanned
 *       filings (review:queue, the daily report), their parsed rows kept as a
 *       draft to check against. review:approve publishes them from there.
 *
 * Only filings still waiting are touched, so a double click or a stale page
 * cannot re-approve or un-approve anything. Anyone but the admin gets a 404,
 * as if the route did not exist.
 */
export async function POST(req: NextRequest) {
  const admin = await adminUserId();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A cross-site form can post text/plain without a preflight, but not JSON:
  // requiring it keeps another site from submitting this with the admin's
  // cookie.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }

  const body = (await req.json().catch(() => null)) as { docIds?: unknown; action?: unknown } | null;
  const docIds = Array.isArray(body?.docIds) ? body.docIds.filter((d): d is string => typeof d === "string") : [];
  const action = body?.action;
  if (!docIds.length || docIds.length > 500 || (action !== "approve" && action !== "review")) {
    return NextResponse.json({ error: "Send docIds and an action of 'approve' or 'review'" }, { status: 400 });
  }

  const rows = (await sql.query(
    action === "approve"
      ? `UPDATE filings SET approved_at = NOW(), approved_by = $2
         WHERE doc_id = ANY($1) AND parse_status IN ('ok', 'manual') AND approved_at IS NULL
         RETURNING doc_id`
      : `UPDATE filings SET parse_status = 'flagged', approved_at = NULL, approved_by = NULL
         WHERE doc_id = ANY($1) AND parse_status = 'ok' AND approved_at IS NULL
         RETURNING doc_id`,
    action === "approve" ? [docIds, admin] : [docIds]
  )) as { doc_id: string }[];

  return NextResponse.json({ updated: rows.map((r) => r.doc_id) });
}
