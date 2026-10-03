import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { EXPO_TOKEN, registerPushDevice, removePushDevice } from "@/lib/pushDevices";

/**
 * The app's switch for push notifications on this phone.
 *
 * POST registers the phone's Expo push token for the signed-in account (and
 * is repeated on every launch while notifications are on, which keeps the
 * row fresh and follows a token that rotated). DELETE removes it, which is
 * what turning notifications off in the app does.
 *
 * Open to any signed-in account: a registered phone receives nothing unless
 * one of its owner's alerts has push switched on, and that is the Pro part.
 */
async function readBody(req: NextRequest): Promise<{ token: string; platform: unknown } | null> {
  const body = (await req.json().catch(() => null)) as { token?: unknown; platform?: unknown } | null;
  if (!body || typeof body.token !== "string" || !EXPO_TOKEN.test(body.token)) return null;
  return { token: body.token, platform: body.platform };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to get notifications." }, { status: 401 });
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Not a push token." }, { status: 400 });
  const platform = body.platform === "android" ? "android" : "ios";
  await registerPushDevice(userId, body.token, platform);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Not a push token." }, { status: 400 });
  // Already gone is as good as removed: the switch should end up off either way.
  await removePushDevice(userId, body.token);
  return NextResponse.json({ ok: true });
}
