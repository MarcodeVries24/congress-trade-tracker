import type { BillingPeriod } from '@/lib/products';
import type { Purchases } from '@/lib/use-purchases';

/**
 * The web build has no store.
 *
 * expo-iap is a native module, so importing it here would break the Expo web
 * target that the whole project is developed against. Metro picks this file for
 * web automatically, the same way the template does for use-color-scheme.
 *
 * `available: false` is what the paywall branches on, so the web preview shows
 * the plans with our own prices and a button that says why it cannot charge.
 */
export function usePurchases(_onEntitled: () => void): Purchases {
  return {
    available: false,
    ready: false,
    products: [],
    busy: null as BillingPeriod | null,
    error: null,
    buy: async () => {},
    restore: async () => {},
  };
}
