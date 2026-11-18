import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ALERT_CONTENT_KEY_SQL, summarizeAlert } from "@/lib/alertFilters";
import { getAlert } from "@/lib/alerts";
import { TRADE_ROW_COLUMNS_SQL, TRADE_ROW_FROM_SQL, withMemberSlugs } from "@/lib/tradeRows";

/** The most recent sends a phone is shown; older ones are in the emails, and in the alert's filtered search. */
const MAX_TRADES = 100;

/**
 * The trades one alert has sent its owner, newest send first: what a tapped
 * notification opens, so the trades it announced are the ones on screen
 * rather than everything the alert's filters match.
 *
 * The sender records each trade it sends in alert_matches under the key it
 * matched it by (ingest/src/alerts/sendAlerts.ts): the content key of the
 * transaction and which occurrence of that content it is within its filing.
 * The same key is computed here over the filings those rows name, which finds
 * the transactions again. Rows sent together share a sent_at, since they are
 * written by one statement, so the app can group them by notification.
 *
 * Not a Pro feature: these are trades the person was already sent, and a
 * notification tapped after a subscription ends should still open. Only the
 * owner can read them; getAlert matches on the caller's id, so another
 * account's alert is a 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to see your alerts." }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Unknown alert." }, { status: 404 });
  const alert = await getAlert(userId, id);
  if (!alert) return NextResponse.json({ error: "Unknown alert." }, { status: 404 });

  const [rows, counts] = await Promise.all([
    sql.query(
      `WITH sent AS (
         SELECT match_key, doc_id, sent_at FROM alert_matches
         WHERE alert_id = $1::bigint
         ORDER BY sent_at DESC
         LIMIT $2
       ),
       lines AS (
         SELECT ${TRADE_ROW_COLUMNS_SQL},
                ${ALERT_CONTENT_KEY_SQL} || ':' ||
                  ROW_NUMBER() OVER (PARTITION BY t.doc_id, ${ALERT_CONTENT_KEY_SQL} ORDER BY t.id) AS match_key
         ${TRADE_ROW_FROM_SQL}
         WHERE t.doc_id IN (SELECT DISTINCT doc_id FROM sent)
       )
       SELECT l.*, s.sent_at
       FROM lines l
       JOIN sent s ON s.match_key = l.match_key
       ORDER BY s.sent_at DESC, l.filing_date DESC NULLS LAST, l.id`,
      [id, MAX_TRADES]
    ),
    sql.query(`SELECT COUNT(*)::int AS count FROM alert_matches WHERE alert_id = $1::bigint`, [id]),
  ]);

  const trades = (await withMemberSlugs(rows as Record<string, unknown>[])).map(({ match_key: _key, ...row }) => row);
  return NextResponse.json(
    {
      alert: { id: alert.id, name: alert.name, filters: alert.filters, summary: summarizeAlert(alert.filters) },
      trades,
      totalSent: (counts as { count: number }[])[0]?.count ?? 0,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
