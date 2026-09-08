# Congress Trade Tracker

A searchable database of U.S. House stock trades, built directly from the
government's own disclosure filings — no third-party API in between, and
fully cloud-hosted (works even when your own machine is off).

## How it works

Members of Congress must disclose stock trades within 45 days via a
**Periodic Transaction Report (PTR)**, filed as a PDF with the Office of the
Clerk. This project:

1. Downloads the Clerk's public yearly index (`disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip`),
   which lists every filing and its `DocID`.
2. Downloads each PTR PDF (`.../ptr-pdfs/{year}/{DocID}.pdf`) and extracts the
   transaction table (asset, ticker, buy/sell, dates, amount range) with a
   regex-based parser tuned to the Clerk's PDF layout.
3. Stores everything in a Postgres database (hosted on [Neon](https://neon.tech)).
4. A Next.js site (hosted on [Vercel](https://vercel.com)) serves the search UI
   and the REST API (as Next.js API routes) straight off that database.
5. A scheduled GitHub Actions workflow re-runs the ingest every 4 hours, so
   the dataset stays current with nothing needing to run on your own machine.
6. Separately, each House seat's official photo and party are synced from the
   public [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
   dataset into a `members_reference` table, joined by `state_district` — no
   name-matching involved, since that field is already shared with filings.
   Photos are hotlinked from `congress.gov`'s own CDN.

**Senate coverage is intentionally not implemented.** `efdsearch.senate.gov`
blocks plain HTTP requests at the network edge (Akamai), even with a real
browser user-agent — the same wall that ended the original Senate Stock
Watcher project. Getting past it needs a full headless-browser scraper
(Playwright), which is a separate, heavier piece of work.

### Known data-quality limits

- A small number of filings (older, paper-filed PTRs, e.g. `DocID`s under
  ~10,000,000) are scanned images with no extractable text. These are stored
  with `parse_status = 'empty'` rather than silently dropped — OCR would be
  needed to recover them.
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
   runs `npm run sync-members` then `npm run ingest` every 4 hours
   (`0 */4 * * *`), and can also be triggered manually from the Actions tab
   (**Run workflow**).

### 3. Website + API — Vercel

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

```bash
npm run dev            # Next.js site + API at http://localhost:3000
npm run ingest         # run the PTR ingestion CLI once
npm run sync-members   # refresh member photos/party (~440 rows, cheap)
```

Ingest options:
- `--year=YYYY` (defaults to current year)
- `--limit=N` — only process the first N not-yet-ingested filings (useful for testing)
- `--force` — re-parse and overwrite filings already in the database

Downloaded ZIPs/PDFs are cached under `ingest/data/` between runs (a 250ms
delay is added between PDF downloads, out of politeness to the Clerk's
server). Already-ingested filings are skipped automatically. GitHub Actions
runners are ephemeral, so that file cache doesn't carry over between
scheduled runs there — only the already-ingested check (against the
database) does, which is what actually matters.

## Possible next steps

- Senate coverage via a Playwright-based scraper of `efdsearch.senate.gov`
- OCR fallback for scanned/paper PTRs
- Price-performance metrics (fetch a market price at transaction time vs. now)
