/**
 * What a purchase that did not go through means, from the store's error code.
 * Apart from the hook that uses it, so it can be tested on its own.
 */

type StoreError = { code?: string | number | null; message?: string | null };

/** Not a failure: the person closed the store's sheet. */
export function wasCancelled(err: StoreError): boolean {
  return /cancel/i.test(String(err.code ?? '')) || /cancel/i.test(err.message ?? '');
}

/**
 * Play's "something went wrong on our end" (billing response 6), and the names
 * the purchase library gives an error it cannot place. And "not available for
 * purchase" (response 4), which Play answers for the same passing reason: the
 * plan was on sale a second earlier, or it could not have been picked. Not the
 * ones trying again would not change: already owned, no network.
 */
const PASSING = new Set(['service-error', 'purchase-error', 'remote-error', 'item-unavailable', 'unknown', '4', '6']);

export function mayPass(err: StoreError): boolean {
  return !wasCancelled(err) && PASSING.has(String(err.code ?? ''));
}
