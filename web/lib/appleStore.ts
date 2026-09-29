import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
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

let verifier: SignedDataVerifier | null = null;

function signedDataVerifier(): SignedDataVerifier {
  if (verifier) return verifier;
  const certs = rootCertificates();
  if (certs.length === 0) throw new Error("APPLE_ROOT_CERTS is not set");
  // Sandbox and production notifications are signed by the same chain but
  // carry different environments; the library checks the payload's own
  // environment against this one, so the flag follows the deployment.
  const environment =
    process.env.APPLE_ENVIRONMENT === "sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
  verifier = new SignedDataVerifier(certs, true, environment, BUNDLE_ID);
  return verifier;
}

/** The decoded notification, or a throw if it is not genuinely from Apple. */
export async function verifyNotification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload> {
  return signedDataVerifier().verifyAndDecodeNotification(signedPayload);
}

/** The decoded transaction inside a notification, verified the same way. */
export async function verifyTransaction(signedTransaction: string): Promise<JWSTransactionDecodedPayload> {
  return signedDataVerifier().verifyAndDecodeTransaction(signedTransaction);
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

export function statusForNotification(type: string, subtype: string | undefined): string | null {
  // A renewal status change says so in its subtype: AUTO_RENEW_DISABLED is
  // someone cancelling, which keeps access to the end of the paid period and
  // is exactly what the "canceled" status already means here.
  if (type === "DID_CHANGE_RENEWAL_STATUS" && subtype === "AUTO_RENEW_DISABLED") return "canceled";
  return APPLE_STATUS[type] ?? null;
}

let apiClient: AppStoreServerAPIClient | null = null;

/**
 * Apple's server API, for asking rather than being told.
 *
 * The private key is a .p8 whose newlines do not survive an environment
 * variable intact, so an escaped form is accepted too. Getting that wrong
 * produces a signing error several layers down, which is not a fun thing to
 * debug at the point where someone's purchase is not going through.
 */
export function appStoreApi(): AppStoreServerAPIClient {
  if (apiClient) return apiClient;
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const key = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!issuerId || !keyId || !key) throw new Error("App Store Server API credentials are not set");
  const environment =
    process.env.APPLE_ENVIRONMENT === "sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
  apiClient = new AppStoreServerAPIClient(key, keyId, issuerId, BUNDLE_ID, environment);
  return apiClient;
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
  const statuses = await appStoreApi().getAllSubscriptionStatuses(originalTransactionId);
  for (const group of statuses.data ?? []) {
    for (const item of group.lastTransactions ?? []) {
      if (!item.signedTransactionInfo) continue;
      const transaction = await verifyTransaction(item.signedTransactionInfo);
      // Apple's numeric status: 1 active, 2 expired, 3 in billing retry,
      // 4 in billing grace period, 5 revoked.
      const status =
        item.status === 1 ? "active" : item.status === 3 || item.status === 4 ? "past_due" : "canceled";
      return { status, transaction };
    }
  }
  return null;
}