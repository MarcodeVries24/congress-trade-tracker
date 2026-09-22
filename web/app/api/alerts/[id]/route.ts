import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasProServer } from "@/lib/access";
import { ALERT_FREQUENCIES, AlertFrequency, normalizeAlertFilters } from "@/lib/alertFilters";
import { deleteAlert, updateAlert } from "@/lib/alerts";

const VALID_FREQUENCIES = new Set<string>(ALERT_FREQUENCIES.map((f) => f.value));
const MAX_NAME_LENGTH = 80;

/**
 * Edit or delete one alert. Ownership isn't checked separately — every query
 * in lib/alerts.ts carries `user_id = $caller`, so another account's id just
 * matches nothing and comes back as a 404.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage alerts." }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Unknown alert." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const patch: { name?: string; filters?: ReturnType<typeof normalizeAlertFilters>; frequency?: AlertFrequency; active?: boolean } = {};
  const raw = body as Record<string, unknown>;

  // Pausing or deleting an alert stays available after a subscription lapses
  // — it would be hostile to keep sending emails someone can no longer turn
  // off. Changing what an alert *watches* is the paid part.
  const changesContent = raw.name !== undefined || raw.filters !== undefined || raw.frequency !== undefined;
  if (changesContent && !(await hasProServer())) {
    return NextResponse.json({ error: "Email alerts are a CongTrade Pro feature." }, { status: 403 });
  }

  if (raw.name !== undefined) {
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_NAME_LENGTH) : "";
    if (!name) return NextResponse.json({ error: "Give the alert a name." }, { status: 400 });
    patch.name = name;
  }
  if (raw.frequency !== undefined) {
    if (typeof raw.frequency !== "string" || !VALID_FREQUENCIES.has(raw.frequency)) {
      return NextResponse.json({ error: "Pick how often to be emailed." }, { status: 400 });
    }
    patch.frequency = raw.frequency as AlertFrequency;
  }
  if (raw.filters !== undefined) patch.filters = normalizeAlertFilters(raw.filters);
  if (raw.active !== undefined) patch.active = Boolean(raw.active);

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const alert = await updateAlert(userId, id, patch);
  if (!alert) return NextResponse.json({ error: "Unknown alert." }, { status: 404 });
  return NextResponse.json({ alert });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage alerts." }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Unknown alert." }, { status: 404 });

  const deleted = await deleteAlert(userId, id);
  if (!deleted) return NextResponse.json({ error: "Unknown alert." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
