import { useAuth } from '@clerk/clerk-expo';
import { useIAP } from 'expo-iap';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { API_BASE } from '@/lib/api';
import type { Purchases } from '@/lib/purchases-types';
import { PRODUCT_IDS, periodForProduct, type BillingPeriod, type StoreProduct } from '@/lib/products';

/**
 * Buying CongTrade Pro through the App Store or Play.
 *
 * The store is the source of truth for the price, always. Apple's matrix turns
 * €4.99 into $4.99 in the US, $5.99 in Albania and A$7.99 in Australia, and it
 * is the figure the person is actually charged. Showing our own number next to
 * a different one at the confirmation sheet is the kind of thing that gets an
 * app rejected, and deserves to.
 *
 * The server stays the source of truth for entitlement. A purchase here is
 * reported to it and the answer comes back from Apple, never from this device.
 */

export function usePurchases(onEntitled: () => void): Purchases {
  const { isSignedIn, getToken } = useAuth();
  const [busy, setBusy] = useState<BillingPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountToken = useRef<string | null>(null);

  /**
   * Tells the server about a purchase and lets it decide.
   *
   * The device sends an identifier, never a claim: the server asks Apple what
   * that transaction is. A client that lies gets nothing back.
   */
  const report = useCallback(
    async (body: { originalTransactionId: string } | { purchaseToken: string }) => {
      const session = await getToken();
      // Each store answers about its own purchases, so the endpoint follows the
      // platform rather than the shape of what came back.
      const path = 'purchaseToken' in body ? '/api/store/google' : '/api/store/apple';
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(session ? { authorization: `Bearer ${session}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { entitled?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Could not confirm the purchase (${res.status}).`);
      if (data.entitled) onEntitled();
    },
    [getToken, onEntitled]
  );

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      // iOS ties every renewal to the original transaction; Play identifies a
      // subscription by its purchase token. Purchase is a union, so each is
      // narrowed rather than reached for.
      const payload =
        'originalTransactionIdentifierIOS' in purchase
          ? { originalTransactionId: purchase.originalTransactionIdentifierIOS ?? purchase.transactionId }
          : purchase.purchaseToken
            ? { purchaseToken: purchase.purchaseToken }
            : null;
      void (async () => {
        try {
          if (payload) await report(payload);
          // Only after the server has accepted it. Finishing first would tell
          // the store we are done with a purchase we might have failed to
          // record, and the store would never mention it again.
          await iap.finishTransaction({ purchase, isConsumable: false });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not confirm the purchase.');
        } finally {
          setBusy(null);
        }
      })();
    },
    onPurchaseError: (err) => {
      // A cancelled purchase is not a failure and should not shout about it.
      const cancelled = /cancel/i.test(err?.code ?? '') || /cancel/i.test(err?.message ?? '');
      setError(cancelled ? null : (err?.message ?? 'The purchase did not go through.'));
      setBusy(null);
    },
    onError: (err) => setError(err.message),
  });

  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases, getAvailablePurchases } = iap;

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: [...PRODUCT_IDS], type: 'subs' });
  }, [connected, fetchProducts]);

  // Fetched once per sign-in and carried into every purchase. It is a UUID the
  // server issued for this account, because StoreKit will not carry anything
  // else and drops a non-UUID without saying so.
  useEffect(() => {
    if (!isSignedIn) {
      accountToken.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const session = await getToken();
        const res = await fetch(`${API_BASE}/api/store/account-token`, {
          headers: session ? { authorization: `Bearer ${session}` } : {},
        });
        const data = (await res.json()) as { token?: string };
        if (!cancelled) accountToken.current = data.token ?? null;
      } catch {
        // Left null, and buy() refuses rather than starting a purchase that
        // could not be attributed to anyone.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  const products = useMemo<StoreProduct[]>(
    () =>
      subscriptions
        .map((s) => {
          const period = periodForProduct(s.id);
          return period
            ? { id: s.id, period, displayPrice: s.displayPrice, price: s.price ?? null, currency: s.currency || null }
            : null;
        })
        .filter((p): p is StoreProduct => p !== null),
    [subscriptions]
  );

  const buy = useCallback(
    async (period: BillingPeriod) => {
      setError(null);
      const product = products.find((p) => p.period === period);
      if (!product) {
        setError('That plan is not available from the store right now.');
        return;
      }
      if (!accountToken.current) {
        setError('Sign in before subscribing, so the purchase reaches your account.');
        return;
      }
      setBusy(period);
      try {
        // Play requires the offer token for the base plan being bought; a
        // subscription purchase without one is rejected outright. Apple has no
        // equivalent, which is why this is built per platform.
        const found = subscriptions.find((s) => s.id === product.id);
        const offers =
          Platform.OS === 'android' && found && 'subscriptionOffers' in found
            ? (found.subscriptionOffers ?? [])
                .map((o) => o.offerTokenAndroid)
                .filter((token): token is string => Boolean(token))
                .map((offerToken) => ({ sku: product.id, offerToken }))
            : [];
        await requestPurchase({
          type: 'subs',
          request: {
            apple: { sku: product.id, appAccountToken: accountToken.current },
            google: {
              skus: [product.id],
              obfuscatedAccountId: accountToken.current,
              ...(offers.length ? { subscriptionOffers: offers } : {}),
            },
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The purchase did not start.');
        setBusy(null);
      }
    },
    [products, requestPurchase, subscriptions]
  );

  /** Required by Apple: someone reinstalling must get back what they paid for. */
  const restore = useCallback(async () => {
    setError(null);
    try {
      await restorePurchases();
      await getAvailablePurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore purchases.');
    }
  }, [restorePurchases, getAvailablePurchases]);

  return { available: true, ready: connected, products, busy, error, buy, restore };
}
