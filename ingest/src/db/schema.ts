export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS filings (
  doc_id TEXT PRIMARY KEY,
  chamber TEXT NOT NULL DEFAULT 'house',
  member_name TEXT NOT NULL,
  state_district TEXT,
  filing_type TEXT NOT NULL,
  filing_date TEXT,
  year INTEGER NOT NULL,
  pdf_url TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  transaction_count INTEGER NOT NULL DEFAULT 0,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES filings(doc_id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  state_district TEXT,
  asset_name TEXT NOT NULL,
  ticker TEXT,
  asset_type_code TEXT,
  owner TEXT,
  transaction_type TEXT NOT NULL,
  transaction_date TEXT,
  notification_date TEXT,
  amount_range TEXT,
  amount_low INTEGER,
  amount_high INTEGER
);

CREATE INDEX IF NOT EXISTS idx_transactions_doc_id ON transactions(doc_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_name);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);

CREATE TABLE IF NOT EXISTS parse_issues (
  id SERIAL PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES filings(doc_id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
