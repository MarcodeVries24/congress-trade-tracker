import { fetchIssuer, fetchPolitician, type IssuerDetail, type PoliticianDetail, type RequestOptions } from '@/lib/api';

/**
 * Member and company pages, kept for a few minutes and shared between screens.
 *
 * Portfolio and the Alerts feed both need the detail of everything followed,
 * and switching between them should not fetch it all twice. Requests in
 * flight are shared too, so two screens asking at once make one request.
 */
const TTL = 5 * 60_000;
const politicians = new Map<string, { at: number; value: Promise<PoliticianDetail> }>();
const issuers = new Map<string, { at: number; value: Promise<IssuerDetail> }>();

function cached<T>(
  map: Map<string, { at: number; value: Promise<T> }>,
  key: string,
  load: () => Promise<T>,
  fresh: boolean
) {
  const hit = map.get(key);
  if (hit && !fresh && Date.now() - hit.at < TTL) return hit.value;
  const value = load();
  map.set(key, { at: Date.now(), value });
  // A failure is not worth remembering: the next caller should try again.
  value.catch(() => map.delete(key));
  return value;
}

export function getPolitician(slug: string, options: RequestOptions = {}, fresh = false): Promise<PoliticianDetail> {
  return cached(
    politicians,
    slug,
    async () => {
      const found = await fetchPolitician(slug, options);
      return found.redirectTo ? fetchPolitician(found.redirectTo, options) : found;
    },
    fresh
  );
}

export function getIssuer(slug: string, options: RequestOptions = {}, fresh = false): Promise<IssuerDetail> {
  return cached(issuers, slug.toLowerCase(), () => fetchIssuer(slug.toLowerCase(), options), fresh);
}

/** Settles every request, keeping the ones that worked. One dead page should not blank a list. */
export async function settleAll<T>(promises: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(promises);
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}
