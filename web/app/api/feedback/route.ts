import { NextResponse, type NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { readFeedback } from "@congtrade/shared/feedback";
import { emailFeedback, feedbackLimitReached, saveFeedback } from "@/lib/feedback";

/**
 * A message from the app's feedback screen or the website's /feedback page.
 *
 * Open to anyone: signed in, the message is filed under the account and the
 * account's email is the reply address unless the sender gave another;
 * signed out (the website), the sender's own address is the only way back.
 * Saved first, then emailed to the inbox, so a failed email loses nothing.
 */
export async function POST(req: NextRequest) {
  // A cross-site form can post text/plain without a preflight, but not JSON.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

  // The website form's hidden field: people never see it, form-filling
  // scripts fill it in. Answered as a success so the script learns nothing.
  if (body && typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const read = readFeedback(body);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
  const feedback = read.value;

  const { userId } = await auth();
  // A failed count is not a reason to refuse: saving would fail the same way
  // and answer with the friendlier message below.
  if (await feedbackLimitReached(userId ?? null).catch(() => false)) {
    return NextResponse.json(
      { error: "That's a lot of feedback in one hour. Please try again a little later." },
      { status: 429 }
    );
  }
  if (userId && !feedback.email) {
    const user = await currentUser().catch(() => null);
    feedback.email = user?.primaryEmailAddress?.emailAddress ?? null;
  }

  let id: string;
  try {
    id = await saveFeedback(userId ?? null, feedback);
  } catch (err) {
    console.error(`feedback not saved: ${(err as Error).message}`);
    return NextResponse.json(
      { error: "Your feedback couldn't be sent right now. Please try again in a little while." },
      { status: 503 }
    );
  }
  await emailFeedback(id, userId ?? null, feedback);
  return NextResponse.json({ ok: true });
}
