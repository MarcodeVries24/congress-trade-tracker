# Congress Trade Tracker

A searchable database of U.S. House and Senate stock trades, built directly
from the government's own disclosure filings — no third-party API in
between, and fully cloud-hosted (works even when your own machine is off).

## How it works

Members of Congress must disclose stock trades within 45 days via a
**Periodic Transaction Report (PTR)**.

**House** — filed as a PDF with the Office of the Clerk:

1. Downloads the Clerk's public yearly index (`disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip`),
   which lists every filing and its `DocID`.
2. Downloads each PTR PDF (`.../ptr-pdfs/{year}/{DocID}.pdf`) and extracts the
   transaction table (asset, ticker, buy/sell, dates, amount range) with a
   regex-based parser tuned to the Clerk's PDF layout.

**Senate** — filed as an HTML report with the Office of Public Records:

1. `efdsearch.senate.gov` blocks plain HTTP requests at the network edge
   (Akamai), even with a real browser user-agent — the same wall that ended
   the original Senate Stock Watcher project — and also blocks Playwright's
   *bundled* Chromium build specifically. Getting past it needs Playwright
   driving a real, separately-installed Chrome build (`channel: "chrome"`),
   which is what [`ingest/src/ingest/senate/browser.ts`](ingest/src/ingest/senate/browser.ts)
   does.
2. That browser accepts the site's access agreement, paginates the
   DataTables-based PTR search results, and opens each report.
3. Electronic reports are parsed directly from their HTML transaction table.
   Paper/scanned filings have no such table — [`ocrPaperReport.ts`](ingest/src/ingest/senate/ocrPaperReport.ts)
   instead OCRs the scanned page images (Tesseract.js) and reconstructs the
   transaction grid by classifying each checkbox "X" mark against the known
   column positions of the standard Senate PTR schedule. Filings that don't
   match that template (an older layout with a different, wider set of
   dollar brackets was in use through at least 2024) are declined rather
   than risk misreading a mismatched grid, and stay `parse_status =
   'unsupported'`. Rows recovered this way are stored as `parse_status =
   'ocr'` — a genuinely less certain read than text-native extraction, and
   flagged as such everywhere they appear in the UI (an "OCR" badge, linking
   to the original scan) rather than presented with the same confidence.
4. Senate filings carry no district-style key, so senators are matched to
   `members_reference` by a synthetic `SEN:{normalizedlastname}` key instead
   of the real `state_district` join House uses — see
   [`normalizeLastName.ts`](ingest/src/ingest/normalizeLastName.ts).

Both chambers share the rest of the pipeline:

3. Stores everything in a Postgres database (hosted on [Neon](https://neon.tech)).
4. A Next.js site (hosted on [Vercel](https://vercel.com)) serves the search UI
   and the REST API (as Next.js API routes) straight off that database, with
   a House / Senate / Both toggle (defaults to House).
5. A scheduled GitHub Actions workflow re-runs both ingests every 4 hours, so
   the dataset stays current with nothing needing to run on your own machine.
6. Separately, each member's official photo and party are synced from the
   public [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
   dataset into a `members_reference` table — House by `state_district`,
   Senate by the synthetic last-name key above. Photos are hotlinked from
   `congress.gov`'s own CDN.
7. Also separately, [`syncMarketCaps.ts`](ingest/src/ingest/syncMarketCaps.ts)
   enriches trades with the *current* market cap of the company traded (not
   a historical value as of the trade date — a free-tier API has no
   practical way to provide that), via [Finnhub](https://finnhub.io), on a
   monthly schedule (market cap doesn't move meaningfully day to day the
   way filings do). Most House OCR rows have an asset name but no ticker, so
   a one-time-per-name search step resolves a ticker from the name first —
   accepting only an exact company-name match, since a fuzzy guess here
   would silently attach the wrong company's market cap to a trade. A trade
   whose ticker (direct or resolved) isn't found, or isn't a public company
   Finnhub has a cap for, shows as `Undefined` rather than guessed at.
8. Once a day, [`sendDailyReport.ts`](ingest/src/ingest/sendDailyReport.ts)
   emails a rollup (via [Resend](https://resend.com)) of everything the
   pipeline touched in the preceding 24 hours — filings split into
   successful (a transaction was recovered) vs. undefined (nothing could
   be extracted), plus how many new transactions were added.
9. After every ingest run, [`sendAlerts.ts`](ingest/src/alerts/sendAlerts.ts)
   emails CongTrade Pro subscribers whose saved alerts match anything that
   just arrived. The matching SQL is not written there: it comes from
   [`web/lib/alertFilters.ts`](web/lib/alertFilters.ts), the same module the
   account screen uses to *preview* an alert before it's saved — one
   implementation, so a preview that promised 12 matches can't quietly
   deliver a different 12. Each alert keeps a ledger of what it has already
   sent, keyed on a hash of the trade's content rather than its row id,
   because re-ingesting a filing deletes and reinserts all of its rows: an
   id-keyed ledger would re-send a member's entire filing every time its
   parse improved.

### Known data-quality limits

- A meaningful share of House filings — hand-delivered paper forms, mostly,
  not correlated with any particular `DocID`/year range — are scanned images
  with no extractable text. A first OCR attempt was abandoned (Tesseract's
  default segmentation garbled even clear text on this form's dense checkbox
  grid); [`ocrHousePtr.ts`](ingest/src/ingest/ocrHousePtr.ts) is a second,
  working attempt — row/column gridlines are found from the scan's own pixel
  darkness (not OCR), each field is OCR'd as its own tightly-cropped cell,
  and checkbox marks (Type of Transaction, Amount) are read by ink density,
  cross-checked at two different crop insets against each other rather than
  a single fixed threshold, since a bold printed checkmark and a faint
  handwritten "X" need different treatment to isolate the mark from the
  cell's own border. A scanned page fed in sideways is auto-detected and
  corrected (checked at all four rotations, disambiguated by OCRing the
  form's own header text where the grid shape alone is ambiguous). Recovered
  filings land as `parse_status = 'ocr'`; a backfill across all pre-existing
  empty House filings (2022-2026) recovered 199 of 381 (4,345 transactions) —
  the remaining 182 are genuinely illegible scans, declined rather than
  guessed. Whatever OCR can't confidently resolve on a row it does recover
  (a checkbox mark, a date, the owner code) is logged to `parse_issues`
  rather than guessed at, same policy as the text parser below; a filing's
  own scan is always one click away via the "i" badge for anything that
  looks off. A distinct, already-fixed bug is the newer digitally-typeset
  House PDF template rendering its checkbox/radio widgets through an icon
  font whose glyphs corrupt the *text* extraction of the whole line they're
  on — see `stripCheckboxGlyphs` in `parsePtr.ts`.
- Senate paper filings using the current form template are OCR'd
  (`parse_status = 'ocr'`); ones using the older, pre-2025-ish template are
  declined (`parse_status = 'unsupported'`) rather than extracted against a
  layout the parser wasn't calibrated for. OCR'd amounts/types/dates come
  from classifying checkbox marks by pixel position, not reading text, so
  it's inherently less certain than every other data source in this
  project — verify anything load-bearing against the linked scan. (House's
  OCR, above, follows the same per-cell approach but was built and
  calibrated separately, since the two chambers' paper forms differ enough
  — column counts, checkbox style, scan quality — that a shared
  implementation wasn't a good fit.)
- The parser is regex-based and tuned against real filings, but PTR PDFs
  aren't perfectly uniform. Any transaction line it can't confidently match to
  an asset name is logged to the `parse_issues` table instead of guessed at.
- Dates are stored exactly as filed, never silently corrected. Members
  occasionally file with a typo — e.g. a transaction date shown as after the
  filing date, which is impossible — and that's an error in the source
  document, not the parser. Rows like that (a handful out of thousands) are
  excluded from the site and from `/api/stats` by default, since displaying
  a data-entry error as a real trade would be misleading; the raw row stays
  in the database untouched.
- A small number of senators (2 of 100, at time of writing) don't have a
  matching entry in the upstream `congress-legislators` dataset used for
  photos/party, so they fall back to an initials avatar — a data-quality gap
  in that upstream source, not in the matching logic.

## Project layout

```
ingest/   Node/TypeScript ingestion CLI (index fetch → PDF parse → Postgres)
web/      Next.js site — search/filter UI + API routes (app/api/*)
```

## Cloud setup

### 1. Database — Neon Postgres (free)

1. Sign in at [neon.tech](https://neon.tech) (GitHub sign-in works).
2. Create a project, then copy its connection string
   (`postgresql://user:password@ep-....neon.tech/neondb?sslmode=require`).
3. You'll use this same connection string in two places below — as a GitHub
   Actions secret and as a Vercel environment variable. The ingest script
   creates the tables automatically on first run (no manual migration step).

### 2. Scheduled ingestion — GitHub Actions

1. In the GitHub repo's **Settings → Secrets and variables → Actions**, add a
   secret named `DATABASE_URL` with the Neon connection string.
2. That's it — [.github/workflows/ingest.yml](.github/workflows/ingest.yml)
   runs `npm run sync-members`, then `npm run ingest` (House), then
   `npm run ingest-senate` (Senate) every 4 hours (`17 */4 * * *`), and can
   also be triggered manually from the Actions tab (**Run workflow**). The
   Senate step needs a real Chrome build on the runner (Playwright's bundled
   Chromium gets blocked), so the workflow provisions one first via
   `npx playwright install --with-deps chrome`.

### 3. Market cap enrichment — Finnhub (free, optional)

1. Sign up at [finnhub.io/register](https://finnhub.io/register) (no card)
   and copy your API key from the dashboard.
2. Add a GitHub Actions secret named `FINNHUB_API_KEY` with that key.
3. [.github/workflows/market-caps.yml](.github/workflows/market-caps.yml)
   runs `npm run sync-market-caps` monthly. The first run is slow (Finnhub's
   free tier is rate-limited to 60 calls/minute, and it has to resolve every
   existing tickerless asset name once — see how it works, above); later
   runs only resolve names new since the last run, so they're much quicker.
   Skip this step entirely and the site still works fine — every trade's
   market cap just shows as `Undefined`.

### 4. Daily ingest report — Resend (free, optional)

An admin-facing email summarizing every PTR actually **filed** the
previous day (all six of that day's ingest runs rolled into one) —
distinguishing filings that were **successful** (at least one transaction
recovered) from ones that came back **undefined** (an illegible/blank scan,
or a processing error — nothing guessed at, same as everywhere else).
Scoped by filing date, not by when the pipeline happened to touch the row —
every ingest run re-checks each chamber's entire current-year index, so an
old filing a code improvement just recovered isn't a *new* filing and
doesn't belong in this report.

1. Sign up at [resend.com](https://resend.com) (no card) and copy your API
   key from the dashboard.
2. Add two GitHub Actions secrets: `RESEND_API_KEY` (the key), and
   `REPORT_EMAIL` (the address to send the report to).
3. [.github/workflows/daily-report.yml](.github/workflows/daily-report.yml)
   runs `npm run send-daily-report` once a day. Without a verified sending
   domain, Resend can only deliver to the email address that owns the
   Resend account — fine for this (an admin report to yourself). Sending to
   actual users needs a verified domain: see **CongTrade Pro email alerts**
   below. Skip this step entirely and everything else still works fine —
   you just won't get the email.

### 5. Website + API — Vercel

1. Sign in at [vercel.com](https://vercel.com) (GitHub sign-in works) and
   import this GitHub repo as a new project.
2. Set the project's **Root Directory** to `web`.
3. Add an environment variable `DATABASE_URL` with the same Neon connection
   string.
4. Deploy. Every push to the repo redeploys automatically.

### 6. CongTrade Pro email alerts — needs a verified sending domain

A paid subscriber can save up to 25 alerts on `/account`: a filter over
chamber, party, state, member, ticker, asset type, buy/sell, owner, trade
size, market cap, filing punctuality and free text, delivered as it happens
(checked every ingest run, so at most ~4 hours), daily, or weekly.

Unlike the admin report above, these go to **other people's** addresses, so
Resend's sandbox sender won't do — it can only deliver to the address that
owns the Resend account.

1. In Resend, add and verify your domain (DNS records for SPF/DKIM). This is
   the only manual step; everything else is already wired up.
2. Add a GitHub Actions secret `ALERT_FROM_EMAIL` with a from-address on
   that domain, e.g. `CongTrade <alerts@congtrade.com>`.
3. Optionally add `SITE_URL` (defaults to `https://www.congtrade.com`) — it's
   what the links in the emails point at.

Until `ALERT_FROM_EMAIL` is set the job runs, says so, and sends nothing, so
the workflow step is safe to have in place beforehand. Alerts themselves can
still be created and previewed on the site meanwhile; they simply queue up.

Every alert email carries `List-Unsubscribe` / `List-Unsubscribe-Post`
headers and a footer link, both pointing at `/api/alerts/unsubscribe`, which
pauses (never deletes) that one alert without a login. Mailbox providers
increasingly penalize bulk senders that don't offer this.

4. Add a GitHub Actions secret `CLERK_SECRET_KEY` so the sender can re-check
   that each alert's owner still holds Pro. **It must be the secret key for
   the same Clerk instance the live site signs users in with** — the
   production `sk_live_…` key, not a development one. Optional: without it
   every alert is treated as entitled and the job says so.

#### When a subscription ends

Before each send, the owner's plan is re-checked against Clerk
([`entitlements.ts`](ingest/src/alerts/entitlements.ts)) and a lapsed
subscriber's alerts are **paused with a reason**, not silently skipped — the
account screen then explains why and offers to resubscribe, and the filter
they built is kept intact so it comes straight back. Answers are cached for
12 hours, and the site writes the same cache whenever the owner opens
`/account` (where it knows for free), so most runs never call Clerk at all.

Three things about this are worth knowing before touching it:

- **`subscription.status` is not an entitlement check.** Clerk Billing puts
  everyone on a subscription, free users included, and a free account's
  subscription reads `status: "active"`. Entitlement is in the features the
  subscribed *plan* grants — `notifications` / `filters` on `pro_congtrade` —
  which is what `has({ feature })` reads on the web side too.
- **A cancellation isn't instant, and shouldn't be.** Clerk keeps the
  subscription item active until the paid period ends, so someone who
  cancels mid-month keeps their alerts for the month they paid for. A
  `past_due` item also still counts — a declined renewal is usually one retry
  from succeeding, and cutting alerts the moment a card expires punishes a
  customer who hasn't gone anywhere.
- **Every uncertain answer sends.** No key, a network error, Clerk down, an
  unrecognized response — all fail open, because one extra email to a lapsed
  subscriber is a rounding error next to silently cutting off paying ones.
  There's a specific guard for the worst version of this: if *no* account in
  a run exists in the instance the key points at, that's read as a
  wrong-instance key (a test key in place of a live one) rather than as every
  subscriber deleting their account at once, and nothing is paused. Failed
  checks are counted in the daily report so a broken check can't stay quiet.

## Local development

```bash
npm install
```

Create `web/.env.local` (see `web/.env.local.example`) with your `DATABASE_URL`.
For `sync-market-caps` and `send-daily-report`, also create `ingest/.env`
with `DATABASE_URL` plus `FINNHUB_API_KEY` and/or `RESEND_API_KEY` +
`REPORT_EMAIL` as needed. `alerts:send --dry-run` needs only `DATABASE_URL`.

```bash
npm run dev                 # Next.js site + API at http://localhost:3000
npm run ingest               # run the House PTR ingestion CLI once
npm run ingest-senate        # run the Senate PTR ingestion CLI once (needs Chrome installed)
npm run sync-members         # refresh member photos/party (House + Senate, cheap)
npm run sync-market-caps     # refresh company market caps (needs FINNHUB_API_KEY)
npm run send-daily-report    # send the daily ingest report now (needs RESEND_API_KEY, REPORT_EMAIL)
npm run alerts:send          # send due Pro alerts now (needs RESEND_API_KEY, ALERT_FROM_EMAIL)
npm run alerts:send -- --dry-run      # print what would go out, send nothing
npm run alerts:send -- --alert=42     # just that one alert, ignoring its schedule
```

House ingest options:
- `--year=YYYY` (defaults to current year)
- `--limit=N` — only process the first N not-yet-ingested filings (useful for testing)
- `--force` — re-parse and overwrite filings already in the database

Senate ingest options:
- `--start=MM/DD/YYYY` (defaults to January 1st of the current year)
- `--limit=N` — only process the first N not-yet-ingested filings
- `--force` — re-parse and overwrite filings already in the database

The Senate scraper drives a real Chrome install via Playwright's `channel:
"chrome"` (its own bundled Chromium is blocked by the site's bot protection),
so it needs actual Chrome present — already the case on a normal dev machine,
or provisioned in CI via `npx playwright install --with-deps chrome`.

Downloaded ZIPs/PDFs are cached under `ingest/data/` between runs (a 250ms
delay is added between PDF downloads, out of politeness to the Clerk's
server). Already-ingested filings are skipped automatically. GitHub Actions
runners are ephemeral, so that file cache doesn't carry over between
scheduled runs there — only the already-ingested check (against the
database) does, which is what actually matters.

## Possible next steps

- Adaptive per-filing column calibration for Senate's older paper-form
  template, so those filings stop being declined
- Price-performance metrics (fetch a market price at transaction time vs. now)
