export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS filings (
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
  )`,
  // Resolves *which specific person* filed this, as opposed to state_district
  // alone (a district/Senate-seat key gets reused by whoever holds it next —
  // see members_history/member_terms below). NULL until resolveFilingBioguideIds
  // in syncMembers.ts matches it against member_terms by filing_date; every
  // query that shows a member's party/photo falls back to the old
  // members_reference-by-state_district join when this is NULL, so an
  // unresolved filing is never worse off than before this column existed.
  `ALTER TABLE filings ADD COLUMN IF NOT EXISTS bioguide_id TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_filings_bioguide_id ON filings(bioguide_id)`,
  `CREATE TABLE IF NOT EXISTS transactions (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_doc_id ON transactions(doc_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_ticker ON transactions(ticker)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_name)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)`,
  `CREATE TABLE IF NOT EXISTS parse_issues (
    id SERIAL PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES filings(doc_id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // One row per current House seat (state+district), from the public
  // unitedstates/congress-legislators dataset. Used to attach an official
  // photo + party to trades without any name-matching: state_district is
  // already a reliable join key shared with filings/transactions.
  `CREATE TABLE IF NOT EXISTS members_reference (
    state_district TEXT PRIMARY KEY,
    bioguide_id TEXT NOT NULL,
    official_name TEXT NOT NULL,
    party TEXT,
    photo_url TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // state_district is a real "STATE+district" for House, but for Senate it's
  // a synthetic "SEN:lastname" join key (Senate filings carry no district
  // field to key on) — not fit to show a user. This column holds the actual
  // 2-letter state for both chambers, for display.
  `ALTER TABLE members_reference ADD COLUMN IF NOT EXISTS state TEXT`,
  // members_reference has exactly one row per state_district — the *current*
  // occupant — because that's what every trade used to be shown with,
  // including trades filed years earlier by whoever held that seat before
  // them (confirmed on real data: Fred Upton's MI06 trades were showing
  // Debbie Dingell's party, Pete Sessions' TX32 trades were showing Julie
  // Johnson's — neither has ever served alongside the other). One row per
  // bioguide_id instead, so every person who's ever held a seat keeps their
  // own party/photo regardless of who holds that seat now. party/photo_url
  // reflect that person's most recent known term (a mid-career party switch
  // like Joe Manchin's is a known, accepted simplification — same as
  // members_reference already only ever tracked one "current" party).
  `CREATE TABLE IF NOT EXISTS members_history (
    bioguide_id TEXT PRIMARY KEY,
    official_name TEXT NOT NULL,
    party TEXT,
    photo_url TEXT NOT NULL,
    state TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Every term (current + historical) any legislator has held, keyed by the
  // same state_district join key filings/transactions already use — this is
  // what lets a filing be resolved to the *specific* person who held that
  // seat on its filing_date, not just whoever holds it today. A seat with no
  // gap in coverage has back-to-back terms (one ends the day the next
  // starts), so a filing_date is expected to fall inside exactly one row;
  // resolveFilingBioguideIds in syncMembers.ts only acts when it does.
  `CREATE TABLE IF NOT EXISTS member_terms (
    id SERIAL PRIMARY KEY,
    state_district TEXT NOT NULL,
    bioguide_id TEXT NOT NULL,
    term_start DATE NOT NULL,
    term_end DATE,
    UNIQUE (state_district, bioguide_id, term_start)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_member_terms_district ON member_terms(state_district)`,
  // Single-row heartbeat, updated at the end of every ingest run whether or
  // not it found anything new. Distinct from filings.ingested_at (which only
  // moves when a filing is actually inserted/updated) — this is what proves
  // the scheduled job is still alive even on a quiet run.
  `CREATE TABLE IF NOT EXISTS ingest_runs (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filings_found INTEGER NOT NULL DEFAULT 0,
    filings_processed INTEGER NOT NULL DEFAULT 0,
    transactions_extracted INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT ingest_runs_singleton CHECK (id)
  )`,
  // One row per ticker actually traded, refreshed weekly by syncMarketCaps.ts
  // — the *current* market cap, not a historical value as of the trade date
  // (a free-tier API has no practical way to get that, and it's not what
  // "enrich with the current market cap" asked for anyway). A ticker that
  // exists here but has a NULL market_cap was looked up but the provider
  // didn't have a cap for it (e.g. a fund/ETF, not a company) — still
  // recorded so the weekly refresh doesn't keep re-querying a known miss.
  `CREATE TABLE IF NOT EXISTS company_market_caps (
    ticker TEXT PRIMARY KEY,
    market_cap BIGINT,
    company_name TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Most House OCR rows (paper filings — see ocrHousePtr.ts) have an asset
  // name but no ticker, so they'd never match company_market_caps directly.
  // This resolves a name to a ticker *once* (via a name-search API call) and
  // caches the result — including a confirmed "couldn't resolve this one"
  // (ticker IS NULL) — so the weekly market-cap refresh only fetches caps by
  // ticker and never has to repeat the expensive/fuzzy name search for a
  // name it's already seen. A new row here is only added when a genuinely
  // new asset_name shows up in an ingest.
  `CREATE TABLE IF NOT EXISTS asset_name_tickers (
    asset_name TEXT PRIMARY KEY,
    ticker TEXT,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];
