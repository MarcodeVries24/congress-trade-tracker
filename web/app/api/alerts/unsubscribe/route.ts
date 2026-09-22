import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * Turns one alert off from its own email, with no login.
 *
 * Two callers, one handler:
 *  - the mailbox provider itself, via the `List-Unsubscribe` /
 *    `List-Unsubscribe-Post` headers the sender sets — Gmail and Outlook
 *    show their own one-click unsubscribe button for bulk mail and expect a
 *    POST to that URL. Not offering it is a deliverability problem, not just
 *    a courtesy.
 *  - the confirmation button on /unsubscribe, for someone who clicked the
 *    link in the email footer.
 *
 * POST-only on purpose: a GET that deactivated the alert would fire on every
 * link prefetch and security scanner that touches the email, silently
 * switching alerts off for people who never clicked anything.
 *
 * The alert is deactivated, not deleted — the owner can re-enable it from
 * the account screen, and an unsubscribe that quietly destroyed a carefully
 * built filter would be its own kind of hostile.
 */
export async function POST(req: NextRequest) {
  const fromQuery = req.nextUrl.searchParams.get("token");
  let token = fromQuery;
  if (!token) {
    const body = await req.json().catch(() => null);
    const candidate = (body as { token?: unknown } | null)?.token;
    if (typeof candidate === "string") token = candidate;
  }

  if (!token) return NextResponse.json({ error: "Missing unsubscribe token." }, { status: 400 });

  const rows = (await sql.query(
    `UPDATE alerts SET active = FALSE, updated_at = NOW() WHERE unsubscribe_token = $1 RETURNING name`,
    [token]
  )) as { name: string }[];

  // An unknown token is answered the same way as a known one: the link is in
  // an email that may be forwarded or archived, and confirming which tokens
  // are real would let anyone with a list of guesses find live alerts.
  return NextResponse.json({ ok: true, name: rows[0]?.name ?? null });
}
