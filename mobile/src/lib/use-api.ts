import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useRef } from 'react';

import type { RequestOptions } from '@/lib/api';

/**
 * Gives a screen the Clerk session token to send with a request.
 *
 * Fetched per request rather than held in state, because Clerk rotates it and
 * a token read once at mount goes stale while the screen is still open. The
 * call is cheap: Clerk serves it from memory until it is close to expiring.
 *
 * A signed-out caller gets null, which the API client turns into an anonymous
 * request rather than an error. That is what lets the same screen work before
 * and after sign-in without branching.
 *
 * The returned function has a stable identity, deliberately. Clerk hands back a
 * fresh `getToken` on some renders, and screens put this straight into a
 * useCallback dependency list, so an unstable identity would re-run their load
 * on every render. The ref keeps the values current without the identity
 * changing.
 */
export function useAuthedRequest(): (signal?: AbortSignal) => Promise<RequestOptions> {
  const { getToken, isSignedIn } = useAuth();
  const latest = useRef({ getToken, isSignedIn });
  // Written in an effect rather than during render: a ref assigned while
  // rendering is not safe under concurrent rendering, and the linter is right
  // to refuse it. The initial value covers the first render.
  useEffect(() => {
    latest.current = { getToken, isSignedIn };
  }, [getToken, isSignedIn]);

  return useCallback(async (signal?: AbortSignal) => {
    if (!latest.current.isSignedIn) return { signal, token: null };
    try {
      return { signal, token: await latest.current.getToken() };
    } catch {
      // A token we cannot fetch is the same as not having one: the request
      // goes out anonymous and the screen shows whatever is free.
      return { signal, token: null };
    }
  }, []);
}
