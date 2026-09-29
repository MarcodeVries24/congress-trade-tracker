# CongTrade mobile

Expo (React Native) app for iOS and Android. Reads the same Next.js API the
website does, shares entitlement and name resolution through
`@congtrade/shared`, and sells CongTrade Pro through the App Store and Play.

## Running it

Two servers, because the Expo web target and the API are different origins:

```bash
npm run dev --workspace web      # the API, on :3000
npm --prefix mobile run web      # the app, on :8081
```

`mobile/.env.local` points at both. Copy it from `.env.example`.

**Expo web is a development convenience, not a shipping target.** It has caught
several real bugs, but a green web run proves nothing about native: SF Symbols,
native tabs, SecureStore, the OAuth redirect and every part of in-app purchase
behave differently or not at all there. `use-purchases.web.ts` exists precisely
because `expo-iap` has no web implementation.

Two constraints are web-only and neither affects a device build:

- The API sends CORS headers for localhost **in development only**, which is
  what lets :8081 reach :3000. A native build is not origin-checked.
- Clerk's production key is locked to `congtrade.com` and is rejected on
  localhost, so local runs use the development instance. Native builds are not
  origin-checked either, which is why the EAS profiles carry the live key.

## Builds

Nothing about in-app purchase runs in Expo Go: it is a native module, so it
needs a development build.

```bash
npx eas-cli@latest login
npx eas-cli@latest init            # once, writes extra.eas.projectId
npx eas-cli@latest build --profile development --platform ios
```

Install the result on a device, then `npm --prefix mobile start` and open it
from the dev client.

All three profiles point at the production API with the live Clerk key. A
device cannot reach the laptop's localhost, and a token from the development
Clerk instance would be rejected by the production API, so pointing a device
build at anything else does not work.

## Testing a purchase

1. App Store Connect → Users and Access → Sandbox → create a tester
2. On the device: Settings → App Store → Sandbox Account → sign in as it
3. Run the development build and complete a purchase from the paywall

Sandbox renewals are accelerated: a one-week subscription renews every three
minutes, which is how a year of renewal notifications gets tested in an hour.

The first thing to check if the paywall shows no prices is App Store Connect,
not the code. A product with no price, no localization or no availability is
returned by no store.
