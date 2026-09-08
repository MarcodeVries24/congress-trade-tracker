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
