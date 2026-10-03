import { neon } from "@neondatabase/serverless";
import { SCHEMA_STATEMENTS } from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Point it at your Neon Postgres connection string.");
}

// HTTP-only client: works from any sandboxed/serverless environment that can
// make plain HTTPS requests but may not be able to open raw TCP/WebSocket
// connections (e.g. this fetches over https, no WebSocket upgrade required).
export const sql = neon(connectionString);

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await sql.query(statement);
      }
    })();
  }
  return schemaReady;
}

/**
 * For an ingest upsert's ON CONFLICT clause: a filing that was published
 * before and still parses cleanly keeps its approval, so a re-parse (the
 * pipeline re-reads in bulk when a parser improves) does not pull it off the
 * site. Anything else (new, or newly parseable) waits for approval in /admin.
 */
export const KEEP_APPROVAL_SQL = `
  approved_at = CASE WHEN filings.parse_status IN ('ok', 'manual') AND EXCLUDED.parse_status IN ('ok', 'manual')
                     THEN filings.approved_at END,
  approved_by = CASE WHEN filings.parse_status IN ('ok', 'manual') AND EXCLUDED.parse_status IN ('ok', 'manual')
                     THEN filings.approved_by END`;

