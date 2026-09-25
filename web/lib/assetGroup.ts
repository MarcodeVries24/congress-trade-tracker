/**
 * An issuer name for an asset that carries no ticker.
 *
 * The company side of the corpus has tickers, which are a real identity. The
 * rest — municipal bonds, treasuries, corporate paper, private LLCs — is free
 * text with the instrument's own details written into it: "UNIV OF HOUSTON TX
 * UNIV REVENU DUE 02/15/2040 5.000%". Every maturity and coupon is its own
 * string, so grouping on the raw name produces one entry per bond series
 * rather than one per issuer.
 *
 * This strips the instrument down to the body that names the issuer. It is an
 * approximation and it says so: it folds 5,037 filed names into about 3,200
 * groups, and roughly half of those are still a single trade. What it gets
 * right is the head of the list, which is what a directory is read for.
 *
 * Dependency-free: the browser builds labels and links with it too.
 */

/**
 * Families written so many different ways that the general rules can't reach
 * them. "US Treasury" alone arrives as U S TREASURY BILL, US TSY NOTE, UNITED
 * STATES TREAS BILLS and four more, splitting 1,200 trades seven ways.
 */
const FAMILIES: [RegExp, string][] = [
  [/\b(U\.?\s?S\.?|UNITED\s+STATES)\s+(TREAS(URY|URIES)?|TSY)\b/, "US Treasury"],
  [/^JPM(ORGAN)?\s+US\s+TREAS/, "JPMorgan US Treasury fund"],
  [/\bVANGUARD\b/, "Vanguard funds"],
  [/\bFIDELITY\b/, "Fidelity funds"],
  [/\bISHARES\b/, "iShares funds"],
  [/\bSCHWAB\b/, "Schwab funds"],
  [/\bDFA\b/, "DFA funds"],
];

/** Instrument detail: maturity, coupon, registration and series codes. */
const INSTRUMENT_DETAIL = [
  /\(.*?\)/g,
  /\bDUE\s+\d{1,2}\/\d{1,2}\/\d{2,4}/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d+[.\s]?\d*\s*%/g,
  /\bBE\s*\/?\s*R\s*\/?/g,
];

/** Words that describe the paper rather than who issued it. */
const INSTRUMENT_WORDS = /\b(SR|SER|SERIES|RV|REV|REVENUE|REVENUES|GO|NTS|NOTE|NOTES|BOND|BONDS|MTN|ULT|SUB|COP)\b/g;

/** How many leading words are kept. Beyond four is almost always detail. */
const NAME_WORDS = 4;

export function assetGroupName(assetName: string): string | null {
  let base = assetName.toUpperCase();
  for (const re of INSTRUMENT_DETAIL) base = base.replace(re, " ");
  base = base.replace(/[^A-Z0-9& ]/g, " ").replace(/\s+/g, " ").trim();
  if (!base) return null;

  for (const [re, label] of FAMILIES) if (re.test(base)) return label;

  const body = base
    .replace(INSTRUMENT_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, NAME_WORDS)
    .join(" ");
  return body || null;
}
