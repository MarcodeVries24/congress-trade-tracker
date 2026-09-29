import {
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

export function appleConfigured(): boolean {
  return rootCertificates().length > 0 && Boolean(process.env.APPLE_ISSUER_ID);
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
