import Constants, { ExecutionEnvironment } from 'expo-constants';

import type { Purchases } from '@/lib/purchases-types';
import { noStore } from '@/lib/use-purchases.none';

/**
 * The store on a real build, and no store in Expo Go.
 *
 * Expo Go is a fixed app that carries only Expo's own native modules, and
 * expo-iap is not one of them: importing it there throws at launch, before
 * any screen draws. So the store implementation is required only outside Expo
 * Go, which lets the whole app be tried on a phone by scanning a QR code,
 * everything but buying.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function usePurchasesInExpoGo(_onEntitled: () => void): Purchases {
  return noStore('Not available in Expo Go');
}

export const usePurchases: (onEntitled: () => void) => Purchases = inExpoGo
  ? usePurchasesInExpoGo
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/lib/use-purchases.store') as typeof import('@/lib/use-purchases.store')).usePurchases;
