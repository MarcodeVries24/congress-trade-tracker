import { google, type androidpublisher_v3 } from "googleapis";

/**
 * Talking to Google Play about a subscription.
 *
 * Play's notification is deliberately thin: it says "purchase token X changed"
 * and nothing else. The state has to be fetched, which means this is the one
 * provider where the webhook cannot be handled offline, and where a Play API
 * outage delays an entitlement rather than losing it.
 *
 * The service account key is a secret and lives in an environment variable as
 * JSON, the same way the Stripe key does. It is never read from a file on disk,
 * because on Vercel there is no disk to put it on.
 */
const PACKAGE_NAME = "com.congtrade.app";

/** Whether we can ask Play about a subscription. */
export function googleApiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

/**
 * Whether the Pub/Sub endpoint can be trusted to answer.
 *
 * Needs the shared token as well as the API key, because a push carries no
 * signature and the token is the only thing standing between the entitlement
 * table and anyone who finds the URL.
 */
export function googleNotificationsConfigured(): boolean {
  return googleApiConfigured() && Boolean(process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN);
}

let client: androidpublisher_v3.Androidpublisher | null = null;

function androidPublisher(): androidpublisher_v3.Androidpublisher {
  if (client) return client;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  // google.auth rather than a direct google-auth-library import: googleapis
  // bundles its own copy, and two copies produce two incompatible GoogleAuth
  // types that will not pass to the client it is meant for.
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw) as Record<string, string>,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  client = google.androidpublisher({ version: "v3", auth });
  return client;
}

export type GoogleSubscriptionState = {
  productId: string | null;
  /** Milliseconds since the epoch, as Play reports it. */
  expiryTimeMillis: number | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  /** The Clerk user id the app attached when it started the purchase. */
  clerkUserId: string | null;
  linkedPurchaseToken: string | null;
};

/**
 * Play's subscription states, mapped to the vocabulary already stored.
 *
 * 1 = active, 2 = cancelled but still paid for, 3 = in grace period,
 * 4 = on hold, 5 = paused, 6 = expired.
 */
function statusFor(state: number | null | undefined, expiryMillis: number | null): string {
  switch (state) {
    case 1:
      return "active";
    case 2:
      // Cancelled keeps access until the paid period runs out, which is what
      // grantsAccess already does with current_period_end.
      return expiryMillis && expiryMillis > Date.now() ? "canceled" : "canceled";
    case 3:
      return "past_due";
    case 4:
      return "past_due";
    case 5:
      return "paused";
    default:
      return "canceled";
  }
}

export async function fetchSubscriptionState(purchaseToken: string): Promise<GoogleSubscriptionState> {
  const res = await androidPublisher().purchases.subscriptionsv2.get({
    packageName: PACKAGE_NAME,
    token: purchaseToken,
  });
  const d = res.data;

  const line = d.lineItems?.[0];
  const expiry = line?.expiryTime ? Date.parse(line.expiryTime) : null;
  // Play's own numeric state lives on subscriptionState as a string enum in
  // v2; map it back to the number the switch above reads.
  const stateNumber = ({
    SUBSCRIPTION_STATE_ACTIVE: 1,
    SUBSCRIPTION_STATE_CANCELED: 2,
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 3,
    SUBSCRIPTION_STATE_ON_HOLD: 4,
    SUBSCRIPTION_STATE_PAUSED: 5,
    SUBSCRIPTION_STATE_EXPIRED: 6,
  } as Record<string, number>)[d.subscriptionState ?? ""] ?? 6;

  return {
    productId: line?.productId ?? null,
    expiryTimeMillis: Number.isFinite(expiry) ? expiry : null,
    status: statusFor(stateNumber, Number.isFinite(expiry) ? expiry : null),
    cancelAtPeriodEnd: stateNumber === 2,
    // obfuscatedExternalAccountId is what the app sets to the Clerk user id,
    // the same job appAccountToken does on Apple.
    clerkUserId: d.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    linkedPurchaseToken: d.linkedPurchaseToken ?? null,
  };
}
