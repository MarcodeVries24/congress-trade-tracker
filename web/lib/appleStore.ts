import { createPrivateKey } from "node:crypto";
import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

/**
 * Verifying what Apple sends us.
 *
 * App Store Server Notifications arrive as a signed JWS whose header carries
 * the certificate chain that signed it. Decoding the payload without checking
 * that chain would mean trusting anything that can POST to the endpoint, which
 * for a notification that grants paid access is the whole ballgame: the
 * endpoint is public and its URL is not a secret.
 *
 * Apple's own library does the verification, including the chain back to their
 * root CA. The root certificates have to be supplied by us, which is why they
 * are an environment variable rather than something fetched at boot: a verifier
 * that downloads its own trust anchors over the network can be talked out of
 * them.
 */
const BUNDLE_ID = "com.congtrade.app";

/**
 * The app's Apple ID, the number in its App Store Connect address. Apple's
 * library will not verify a production transaction without it (it is part of
 * what is checked), so without it every real purchase would fail to verify
 * while TestFlight and App Review, both sandbox, went through.
 */
const APP_APPLE_ID = 6817481190;

/**
 * The environments to try, in order.
 *
 * Production first, then sandbox, as Apple advises: App Review buys with a
 * sandbox account inside the production build, and TestFlight purchases are
 * sandbox too. A server that only knew production would never grant the
 * reviewer Pro, and the app would be rejected for a paywall that "does not
 * work". Both environments are signed by Apple's own chain, so trying the
 * second is no weaker a check than the first. APPLE_ENVIRONMENT=sandbox keeps
 * a development deployment to sandbox alone.
 */
const ENVIRONMENTS: Environment[] =
  process.env.APPLE_ENVIRONMENT === "sandbox"
    ? [Environment.SANDBOX]
    : [Environment.PRODUCTION, Environment.SANDBOX];

/** Apple's root CAs, base64 DER, newline or comma separated. */
function rootCertificates(): Buffer[] {
  const raw = process.env.APPLE_ROOT_CERTS ?? "";
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Buffer.from(s, "base64"));
}

/**
 * Whether Apple's notifications can be verified.
 *
 * Root certificates only. Verifying a signature is done against Apple's trust
 * anchors and never calls Apple, so it is deliberately independent of the API
 * credentials below: an absent key must not silently disable the endpoint that
 * grants people the access they paid for.
 */
export function appleNotificationsConfigured(): boolean {
  return rootCertificates().length > 0;
}

/**
 * Whether we can ask Apple about a subscription.
 *
 * A separate question from the one above. This is what restoring a purchase
 * and confirming a just-completed one need, because both happen before any
 * notification arrives.
 */
export function appleApiConfigured(): boolean {
  return Boolean(process.env.APPLE_ISSUER_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

const verifiers = new Map<Environment, SignedDataVerifier>();

function signedDataVerifier(environment: Environment): SignedDataVerifier {
  const existing = verifiers.get(environment);
  if (existing) return existing;
  const certs = rootCertificates();
  if (certs.length === 0) throw new Error("APPLE_ROOT_CERTS is not set");
  // Sandbox and production are signed by the same chain but carry their
  // environment inside; the library checks it against this one, which is why
  // there is one verifier per environment.
  const verifier = new SignedDataVerifier(
    certs,
    true,
    environment,
    BUNDLE_ID,
    environment === Environment.PRODUCTION ? APP_APPLE_ID : undefined
  );
  verifiers.set(environment, verifier);
  return verifier;
}

/**
 * What went wrong, in words. Apple's library throws errors whose message is
 * empty and puts the cause in fields of its own (an HTTP status and Apple's
 * error code, or a verification status), so the plain message says nothing.
 */
export function describeAppleError(err: unknown): string {
  if (err instanceof APIException) {
    const code = typeof err.apiError === "number" ? (APIError[err.apiError] ?? err.apiError) : null;
    const said = [`App Store API ${err.httpStatusCode}`, code, err.errorMessage].filter(Boolean).join(", ");
    // Apple turned the credentials down: say what we hold, without saying it.
    return err.httpStatusCode === 401 ? `${said} (${credentialsCheck()})` : said;
  }
  if (err instanceof VerificationException) {
    const cause = err.cause instanceof Error && err.cause.message ? ` (${err.cause.message})` : "";
    return `verification failed: ${VerificationStatus[err.status] ?? err.status}${cause}`;
  }
  if (err instanceof Error) return err.message || err.name;
  return String(err);
}

/**
 * What the App Store Server API credentials look like, for a 401: whether
 * each is the right shape, never the values. The key id is shown by its last
 * four characters, which is how App Store Connect lists keys anyway.
 */
function credentialsCheck(): string {
  const keyId = process.env.APPLE_KEY_ID?.trim() ?? "";
  const issuer = process.env.APPLE_ISSUER_ID?.trim() ?? "";
  const pem = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() ?? "";
  let key = "unreadable";
  try {
    const k = createPrivateKey(pem);
    const curve = k.asymmetricKeyDetails?.namedCurve;
    key = k.asymmetricKeyType === "ec" && curve === "prime256v1" ? "EC P-256, as Apple issues" : `${k.asymmetricKeyType} ${curve ?? ""}`.trim();
  } catch {
    key = pem.includes("BEGIN PRIVATE KEY") ? "has the PEM lines but does not parse" : "no -----BEGIN PRIVATE KEY----- line";
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuer);
  return [
    `key id …${keyId.slice(-4)} (${keyId.length} characters${keyId.length === 10 ? "" : ", expected 10"})`,
    `issuer ${uuid ? "is a UUID" : "is not a UUID"}`,
    `private key ${key}`,
    `bundle ${BUNDLE_ID}`,
  ].join("; ");
}

/** The first environment's answer that verifies; every environment's failure if none does. */
async function inAnyEnvironment<T>(verify: (v: SignedDataVerifier) => Promise<T>): Promise<T> {
  const failures: string[] = [];
  for (const environment of ENVIRONMENTS) {
    try {
      return await verify(signedDataVerifier(environment));
    } catch (err) {
      // Environment's values are its names ("Production", "Sandbox").
      failures.push(`${environment}: ${describeAppleError(err)}`);
    }
  }
  throw new Error(failures.join("; "));
}

/** The decoded notification, or a throw if it is not genuinely from Apple. */
export async function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  return inAnyEnvironment((v) => v.verifyAndDecodeNotification(signedPayload));
}

/** The decoded transaction inside a notification, verified the same way. */
export async function verifyTransaction(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
  return inAnyEnvironment((v) => v.verifyAndDecodeTransaction(signedTransaction));
}

/**
 * Apple's notification types, mapped to the status vocabulary we already store.
 *
 * Deliberately not exhaustive. Anything not listed leaves the row alone rather
 * than guessing, because the alternative — treating an unrecognised type as a
 * cancellation — locks out someone who has paid, and that is the one mistake
 * worth designing against.
 */
export const APPLE_STATUS: Record<string, string> = {
  SUBSCRIBED: "active",
  DID_RENEW: "active",
  OFFER_REDEEMED: "active",
  DID_CHANGE_RENEWAL_STATUS: "active",
  DID_CHANGE_RENEWAL_PREF: "active",
  DID_FAIL_TO_RENEW: "past_due",
  GRACE_PERIOD_EXPIRED: "past_due",
  EXPIRED: "canceled",
  REFUND: "canceled",
  REVOKE: "canceled",
};

export function statusForNotification(
  type: string,
  subtype: string | undefined,
  autoRenewStatus?: number | null
): string | null {
  // A renewal status change says so in its subtype: AUTO_RENEW_DISABLED is
  // someone cancelling, which keeps access to the end of the paid period and
  // is exactly what the "canceled" status already means here.
  if (type === "DID_CHANGE_RENEWAL_STATUS" && subtype === "AUTO_RENEW_DISABLED") return "canceled";
  const status = APPLE_STATUS[type] ?? null;
  // The type alone does not say whether the subscription will renew. A plan
  // change (DID_CHANGE_RENEWAL_PREF) arrives whether renewal is on or off, and
  // used to be stored as "active", turning a cancelled subscription back into
  // one that renews. The renewal info that comes with the notification does
  // say, so it decides: paid for but not renewing is "canceled", as the
  // AUTO_RENEW_DISABLED branch above and subscriptionStatusFor store it.
  if (status === "active" && autoRenewStatus === 0) return "canceled";
  return status;
}

/** The renewal info inside a notification or a status answer, verified like the transaction. */
export async function verifyRenewalInfo(signedRenewalInfo: string): Promise<JWSRenewalInfoDecodedPayload> {
  return inAnyEnvironment((v) => v.verifyAndDecodeRenewalInfo(signedRenewalInfo));
}

const apiClients = new Map<Environment, AppStoreServerAPIClient>();

/**
 * Apple's server API, for asking rather than being told.
 *
 * The private key is a .p8 whose newlines do not survive an environment
 * variable intact, so an escaped form is accepted too. Getting that wrong
 * produces a signing error several layers down, which is not a fun thing to
 * debug at the point where someone's purchase is not going through.
 */
export function appStoreApi(environment: Environment): AppStoreServerAPIClient {
  const existing = apiClients.get(environment);
  if (existing) return existing;
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const key = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!issuerId || !keyId || !key) throw new Error("App Store Server API credentials are not set");
  const client = new AppStoreServerAPIClient(key, keyId, issuerId, BUNDLE_ID, environment);
  apiClients.set(environment, client);
  return client;
}

/**
 * The current state of a subscription, from its original transaction id.
 *
 * Used when the app reports a purchase: waiting for Apple's notification would
 * leave someone staring at a paywall they have just paid to get past, which is
 * the single worst moment to be slow.
 */
export async function subscriptionStatusFor(originalTransactionId: string): Promise<{
  status: string;
  transaction: JWSTransactionDecodedPayload;
} | null> {
  // Production first; a sandbox purchase is "not found" there (404), and is
  // then asked of the sandbox. Before the app's first release Apple's
  // production API answers 401 to every call, credentials or not, so a 401
  // there is passed on to the sandbox too: TestFlight and App Review, the
  // only purchases there are then, are all sandbox. A 401 from the sandbox
  // as well is a real credentials problem, and both answers are reported.
  let statuses = null;
  const failures: string[] = [];
  for (const environment of ENVIRONMENTS) {
    try {
      statuses = await appStoreApi(environment).getAllSubscriptionStatuses(originalTransactionId);
      break;
    } catch (err) {
      const elsewhere = err instanceof APIException && (err.httpStatusCode === 404 || err.httpStatusCode === 401);
      if (!elsewhere) throw err;
      failures.push(`${environment}: ${describeAppleError(err)}`);
      if (environment === ENVIRONMENTS[ENVIRONMENTS.length - 1]) throw new Error(failures.join("; "));
    }
  }
  for (const group of statuses?.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      if (!item.signedTransactionInfo) continue;
      const transaction = await verifyTransaction(item.signedTransactionInfo);
      // Apple's numeric status: 1 active, 2 expired, 3 in billing retry,
      // 4 in billing grace period, 5 revoked.
      let status =
        item.status === 1 ? "active" : item.status === 3 || item.status === 4 ? "past_due" : "canceled";
      // Still active but with auto-renew switched off is someone who has
      // cancelled: Pro to the end of the period, then nothing. Stored as
      // "canceled", which is what the webhook's AUTO_RENEW_DISABLED stores,
      // so a restore or a re-check does not quietly turn it back into a
      // subscription that renews.
      if (status === "active" && item.signedRenewalInfo) {
        const renewal = await verifyRenewalInfo(item.signedRenewalInfo).catch(() => null);
        if (renewal?.autoRenewStatus === 0) status = "canceled";
      }
      return { status, transaction };
    }
  }
  return null;
}