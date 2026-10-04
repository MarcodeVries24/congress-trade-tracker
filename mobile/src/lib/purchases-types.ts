import type { BillingPeriod, StoreProduct } from '@/lib/products';

/**
 * Buying CongTrade Pro through the App Store or Play.
 *
 * The store is the source of truth for the price, always: Apple's matrix turns
 * €4.99 into $4.99 in the US and A$7.99 in Australia, and that is the figure
 * the person is charged. The server stays the source of truth for entitlement.
 */
export type Purchases = {
  /** False on a platform with no store, which is how the web preview behaves. */
  available: boolean;
  ready: boolean;
  products: StoreProduct[];
  busy: BillingPeriod | null;
  error: string | null;
  /**
   * Signed in and the account's purchase token fetched: a purchase now can be
   * credited to the account. The paywall waits for this after sending someone
   * to sign in, then carries on with the plan they picked.
   */
  accountReady: boolean;
  buy: (period: BillingPeriod) => Promise<void>;
  restore: () => Promise<void>;
  /** Why there is no store here, for the paywall's button. Absent when there is one. */
  unavailableReason?: string;
};
