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

### 4. Website + API — Vercel

1. Sign in at [vercel.com](https://vercel.com) (GitHub sign-in works) and
   import this GitHub repo as a new project.
2. Set the project's **Root Directory** to `web`.
3. Add an environment variable `DATABASE_URL` with the same Neon connection
   string.
4. Deploy. Every push to the repo redeploys automatically.

## Local development

```bash
npm install
```

Create `web/.env.local` (see `web/.env.local.example`) with your `DATABASE_URL`.
For `sync-market-caps`, also create `ingest/.env` with `DATABASE_URL` and
`FINNHUB_API_KEY`.

```bash
npm run dev               # Next.js site + API at http://localhost:3000
npm run ingest            # run the House PTR ingestion CLI once
npm run ingest-senate     # run the Senate PTR ingestion CLI once (needs Chrome installed)
npm run sync-members      # refresh member photos/party (House + Senate, cheap)
npm run sync-market-caps  # refresh company market caps (needs FINNHUB_API_KEY)
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
