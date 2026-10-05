/**
 * A company's display name from its SEC registration, written the way the
 * company writes it.
 *
 * The SEC's names are authoritative but often in capitals ("NVIDIA CORP",
 * "JPMORGAN CHASE & CO", "COCA COLA CO") and sometimes carry the state of
 * incorporation ("BANK OF AMERICA CORP /DE/"). The filings themselves spell
 * the same company properly ("NVIDIA Corporation", "The Coca-Cola Company"),
 * and they are public records too, so the casing is taken from there:
 *
 *  1. The registered name, without a trailing state tag.
 *  2. If a filed asset name contains it (ignoring case, spaces and
 *     punctuation), that stretch of the filed name, finished to a whole word.
 *  3. Otherwise word by word: a word already in mixed case stays; a capital
 *     word takes the casing the filings use for it; the rest are title-cased,
 *     keeping acronyms ("AT&T", "3M", "CSX") in capitals.
 *  4. Endings shortened the way the site writes them: "Corporation" to "Corp",
 *     "Incorporated" to "Inc", ", Inc" to " Inc".
 */

/**
 * Names fixed by hand, ahead of the SEC's. Liberty Media's Liberty Live
 * tracking stocks (found by the 2026-10 data audit), and registrations whose
 * name the casing cannot recover: the SEC lists Charles Schwab as "SCHWAB
 * CHARLES CORP", and the filings write JPMorgan and PepsiCo several ways.
 */
export const COMPANY_NAME_OVERRIDES: Record<string, string> = {
  LLYVK: "Liberty Live Group",
  LLYVA: "Liberty Live Group",
  SCHW: "Charles Schwab Corp",
  JPM: "JPMorgan Chase & Co",
  PEP: "PepsiCo Inc",
};

const SUFFIX: Record<string, string> = {
  CORP: "Corp",
  CO: "Co",
  INC: "Inc",
  LTD: "Ltd",
  PLC: "plc",
  HLDGS: "Holdings",
  HLDG: "Holding",
  GRP: "Group",
  INTL: "International",
  TR: "Trust",
};
const SMALL: Record<string, string> = { OF: "of", AND: "and", FOR: "for", DE: "de", IN: "in", THE: "the" };
const ENDING: Record<string, string> = { Corporation: "Corp", Incorporated: "Inc", Company: "Co", Limited: "Ltd" };

/** "BANK OF AMERICA CORP /DE/", "Rivian Automotive, Inc. / DE" -> without the tag. "A/S" stays. */
export function withoutStateTag(title: string): string {
  let prev = "";
  let t = title.trim();
  while (prev !== t) {
    prev = t;
    t = t.replace(/\s*\/\s*[A-Za-z.]{2,6}\s*\/?\s*$/, "").trim();
  }
  return t;
}

/** Upper-case letters and digits only, with each kept character's position in the original. */
function squeeze(s: string): { text: string; at: number[] } {
  let text = "";
  const at: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (/[A-Za-z0-9]/.test(s[i])) {
      text += s[i].toUpperCase();
      at.push(i);
    }
  }
  return { text, at };
}

const isMixed = (w: string) => w !== w.toUpperCase() && w !== w.toLowerCase();

// A word in odd casing ("NGl", "lP", "AEgON"): typing in a filing, not the
// company's style. "Co", "Inc", "PayPal", "JPMorgan" and "iShares" are fine.
const isOdd = (w: string) =>
  isMixed(w) && ((w.length <= 3 && !/^[A-Z][a-z]*$/.test(w)) || /[A-Z]{2}[a-z]+[A-Z]/.test(w));

// Short words that are words, not acronyms, for title-casing.
const SHORT_WORDS = new Set(["NEW", "ONE", "TWO", "AIR", "OIL", "GAS", "CAR", "SUN", "BIO", "BAY", "BIG", "TOP", "RED", "SEA", "SKY", "ICE", "ARK", "ART"]);

/** The stretch of a filed name that spells the registered name, or null. Only a mixed-case one helps. */
function fromFilings(title: string, filed: [string, number][]): string | null {
  const target = squeeze(title).text;
  if (target.length < 3) return null;
  for (const [name] of filed) {
    const { text, at } = squeeze(name);
    const p = text.indexOf(target);
    if (p < 0) continue;
    const start = at[p];
    if (start > 0 && /[A-Za-z0-9]/.test(name[start - 1])) continue; // must begin a word
    let end = at[p + target.length - 1] + 1;
    while (end < name.length && /[A-Za-z0-9]/.test(name[end])) end++; // finish the word
    // Keep the closing full stop of an abbreviation such as "L.P." or "S.A.".
    if (name[end] === "." && /[A-Za-z]\.[A-Za-z]$/.test(name.slice(start, end))) end++;
    const span = name.slice(start, end).replace(/^[\s,]+|[\s,]+$/g, "");
    if (isMixed(span) && !span.split(/\s+/).some(isOdd)) return span;
  }
  return null;
}

/** How the filings write each word (keyed by its letters in capitals), most used first. */
function filedWords(filed: [string, number][]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  const capsInMixed = new Set<string>();
  for (const [name, n] of filed) {
    const nameIsMixed = /[a-z]/.test(name);
    for (const word of name.match(/[A-Za-z0-9][A-Za-z0-9&'.-]*/g) ?? []) {
      const clean = word.replace(/\.+$/, "");
      const key = clean.replace(/[^A-Za-z0-9&]/g, "").toUpperCase();
      if (!key || isOdd(clean)) continue;
      if (nameIsMixed && key.length >= 3 && clean === clean.toUpperCase() && /[A-Z]/.test(clean)) capsInMixed.add(key);
      const byForm = counts.get(key) ?? new Map<string, number>();
      byForm.set(clean, (byForm.get(clean) ?? 0) + n);
      counts.set(key, byForm);
    }
  }
  const best = new Map<string, string>();
  for (const [key, byForm] of counts) {
    const mixed = [...byForm.entries()].filter(([w]) => isMixed(w)).sort((a, b) => b[1] - a[1]);
    if (mixed.length) best.set(key, mixed[0][0]);
    // Written in capitals inside an otherwise normally cased name ("AECOM
    // Technology Corp"): that is how the company spells it, so it stays.
    else if (capsInMixed.has(key)) best.set(key, key);
  }
  return best;
}

function caseWord(token: string, filed: Map<string, string>, first: boolean): string {
  if (isMixed(token)) return token;
  const core = token.replace(/[^A-Za-z0-9&]/g, "");
  if (!core) return token;
  const key = core.toUpperCase();
  const seen = filed.get(key);
  if (seen) {
    const letters = seen.replace(/[^A-Za-z0-9&]/g, "");
    if (letters.toUpperCase() === key) return token.replace(core, letters);
  }
  if (SUFFIX[key]) return token.replace(core, SUFFIX[key]);
  if (SMALL[key] && !first) return token.replace(core, SMALL[key]);
  // Acronyms stay in capitals: with "&" or a digit, three letters or fewer,
  // or no vowel at all ("AT&T", "3M", "IBM", "CSX").
  if (/[&0-9]/.test(core) || (core.length <= 3 && !SHORT_WORDS.has(key)) || !/[AEIOUY]/.test(key)) return token;
  return token.replace(
    core,
    core
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("-")
  );
}

function shortenEnding(name: string): string {
  const words = name.replace(/,\s*(Inc|Ltd|Corp|Co|plc|LLC|LP|N\.V|S\.A|AG|SE)\b/g, " $1").split(" ");
  for (let i = Math.max(0, words.length - 2); i < words.length; i++) {
    if (ENDING[words[i]]) words[i] = ENDING[words[i]];
  }
  return words.join(" ").trim();
}

/**
 * The display name for a ticker, from its SEC title and the asset names it
 * was filed under (with how often each was used).
 */
export function companyNameFrom(secTitle: string, filedNames: [string, number][]): string {
  const title = withoutStateTag(secTitle);
  const filed = [...filedNames].sort((a, b) => b[1] - a[1]);
  const spelled = fromFilings(title, filed);
  if (spelled) return shortenEnding(spelled);
  const words = filedWords(filed);
  return shortenEnding(
    title
      .split(" ")
      .map((w, i) => caseWord(w, words, i === 0))
      .join(" ")
  );
}

/** The SEC's ticker for one of ours: the SEC writes share classes with a hyphen ("BRK-B"). */
export function secTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}
