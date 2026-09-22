import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { hasProServer } from "@/lib/access";
import { ALERT_FREQUENCIES, AlertFrequency, normalizeAlertFilters } from "@/lib/alertFilters";
import { countAlerts, createAlert, listAlerts, MAX_ALERTS_PER_USER, syncAlertEmails } from "@/lib/alerts";

const VALID_FREQUENCIES = new Set<string>(ALERT_FREQUENCIES.map((f) => f.value));
const MAX_NAME_LENGTH = 80;

function parseFrequency(value: unknown): AlertFrequency | null {
  return typeof value === "string" && VALID_FREQUENCIES.has(value) ? (value as AlertFrequency) : null;
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, MAX_NAME_LENGTH);
  return name || null;
}

/**
 * The caller's alerts, plus the two things the account screen needs to know
 * before it can render: whether they still hold CongTrade Pro, and the
 * address alerts will actually be delivered to.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage alerts." }, { status: 401 });

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Keep the snapshot the sender relies on current — see syncAlertEmails.
  if (email) await syncAlertEmails(userId, email);

  const [alerts, isPro] = await Promise.all([listAlerts(userId), hasProServer()]);
  return NextResponse.json({ alerts, isPro, email, maxAlerts: MAX_ALERTS_PER_USER });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to create alerts." }, { status: 401 });
  // Paid feature. Enforced here, not only in the UI — this route is what a
  // direct request would hit.
  if (!(await hasProServer())) {
    return NextResponse.json({ error: "Email alerts are a CongTrade Pro feature." }, { status: 403 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  // Every alert is an email that has to go somewhere. An account with no
  // verified primary address would create alerts that can never be sent, so
  // it's refused up front rather than failing silently in the cron a day later.
  if (!email) {
    return NextResponse.json({ error: "Add an email address to your account first." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const name = parseName((body as { name?: unknown }).name);
  if (!name) return NextResponse.json({ error: "Give the alert a name." }, { status: 400 });

  const frequency = parseFrequency((body as { frequency?: unknown }).frequency);
  if (!frequency) return NextResponse.json({ error: "Pick how often to be emailed." }, { status: 400 });

  if ((await countAlerts(userId)) >= MAX_ALERTS_PER_USER) {
    return NextResponse.json({ error: `You can have up to ${MAX_ALERTS_PER_USER} alerts. Delete one first.` }, { status: 400 });
  }

  const alert = await createAlert({
    userId,
    email,
    name,
    frequency,
    filters: normalizeAlertFilters((body as { filters?: unknown }).filters),
  });
  return NextResponse.json({ alert }, { status: 201 });
}
