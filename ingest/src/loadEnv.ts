// Loads ingest/.env for local development (e.g. DATABASE_URL). No-op if the
// file doesn't exist — in CI/production, env vars come from the environment
// (GitHub Actions secrets) instead.
try {
  process.loadEnvFile();
} catch {
  // no .env file present — fine, rely on already-exported env vars
}
