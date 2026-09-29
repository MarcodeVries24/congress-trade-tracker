import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { accountTokenFor } from "@/lib/storeAccountToken";

/**
 * The token the app attaches to a purchase so we can tell whose it is.
 *
 * Fetched rather than derived, because it has to be the same UUID every time
 * and only the server can promise that. The app asks once per sign-in and
 * carries it into every purchase and restore.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ token: await accountTokenFor(userId) });
}
