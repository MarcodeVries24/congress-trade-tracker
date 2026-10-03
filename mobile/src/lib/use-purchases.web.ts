import type { Purchases } from '@/lib/purchases-types';
import { noStore } from '@/lib/use-purchases.none';

/**
 * The web build has no store. expo-iap is a native module, so importing it here
 * would break the Expo web target; Metro picks this file for web automatically.
 */
export function usePurchases(_onEntitled: () => void): Purchases {
  return noStore('Not available on the web preview');
}
