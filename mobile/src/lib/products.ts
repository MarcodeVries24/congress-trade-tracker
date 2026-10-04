import { STORE_PRODUCT_IDS, periodForStoreProduct, type StoreBillingPeriod } from '@congtrade/shared/storeProducts';

// The identifiers live in @congtrade/shared, alongside the webhooks that read
// them back off a receipt. Re-exported under the app's own names so screens do
// not each reach into the package for the same three things.
export type BillingPeriod = StoreBillingPeriod;
export const PRODUCT_IDS = STORE_PRODUCT_IDS;
export const periodForProduct = periodForStoreProduct;

/** A product as the paywall needs it: the store's own price, never ours. */
export type StoreProduct = {
  id: string;
  period: BillingPeriod;
  displayPrice: string;
  /** The same price as a number, in `currency`, for working out a per-week figure. */
  price: number | null;
  currency: string | null;
  /**
   * The free trial the store will give this person on this plan, or null.
   * Read from the store, never assumed: Apple and Play only give a trial to
   * someone who has not had one in the subscription before, and promising one
   * they will not get is both misleading and a rejection.
   */
  trial: Trial | null;
};

export type Trial = {
  /** How long, ready to show: "14 days", "1 month". */
  length: string;
  /** Play's token for the offer that carries the trial. Null on iOS, where the trial applies on its own. */
  offerToken: string | null;
};
