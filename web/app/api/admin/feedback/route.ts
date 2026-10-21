import { NextResponse, type NextRequest } from "next/server";
import { adminUserId } from "@/lib/admin";
import { FEEDBACK_STATUSES, updateFeedback, type FeedbackStatus } from "@/lib/feedback";

/**
 * The admin's handling of a feedback message in /admin/feedback:
 * { "id": "12", "status": "done", "note": "Fixed in 1.0.1" }, the note
 * optional. Anyone but the admin gets a 404, as if the route did not exist.
 */
export async function PATCH(req: NextRequest) {
  const admin = await adminUserId();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // JSON only, so another site cannot submit this with the admin's cookie.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown; note?: unknown } | null;
  const id = typeof body?.id === "string" && /^\d+$/.test(body.id) ? body.id : null;
  const status = FEEDBACK_STATUSES.includes(body?.status as FeedbackStatus) ? (body!.status as FeedbackStatus) : null;
  if (!id || !status) return NextResponse.json({ error: "Send an id and a status of new, read or done" }, { status: 400 });
  const note =
    body?.note === undefined ? undefined : typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;

  const found = await updateFeedback(id, status, note);
  if (!found) return NextResponse.json({ error: "No such feedback" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
