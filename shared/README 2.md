# @congtrade/shared

The logic that must give the same answer in three places: the website, the
alert sender in `ingest/`, and the mobile app.

Everything here is **dependency-free on purpose**. No database client, no
`next/*`, no React, no `fetch`. That is what lets the same file be imported by
a Next.js server component, a Node script and a React Native bundle. Anything
that needs a request, a connection or a framework belongs in the workspace that
has one, not here.

The split is not arbitrary. `currency.ts` holds the country-to-currency rule but
not `currencyForRequest`, because reading a header is Next's job. `plans.ts`
holds the prices but not the Stripe price ids, because those are environment.
