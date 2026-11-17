import { useAuth } from '@clerk/clerk-expo';
import { getAvailablePurchases as ownedPurchases, isEligibleForIntroOfferIOS, useIAP } from 'expo-iap';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { API_BASE } from '@/lib/api';
import type { Purchases } from '@/lib/purchases-types';
import { PRODUCT_IDS, periodForProduct, type BillingPeriod, type StoreProduct, type Trial } from '@/lib/products';

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

type Subscription = ReturnType<typeof useIAP>['subscriptions'][number];
type StorePurchase = Parameters<NonNullable<Parameters<typeof useIAP>[0]>['onPurchaseSuccess'] & {}>[0];

/**
 * What the server is told about a purchase: iOS ties every renewal to the
 * original transaction; Play identifies a subscription by its purchase
 * token. Purchase is a union, so each is narrowed rather than reached for.
 */
function reportFor(purchase: StorePurchase): { originalTransactionId: string } | { purchaseToken: string } | null {
  if ('originalTransactionIdentifierIOS' in purchase) {
    return { originalTransactionId: purchase.originalTransactionIdentifierIOS ?? purchase.transactionId };
  }
  return purchase.purchaseToken ? { purchaseToken: purchase.purchaseToken } : null;
}

// "14 days", "1 month": a trial's length as the paywall says it. Weeks are
// counted in days, the way trials are usually advertised.
function lengthOf(unit: string, count: number): string | null {
  if (!(count > 0)) return null;
  if (unit === 'day' || unit === 'week') {
    const days = unit === 'week' ? count * 7 : count;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (unit === 'month' || unit === 'year') return `${count} ${unit}${count === 1 ? '' : 's'}`;
  return null;
}

// Play writes periods in ISO 8601: "P14D", "P2W", "P1M".
const ISO_UNIT: Record<string, string> = { D: 'day', W: 'week', M: 'month', Y: 'year' };
function lengthOfIso(period: string, cycles: number): string | null {
  const m = /^P(\d+)([DWMY])$/.exec(period);
  return m ? lengthOf(ISO_UNIT[m[2]], Number(m[1]) * Math.max(cycles, 1)) : null;
}

/**
 * The free trial the store offers on a subscription, if any. Play lists only
 * the offers this person is eligible for, so a free pricing phase there is a
 * trial they will get. Apple lists the introductory offer to everyone, and
 * eligibility is asked separately.
 */
function freeTrialOf(s: Subscription): Trial | null {
  for (const o of s.subscriptionOffers ?? []) {
    const free = o.pricingPhasesAndroid?.pricingPhaseList.find((ph) => Number(ph.priceAmountMicros) === 0);
    if (free) {
      const length = lengthOfIso(free.billingPeriod, free.billingCycleCount);
      if (length) return { length, offerToken: o.offerTokenAndroid ?? null };
    }
    if (o.type === 'introductory' && o.paymentMode === 'free-trial' && o.period) {
      const length = lengthOf(o.period.unit, o.period.value * (o.periodCount ?? 1));
      if (length) return { length, offerToken: o.offerTokenAndroid ?? null };
    }
  }
  if ('introductoryPricePaymentModeIOS' in s && s.introductoryPricePaymentModeIOS === 'free-trial') {
    const length = lengthOf(
      s.introductoryPriceSubscriptionPeriodIOS ?? '',
      Number(s.introductoryPriceNumberOfPeriodsIOS ?? 1)
    );
    if (length) return { length, offerToken: null };
  }
  return null;
}

export function usePurchases(onEntitled: () => void): Purchases {
  const { isSignedIn, userId, getToken } = useAuth();
  const [busy, setBusy] = useState<BillingPeriod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountToken = useRef<string | null>(null);
  // Whose token accountToken holds, so a sign-out and a sign-in as someone
  // else never reads as ready before their own token has arrived.
  const [tokenFor, setTokenFor] = useState<string | null>(null);
  const accountReady = Boolean(isSignedIn && userId && tokenFor === userId);
  // Whether Apple will still give this Apple Account an introductory offer in
  // the subscription group; null until asked, and no trial is shown until then.
  const [introEligibleIOS, setIntroEligibleIOS] = useState<boolean | null>(null);

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
      const payload = reportFor(purchase);
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

  const { connected, subscriptions, fetchProducts, requestPurchase, restorePurchases } = iap;

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
        if (!cancelled) {
          accountToken.current = data.token ?? null;
          setTokenFor(data.token ? (userId ?? null) : null);
        }
      } catch {
        // Left null, and buy() refuses rather than starting a purchase that
        // could not be attributed to anyone.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, getToken]);

  // Apple answers per subscription group, and all three plans share one.
  const groupIdIOS = subscriptions.find((s) => 'subscriptionGroupIdIOS' in s && s.subscriptionGroupIdIOS);
  const groupId = groupIdIOS && 'subscriptionGroupIdIOS' in groupIdIOS ? groupIdIOS.subscriptionGroupIdIOS : null;
  useEffect(() => {
    if (Platform.OS !== 'ios' || !groupId) return;
    let cancelled = false;
    isEligibleForIntroOfferIOS(groupId)
      .then((eligible) => !cancelled && setIntroEligibleIOS(eligible))
      .catch(() => !cancelled && setIntroEligibleIOS(false));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const products = useMemo<StoreProduct[]>(
    () =>
      subscriptions
        .map((s) => {
          const period = periodForProduct(s.id);
          if (!period) return null;
          const trial = Platform.OS === 'ios' && introEligibleIOS !== true ? null : freeTrialOf(s);
          return {
            id: s.id,
            period,
            displayPrice: s.displayPrice,
            price: s.price ?? null,
            currency: s.currency || null,
            trial,
          };
        })
        .filter((p): p is StoreProduct => p !== null),
    [subscriptions, introEligibleIOS]
  );

  const buy = useCallback(
    async (period: BillingPeriod) => {
      setError(null);
      const product = products.find((p) => p.period === period);
      if (!product) {
        setError('That plan is not available from the store right now.');
        return;
      }
      // The paywall sends anyone signed out to sign in first and comes back
      // here once this is set; reaching it unset means the fetch failed.
      if (!accountToken.current) {
        setError('Could not reach your account. Check your connection and try again.');
        return;
      }
      setBusy(period);
      try {
        // Play requires exactly one offer token, and the offer it names is
        // what is bought: the free-trial offer when there is one, otherwise the
        // base plan itself (the offer with a single, paid pricing phase). Apple
        // applies an introductory offer on its own, which is why this is built
        // per platform.
        const found = subscriptions.find((s) => s.id === product.id);
        const listed = Platform.OS === 'android' ? (found?.subscriptionOffers ?? []) : [];
        const basePlan =
          listed.find((o) => o.offerTokenAndroid && o.pricingPhasesAndroid?.pricingPhaseList.length === 1) ??
          listed.find((o) => o.offerTokenAndroid);
        const offerToken = product.trial?.offerToken ?? basePlan?.offerTokenAndroid ?? null;
        const offers = offerToken ? [{ sku: product.id, offerToken }] : [];
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

  /**
   * Required by Apple: someone reinstalling must get back what they paid for.
   *
   * What this Apple Account or Google account already owns is read first,
   * which needs no sign-in and is what nearly everyone restoring has. Only
   * when that finds nothing is the App Store asked to sync (it can ask for
   * the Apple Account password, and fails with "Unable to Complete Request"
   * often enough in TestFlight and the sandbox), and the owned purchases read
   * again. Each one found is reported to the server, which decides, exactly
   * as for a purchase made here: Pro, a subscription moving off a deleted
   * account, or a clear refusal.
   */
  const restore = useCallback(async () => {
    setError(null);
    const ours = (all: StorePurchase[]) => all.filter((p) => periodForProduct(p.productId) !== null);
    try {
      let owned = ours(await ownedPurchases({ onlyIncludeActiveItemsIOS: true }));
      if (owned.length === 0) {
        await restorePurchases().catch(() => {});
        owned = ours(await ownedPurchases({ onlyIncludeActiveItemsIOS: true }));
      }
      const payloads = owned.map(reportFor).filter((p): p is NonNullable<typeof p> => p !== null);
      if (payloads.length === 0) {
        setError(`No subscription found for this ${Platform.OS === 'android' ? 'Google account' : 'Apple Account'}.`);
        return;
      }
      // One at a time: the first the server accepts is enough, and the rest
      // are the same subscription's other transactions.
      for (const payload of payloads) await report(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore purchases.');
    }
  }, [restorePurchases, report]);

  return { available: true, ready: connected, products, busy, error, accountReady, buy, restore };
}
