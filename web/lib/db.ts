import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Point it at your Neon Postgres connection string.");
}

// HTTP-only client (no WebSocket/TCP needed) — well suited to Vercel's
// serverless functions, and to any sandboxed dev environment that only
// allows plain HTTPS outbound.
export const sql = neon(connectionString);

// Re-exported so existing callers keep importing it from here. It lives in
// lib/sql.ts because ingest/ imports it too (see the note there), and this
// module pulls in the Neon client, which the ingest side must not load.
export { PUBLISHED_FILING_SQL } from "./sql";
