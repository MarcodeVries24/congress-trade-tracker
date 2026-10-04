import type { BillingPeriod } from '@/lib/products';
import type { Purchases } from '@/lib/purchases-types';

/**
 * Where there is no store to buy from: the web preview, and Expo Go, which
 * does not include the in-app purchase module. The paywall branches on
 * `available: false` and shows the plans with a button that says why it
 * cannot charge.
 */
export function noStore(reason: string): Purchases {
  return {
    available: false,
    ready: false,
    products: [],
    busy: null as BillingPeriod | null,
    error: null,
    accountReady: false,
    buy: async () => {},
    restore: async () => {},
    unavailableReason: reason,
  };
}
