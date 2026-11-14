/**
 * Company logos, from Brandfetch's Logo API by stock ticker.
 *
 * Brandfetch asks for its images to be embedded straight from its CDN, never
 * downloaded or stored, so this only builds the address the website and the
 * app put in an image tag. The client ID is public by design: it is part of
 * every image address. Free up to a million images a month, no attribution
 * asked.
 *
 * `fallback/404` makes a ticker Brandfetch has no logo for fail to load, and
 * the website and the app then draw their own lettered tile, rather than
 * show Brandfetch's stand-in. Brandfetch writes share classes with a dash:
 * BRK-B, where filings say BRK.B.
 */
export const BRANDFETCH_CLIENT_ID = "1idbVy16C1BjUEDl8gl";

const TICKER = /^[A-Z0-9.-]{1,12}$/;

/** The logo's address for a ticker, or null for something that is not one. */
export function brandLogoUrl(ticker: string | null | undefined, size = 128): string | null {
  const symbol = (ticker ?? "").trim().toUpperCase();
  if (!TICKER.test(symbol)) return null;
  return `https://cdn.brandfetch.io/ticker/${symbol.replace(/\./g, "-")}/w/${size}/h/${size}/fallback/404/icon.png?c=${BRANDFETCH_CLIENT_ID}`;
}
