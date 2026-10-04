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
    -- 'pending' (not yet attempted) | 'ok' (native text parse succeeded) |
    -- 'ocr' (no text layer — scanned doc, OCR fallback found transactions,
    -- lower confidence than 'ok') | 'empty' (nothing extractable) |
    -- 'failed' (download/parse error) | 'unsupported' | 'not-a-ptr' |
    -- 'manual' (automated parse was wrong/undercounted — a human
    -- pixel-by-pixel verified the scan against the transactions table by
    -- hand; treat as MORE trustworthy than 'ok', not just equivalent to it,
    -- and never let a routine/forced re-ingest run overwrite it without
    -- deliberately re-auditing first) | 'flagged' (sent to manual review
    -- from /admin: its parsed rows are a draft until a human has checked
    -- the scan, like 'ocr') | 'duplicate' (the same trades as an earlier
    -- filing, typically an amendment stored next to the original: hidden so
    -- they aren't counted twice; see data_corrections).
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
  // Admin approval: nothing is published until a person has looked at it.
  // approved_at NULL means "waiting in /admin"; the site's publish gate
  // (PUBLISHED_FILING_SQL in web/lib/sql.ts) requires it alongside an
  // 'ok'/'manual' parse_status. approved_by is the Clerk user id, or 'cli'
  // for review:approve, or 'backfill' for what was live before the gate.
  // Hand corrections, re-applied after a filing is re-read (db/corrections.ts).
  `CREATE TABLE IF NOT EXISTS data_corrections (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    doc_id TEXT NOT NULL,
    target TEXT NOT NULL,
    match_asset_name TEXT,
    field TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    reason TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_data_corrections_doc ON data_corrections(doc_id)`,
  `ALTER TABLE filings ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
  `ALTER TABLE filings ADD COLUMN IF NOT EXISTS approved_by TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_filings_awaiting_approval ON filings(ingested_at) WHERE approved_at IS NULL`,
  // Exactly once, when the gate is introduced: everything already published
  // stays published. The marker row is what makes it once — the INSERT only
  // returns a row the first time, and the UPDATE only runs when it does, so
  // a later ingest run can never auto-approve a new filing through here.
  `CREATE TABLE IF NOT EXISTS approval_gate (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT approval_gate_singleton CHECK (id)
  )`,
  `WITH first_run AS (
     INSERT INTO approval_gate (id) VALUES (TRUE) ON CONFLICT DO NOTHING RETURNING 1
   )
   UPDATE filings SET approved_at = ingested_at, approved_by = 'backfill'
   WHERE parse_status IN ('ok', 'manual') AND approved_at IS NULL AND EXISTS (SELECT 1 FROM first_run)`,
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
  // market_cap is always USD. Finnhub reports it in the listing's own
  // currency, which went unnoticed until /issuers sorted by it and put SK
  // Hynix above Nvidia: 55 of 2,068 priced tickers — Japanese, Korean,
  // Taiwanese, Indonesian and Indian listings — held a number in KRW, JPY,
  // TWD, IDR or INR. This records which currency the figure was converted
  // *from*, so the same mistake is visible in the data rather than only in
  // an implausible ranking. NULL for a row written before the conversion
  // existed, or one whose provider gave no currency.
  `ALTER TABLE company_market_caps ADD COLUMN IF NOT EXISTS source_currency TEXT`,
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
  // ---------------------------------------------------------------------
  // CongTrade Pro email alerts (see web/lib/alertFilters.ts for the filter
  // shape, and ingest/src/alerts/sendAlerts.ts for the cron that sends them).
  // ---------------------------------------------------------------------
  // One saved alert. `user_id` is the Clerk user id — Clerk owns identity,
  // this table only ever stores the id plus a snapshot of the delivery
  // address, refreshed from Clerk whenever the owner opens /account (the
  // sender runs in GitHub Actions and has no Clerk credentials of its own,
  // so it cannot look an address up at send time).
  //
  // `filters` is the JSON produced by normalizeAlertFilters — already
  // whitelisted before it is stored, never trusted as-is when read back.
  `CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- 'instant' (every ingest run) | 'daily' | 'weekly'
    frequency TEXT NOT NULL DEFAULT 'instant',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Random, unguessable; lets the List-Unsubscribe header and the email's
    -- own footer link turn an alert off without a login, which is what
    -- mailbox providers expect from bulk senders.
    unsubscribe_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sent_at TIMESTAMPTZ,
    -- Lifetime counters, shown in the account screen so an alert that never
    -- fires is visibly distinguishable from one that was never checked.
    sent_count INTEGER NOT NULL DEFAULT 0,
    matched_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_due ON alerts(active, frequency, last_sent_at)`,
  // The "already told you about this" ledger — one row per trade per alert.
  //
  // Keyed on a hash of the trade's *content* rather than transactions.id,
  // because ids are not stable: re-ingesting a filing deletes and reinserts
  // every one of its rows (see run.ts), and a hand-verified rewrite does the
  // same. Keying on the id would re-notify a member's entire filing every
  // time its parse improved. The hash includes an occurrence number so two
  // genuinely identical lines in one filing (same asset, same day, same
  // bracket — which does happen) still count as two.
  `CREATE TABLE IF NOT EXISTS alert_matches (
    alert_id BIGINT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    match_key TEXT NOT NULL,
    doc_id TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (alert_id, match_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_alert_matches_sent_at ON alert_matches(sent_at)`,
  // Why an alert stopped sending on its own, when it did: NULL for an alert
  // the owner paused by hand, 'subscription-ended' when the sender found the
  // account no longer holds CongTrade Pro. The account screen turns this into
  // an explanation and an upgrade link rather than leaving someone staring at
  // an alert that says Active and never fires.
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS paused_reason TEXT`,
  // Cached answer to "does this account still hold CongTrade Pro?", so the
  // alert sender can stop emailing someone whose subscription has ended.
  //
  // It has to be cached because the sender runs in GitHub Actions, outside any
  // request, and Clerk is the only authority on this — one HTTP call per user
  // per run would otherwise be wasted work on every quiet cycle. The web app
  // also writes here whenever the owner opens /account, where it already knows
  // the answer for free, so most cron runs never have to ask Clerk at all.
  //
  // is_pro DEFAULTS TO TRUE and checked_at is NULLable on purpose: a row that
  // exists but was never successfully checked means "we don't know", and not
  // knowing must never silence a paying subscriber. See entitlements.ts.
  `CREATE TABLE IF NOT EXISTS user_entitlements (
    user_id TEXT PRIMARY KEY,
    is_pro BOOLEAN NOT NULL DEFAULT TRUE,
    plan_slug TEXT,
    -- 'billing' (a paid plan's features) | 'admin' (comped via public
    -- metadata) | 'web' (recorded by the site from a signed-in session)
    source TEXT,
    -- NULL = never successfully checked. Not bumped on a failed lookup, so a
    -- Clerk outage retries next run instead of being cached as an answer.
    checked_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // Watermark for the daily report: everything ingested after this instant is
  // what the next report covers.
  //
  // The report used to select on `filing_date = CURRENT_DATE - 1`, which
  // silently missed almost everything. A filing is *discovered* long after it
  // is filed — the House Clerk publishes on its own schedule — so a document
  // filed on the 22nd might not be ingested until late on the 23rd, by which
  // point the report for the 22nd had already run and the report for the 23rd
  // is looking at a different filing_date. Such filings were never reported at
  // all: in one 45-day sample only 6 filings were ingested within 24h of their
  // filing date.
  //
  // A fixed "last 24 hours" window would not fix it either, because GitHub's
  // scheduled runs drift by hours (3.5h observed), which would reopen the same
  // gap. A watermark is exact regardless of when the job actually runs, and it
  // only moves after the email is sent, so a failed run re-reports rather than
  // skipping a day.
  `CREATE TABLE IF NOT EXISTS report_runs (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    last_report_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT report_runs_singleton CHECK (id)
  )`,
  // Who is paying, and for what.
  //
  // Stripe is the system of record for the money; this table is the system of
  // record for *access*, which is a different question and one every part of
  // this codebase has to answer cheaply. The alert sender asks it once per
  // subscriber per run, and an HTTP call to a billing API for each of those
  // was the previous design.
  //
  // Keyed by the Clerk user id, because that is the identity the rest of the
  // app has in hand. One row per user: a second subscription for the same
  // person replaces the first rather than sitting beside it.
  `CREATE TABLE IF NOT EXISTS subscriptions (
    clerk_user_id TEXT PRIMARY KEY,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT,
    -- Stripe's own vocabulary, stored verbatim: 'active' | 'trialing' |
    -- 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' |
    -- 'unpaid' | 'paused'. Deciding which of those still grants access is a
    -- product question and lives in code, not in this column.
    status TEXT NOT NULL,
    price_id TEXT,
    -- When the paid-for period ends. Access survives to here even after a
    -- cancellation, which is what "cancel any time" promises on the site.
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(stripe_customer_id)`,
  // --- Provider-neutral columns, for the mobile app's in-app purchases. ---
  //
  // Apple and Google bill the app; Stripe bills the website. One person can
  // hold a subscription from more than one of them, so the key is the pair and
  // access is "any row grants it" (see grantsAccess in @congtrade/shared).
  //
  // Added alongside the stripe_* columns rather than renaming them, so that the
  // deployed site keeps working while the new build rolls out. The old columns
  // are dropped in a later pass, once nothing reads them.
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'stripe'`,
  // What the provider calls the payer: a Stripe customer, or the original
  // transaction the store ties every renewal of a subscription back to.
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_account_id TEXT`,
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT`,
  // Stripe calls it a price, the stores call it a product. Same job.
  `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_id TEXT`,
  // A store subscription has no Stripe customer, so the old NOT NULL cannot
  // stand. Guarded because a fresh database creates the column without it.
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'subscriptions' AND column_name = 'stripe_customer_id'
                  AND is_nullable = 'NO')
     THEN ALTER TABLE subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL; END IF;
   END $$`,
  // Carry anything already stored under the Stripe names across.
  `UPDATE subscriptions SET
     provider_account_id = COALESCE(provider_account_id, stripe_customer_id),
     provider_subscription_id = COALESCE(provider_subscription_id, stripe_subscription_id),
     product_id = COALESCE(product_id, price_id)
   WHERE provider_account_id IS NULL OR provider_subscription_id IS NULL OR product_id IS NULL`,
  // The key becomes the pair. Done only when it is still the old single-column
  // key, so re-running this is free.
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM pg_index i
                JOIN pg_class c ON c.oid = i.indexrelid
                WHERE c.relname = 'subscriptions_pkey' AND i.indnatts = 1)
     THEN
       ALTER TABLE subscriptions DROP CONSTRAINT subscriptions_pkey;
       ALTER TABLE subscriptions ADD PRIMARY KEY (clerk_user_id, provider);
     END IF;
   END $$`,
  // One account per provider, rather than one Stripe customer overall.
  `DROP INDEX IF EXISTS idx_subscriptions_customer`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_provider_account
     ON subscriptions(provider, provider_account_id) WHERE provider_account_id IS NOT NULL`,
  // Stripe redelivers webhooks, and out of order. Recording every event id we
  // have already applied makes replays free rather than merely harmless.
  `CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // The same ledger for the two stores. Apple redelivers a notification for
  // five days until it gets a 200, and Google's Pub/Sub push is at-least-once,
  // so both will arrive twice; the id is what makes a replay free rather than
  // merely harmless. Kept apart from stripe_events because the id spaces are
  // different and a collision between them would be silent.
  // Apple's appAccountToken is a UUID, not a free string: StoreKit parses it
  // with UUID(uuidString:) and silently drops anything else. A Clerk id is
  // "user_2abc...", so passing one directly would have produced a purchase that
  // verifies perfectly and belongs to nobody, which is the worst shape of bug
  // here — the money arrives and the access does not.
  //
  // So each account gets a UUID of its own, once, and the stores carry that.
  // Android's obfuscatedAccountId takes any string but uses the same one, so
  // there is a single answer to "whose purchase is this".
  `CREATE TABLE IF NOT EXISTS store_account_tokens (
    token TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS store_events (
    provider TEXT NOT NULL,
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, id)
  )`,
  // ---------------------------------------------------------------------
  // Company logos. Finnhub's profile already carries one, and the monthly
  // market-cap sync was fetching that profile and throwing the logo away.
  // NULL means none on file (most funds and many foreign listings), which
  // the site and the app turn into a lettered tile rather than a gap.
  // ---------------------------------------------------------------------
  `ALTER TABLE company_market_caps ADD COLUMN IF NOT EXISTS logo_url TEXT`,
  // When the profile was last read for a logo, found or not, so a ticker with
  // none on file is not asked about again on every gap-fill run.
  `ALTER TABLE company_market_caps ADD COLUMN IF NOT EXISTS logo_checked_at TIMESTAMPTZ`,
  // ---------------------------------------------------------------------
  // What a stock did around a trade: the close on the day it was traded,
  // on the day it was disclosed, and now. That gap between trade and
  // disclosure is what the STOCK Act exists to keep short, and the move
  // inside it is the number the public never sees.
  //
  // Only the closes the trades actually need are kept, one row per ticker
  // per date some trade was made or filed on, rather than full daily
  // history: about 60,000 rows instead of three million, and every one of
  // them used. `day` is the date asked about; `close_day` the trading day
  // whose close answers it (the last one on or before `day`, since a
  // filing can land on a weekend). Both are YYYY-MM-DD text, the same
  // shape transactions and filings store their dates in, so the join
  // needs no casts.
  //
  // Closes are split-adjusted as of the fetch. A split after the fact
  // would leave old rows on the old basis, so the sync rewrites a ticker's
  // rows whenever its source reports a split.
  // ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS price_points (
    ticker TEXT NOT NULL,
    day TEXT NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    close_day TEXT NOT NULL,
    PRIMARY KEY (ticker, day)
  )`,
  // One row per ticker: its latest close, and how the last sync of it went.
  // status: 'ok' | 'not_found' (the source has no such symbol: delisted,
  // foreign, or not a listed security) | 'error' (try again next run).
  `CREATE TABLE IF NOT EXISTS price_latest (
    ticker TEXT PRIMARY KEY,
    close DOUBLE PRECISION,
    close_day TEXT,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    note TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // The first close the source has, so a trade from before the listing (or
  // before the source's history starts) is known to be unanswerable rather
  // than retried on every run.
  `ALTER TABLE price_latest ADD COLUMN IF NOT EXISTS first_day TEXT`,
  // ---------------------------------------------------------------------
  // Push notifications, from the app. An alert delivers by email, by push,
  // or both: email stays the default so every alert made before push existed
  // keeps arriving exactly as it did.
  // ---------------------------------------------------------------------
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  // One row per phone that has said yes to notifications, keyed by its Expo
  // push token. A token belongs to one install, not one person: signing in
  // as someone else on the same phone moves the row to them, which is the
  // upsert in /api/push/devices. Turning notifications off in the app, or
  // Expo reporting the install gone (DeviceNotRegistered), deletes the row.
  `CREATE TABLE IF NOT EXISTS push_devices (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    -- 'ios' | 'android'
    platform TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Bumped each time the app re-registers on launch, so a row nobody has
    -- opened the app on for months is recognisable.
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id)`,
];
