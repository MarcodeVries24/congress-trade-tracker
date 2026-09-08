import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Point it at your Neon Postgres connection string.");
}

// HTTP-only client (no WebSocket/TCP needed) — well suited to Vercel's
// serverless functions, and to any sandboxed dev environment that only
// allows plain HTTPS outbound.
export const sql = neon(connectionString);
