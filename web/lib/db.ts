import { Pool } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Point it at your Neon Postgres connection string.");
}

// A fresh Pool per invocation is the recommended pattern for serverless
// (Neon's driver multiplexes over HTTP/WebSocket, so this stays cheap).
export const pool = new Pool({ connectionString });
