import { subscriptionElsewhereMessage } from '@congtrade/shared/storeProducts';
import { useAuth } from '@clerk/clerk-expo';
import { getAvailablePurchases as ownedPurchases, isEligibleForIntroOfferIOS, useIAP } from 'expo-iap';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { API_BASE } from '@/lib/api';
import type { Purchases } from '@/lib/purchases-types';
import { mayPass, wasCancelled } from '@/lib/purchase-errors';
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

/**
 * The server turning a store subscription down because it belongs to another
 * CongTrade account. Its own class so a purchase can be stopped before Apple's
 * sheet opens when this is the answer, rather than after the person has paid.
 */
class OtherAccountError extends Error {}

/** "20 Nov 2026", in the phone's own time zone, as the Account screen writes "Pro until". */
function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Before a purchase Play refused for no reason of its own is tried once more. */
const RETRY_AFTER_MS = 700;

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

/** The purchases that are CongTrade Pro, out of everything this store account owns. */
function ourPurchases(all: StorePurchase[]): StorePurchase[] {
  return all.filter((p) => periodForProduct(p.productId) !== null);
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
      const data = (await res.json().catch(() => ({}))) as {
        entitled?: boolean;
        error?: string;
        reason?: string;
        until?: string | null;
        renews?: boolean;
      };
      if (data.reason === 'other-account') {
        // Worded here when the date came along, so it is the phone's date
        // rather than the server's UTC one.
        throw new OtherAccountError(
          data.until
            ? subscriptionElsewhereMessage('apple', dayOf(data.until), data.renews !== false)
            : (data.error ?? subscriptionElsewhereMessage(Platform.OS === 'ios' ? 'apple' : 'google', null, true))
        );
      }
      if (!res.ok) throw new Error(data.error ?? `Could not confirm the purchase (${res.status}).`);
      return data.entitled === true;
    },
    [getToken]
  );

  // The purchase under way. Play can refuse the first one after the plans open
  // ("something went wrong on our end", or the product not being available),
  // from what it had prepared, and take the very same one a moment later, so
  // an error of that kind gets one more try by itself.
  // `id` tells the tries apart, as one failure can be reported twice (as an
  // event and as the request's rejection); `settled` is the last one dealt with.
  const run = useRef<{ id: number; settled: number; again: (() => Promise<void>) | null }>({
    id: 0,
    settled: -1,
    again: null,
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const failed = useCallback((err: unknown, id: number) => {
    if (run.current.settled === id) return;
    run.current.settled = id;
    const again = run.current.again;
    run.current.again = null;
    const { code, message } = (err ?? {}) as { code?: string; message?: string };
    // A cancelled purchase is not a failure and should not shout about it.
    if (wasCancelled({ code, message })) setError(null);
    else if (Platform.OS === 'android' && mayPass({ code, message })) {
      if (again) {
        // A moment for Play's sheet to close, and for the other report of this
        // same failure to arrive before the next try has an id of its own.
        setTimeout(() => {
          if (mounted.current) void again();
        }, RETRY_AFTER_MS);
        return;
      }
      setError("Google Play couldn't start the purchase. Please try again in a moment.");
    } else setError(message || 'The purchase did not go through.');
    setBusy(null);
  }, []);

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      run.current.again = null;
      const payload = reportFor(purchase);
      void (async () => {
        try {
          const entitled = payload ? await report(payload) : false;
          // Only after the server has accepted it. Finishing first would tell
          // the store we are done with a purchase we might have failed to
          // record, and the store would never mention it again.
          await iap.finishTransaction({ purchase, isConsumable: false });
          // And Pro only after that: it closes the plans screen, which ends
          // the billing connection, and on Android finishing is what
          // acknowledges the purchase. Acknowledged after the screen had gone
          // it never was, and Play refunds a purchase nobody acknowledges.
          // (The server acknowledges too; this is the quicker of the two.)
          if (entitled) onEntitled();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not confirm the purchase.');
        } finally {
          setBusy(null);
        }
      })();
    },
    onPurchaseError: (err) => failed(err, run.current.id),
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
      const token = accountToken.current;
      if (!token) {
        setError('Could not reach your account. Check your connection and try again.');
        return;
      }
      setBusy(period);
      const attempt = async () => {
        // Someone else signed in before the second try: not theirs to finish.
        if (accountToken.current !== token) {
          setBusy(null);
          return;
        }
        const id = ++run.current.id;
        // Apple keeps one subscription per group per Apple Account. While that
        // Apple Account has one, buying another plan only switches it, and it
        // stays with the CongTrade account it was bought on: the person would
        // pay and get nothing on this one. So what it already owns is asked
        // about first, before Apple's sheet opens. Theirs is simply Pro again;
        // another account's is said plainly, with until when it runs. Play sells
        // the plans separately and refuses only the very one its account owns,
        // with an error that does not say why, so there only that one is asked
        // about.
        try {
          const all = ourPurchases(await ownedPurchases({ onlyIncludeActiveItemsIOS: true }));
          const owned = Platform.OS === 'ios' ? all : all.filter((p) => p.productId === product.id);
          for (const payload of owned.map(reportFor)) {
            if (payload && (await report(payload))) {
              run.current.again = null;
              setBusy(null);
              onEntitled();
              return;
            }
          }
        } catch (err) {
          if (err instanceof OtherAccountError) {
            run.current.again = null;
            setError(err.message);
            setBusy(null);
            return;
          }
          // Anything else (offline, the store slow to answer) is no reason to
          // refuse a purchase: one that goes through is reported and checked
          // again as it completes.
        }
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
              apple: { sku: product.id, appAccountToken: token },
              google: {
                skus: [product.id],
                obfuscatedAccountId: token,
                ...(offers.length ? { subscriptionOffers: offers } : {}),
              },
            },
          });
        } catch (err) {
          failed(err, id);
        }
      };
      run.current.again = attempt;
      await attempt();
    },
    [products, requestPurchase, subscriptions, report, onEntitled, failed]
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
    try {
      let owned = ourPurchases(await ownedPurchases({ onlyIncludeActiveItemsIOS: true }));
      if (owned.length === 0) {
        await restorePurchases().catch(() => {});
        owned = ourPurchases(await ownedPurchases({ onlyIncludeActiveItemsIOS: true }));
      }
      const payloads = owned.map(reportFor).filter((p): p is NonNullable<typeof p> => p !== null);
      if (payloads.length === 0) {
        setError(`No subscription found for this ${Platform.OS === 'android' ? 'Google account' : 'Apple Account'}.`);
        return;
      }
      // One at a time: the first the server accepts is enough, and the rest
      // are the same subscription's other transactions.
      let entitled = false;
      for (const payload of payloads) if (await report(payload)) entitled = true;
      if (entitled) onEntitled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore purchases.');
    }
  }, [restorePurchases, report, onEntitled]);

  return { available: true, ready: connected, products, busy, error, accountReady, buy, restore };
}
