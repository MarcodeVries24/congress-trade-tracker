import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";
import { ALERT_CONTENT_KEY_SQL } from "@/lib/alertFilters";
import { TRADE_ROW_COLUMNS_SQL, TRADE_ROW_FROM_SQL, withMemberSlugs } from "@/lib/tradeRows";

/** As many as one alert's own list shows; older ones are on each alert's page. */
const MAX_TRADES = 100;

/**
 * The trades all of the caller's alerts have sent, newest send first, each
 * with the alert it came from: the Alerts tab of the app. The same list as one
 * alert's (see ../[id]/trades, which says how a sent trade is found again),
 * over every alert at once. A trade two alerts sent is there under both.
 *
 * Not a Pro feature, for the same reason: they were already sent.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to see your alerts." }, { status: 401 });

  const rows = (await sql.query(
    `WITH sent AS (
       SELECT am.match_key, am.doc_id, am.sent_at, am.alert_id, a.name AS alert_name
       FROM alert_matches am
       JOIN alerts a ON a.id = am.alert_id
       WHERE a.user_id = $1
       ORDER BY am.sent_at DESC, am.alert_id
       LIMIT $2
     ),
     lines AS (
       SELECT ${TRADE_ROW_COLUMNS_SQL},
              ${ALERT_CONTENT_KEY_SQL} || ':' ||
                ROW_NUMBER() OVER (PARTITION BY t.doc_id, ${ALERT_CONTENT_KEY_SQL} ORDER BY t.id) AS match_key
       ${TRADE_ROW_FROM_SQL}
       WHERE t.doc_id IN (SELECT DISTINCT doc_id FROM sent)
     )
     SELECT l.*, s.sent_at, s.alert_id::text AS alert_id, s.alert_name
     FROM lines l
     JOIN sent s ON s.match_key = l.match_key
     ORDER BY s.sent_at DESC, s.alert_id, l.filing_date DESC NULLS LAST, l.id`,
    [userId, MAX_TRADES]
  )) as Record<string, unknown>[];

  const trades = (await withMemberSlugs(rows)).map(({ match_key: _key, ...row }) => row);
  return NextResponse.json({ trades, max: MAX_TRADES }, { headers: { "Cache-Control": "private, no-store" } });
}
