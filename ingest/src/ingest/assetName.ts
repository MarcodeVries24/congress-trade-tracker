/**
 * Cleaning for an asset name as parsed, before it is stored. Three things the
 * 2026-10 data audit found in the corpus, each fixed here so new filings
 * don't bring them back:
 *
 *  - A comment glued to the front. A filing's free-text comment wraps over
 *    lines, and when a line happens to end on a normal word the parser takes
 *    the rest of the comment for the start of the next asset's name: "advisors.
 *    I have no role in ... executed by a financial advisor. US Treasury Note
 *    01/31/27 [GS]". The asset is what follows the last sentence of prose.
 *  - An owner code inside that glued text ("... went into. JT Sonida Senior
 *    Living ..."), which then never reached the owner field.
 *  - Form labels: "Rate/Coupon: 5.0% Matures: 11/15/2041", "Option Type: Put
 *    Strike price: $500.00 Expires: 12/20/2024", "(Symbol: CWGIX)". The
 *    information stays; the labels go, and a symbol given that way becomes
 *    the ticker.
 */

// Words that only turn up in prose, never in an asset's name.
const PROSE = /\b(I|I'm|I've|my|me|we|our|without|advisors?|manager|account|disclosure|guidance|decisions?|executed|requirements|directed|discretion|solely|independent|notify|failed|PTR|should|conjunction|spinoff|result of|this entry)\b/;
// A segment starting in lower case reads as the tail of a sentence only when
// it is sentence-length: brand names start in lower case too ("e.l.f.",
// "iShares J.P. Morgan").
// Also prose: a long run of mostly lower-case words. Asset names, even bonds,
// are written in capitals ("Common Stock", "GO BDS").
const isProse = (segment: string) => {
  const words = segment.trim().split(/\s+/);
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  return (
    PROSE.test(segment) ||
    (/^[a-z]/.test(segment) && words.length >= 4) ||
    (words.length >= 8 && lower / words.length >= 0.55)
  );
};

// A sentence break: end punctuation, not an abbreviation ("Inc.", "Oct.",
// "J.P."), then the next thing in capitals or digits.
const SENTENCE_BREAK =
  /(?<=[.!?"”])(?<!\b(?:Inc|Co|Corp|Ltd|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|St|No|vs|Mr|Mrs|Ms|Dr|Jr|Sr|U\.S|N\.V|S\.A|J\.P|L\.P|e\.l\.f)\.)\s+(?=(?:(?:SP|JT|DC)\s+)?[A-Z0-9$])/;

/** The asset with any comment glued to its front removed, and an owner code found inside it. */
export function stripGluedComment(name: string): { name: string; owner: string | null } {
  if (!isProse(name)) return { name, owner: null };
  let rest: string | null = null;
  let owner: string | null = null;
  // Strongest anchor: the last sentence end followed by an owner code.
  const anchored = name.match(/^(.*[.!?"”])\s+(SP|JT|DC)\s+(?=[A-Z0-9$])(.*)$/);
  if (anchored && isProse(anchored[1])) {
    rest = anchored[3];
    owner = anchored[2];
  } else {
    const parts = name.split(SENTENCE_BREAK);
    let last = -1;
    for (let i = 0; i < parts.length - 1; i++) if (isProse(parts[i])) last = i;
    if (last >= 0) rest = parts.slice(last + 1).join(" ");
    else {
      // A comment that ends in the House Clerk's 10-digit transaction id, or
      // in "per new guidance", rather than a full stop.
      const cut = name.split(/\b2000\d{6}\s+|per new guidance\s+/);
      if (cut.length > 1) rest = cut[cut.length - 1];
    }
    const lead = rest?.match(/^(SP|JT|DC)\s+/);
    if (rest && lead) {
      owner = lead[1];
      rest = rest.slice(lead[0].length);
    }
  }
  const cleaned = rest?.trim();
  // Never return prose, or nothing: better the original than a wrong name.
  if (!cleaned || isProse(cleaned)) return { name, owner: null };
  return { name: cleaned, owner };
}

/** The asset name without form labels, and a ticker the labels gave, if any. */
export function stripLabels(name: string): { name: string; ticker: string | null } {
  let ticker: string | null = null;
  let n = name
    // "(Symbol: CWGIX)", "(Ticker: CCLFX)", "Stock: DNbbY": a symbol given in words.
    .replace(/\(\s*(?:Symbol|Ticker)\s*:\s*([A-Za-z][A-Za-z0-9.]{0,6})\s*\)/i, (_, t: string) => {
      ticker = t.toUpperCase();
      return `(${ticker})`;
    })
    .replace(/^Stock\s*:\s*([A-Za-z][A-Za-z0-9.]{0,6})(\s*\[[A-Za-z]{1,3}\])?$/i, (_, t: string, code?: string) => {
      ticker = t.toUpperCase();
      return ticker + (code ?? "");
    })
    // Bonds: "Rate/Coupon: 5.0% Matures: 11/15/2041" -> "5.0% due 11/15/2041".
    .replace(/Rate\/Coupon\s*:\s*/i, "")
    .replace(/\s*Matures\s*:\s*/i, " due ")
    // Options: "Option Type: Put Strike price: $500.00 Expires: 12/20/2024" -> "Put $500.00 exp 12/20/2024".
    .replace(/Option Type\s*:\s*/i, "")
    .replace(/\s*Strike price\s*:\s*/i, " ")
    .replace(/\s*Expires\s*:\s*/i, " exp ")
    // "ISIN: US123..." -> "ISIN US123..."; "Exchange/Platform: eToro" -> "(eToro)".
    .replace(/\bISIN\s*:\s*/i, "ISIN ")
    .replace(/\s*Exchange\/Platform\s*:\s*([^()]+?)\s*$/i, " ($1)")
    // Account plumbing: "TDL: 006682076|4|N|4812C".
    .replace(/\s*TDL\s*:\s*\S+/i, "")
    // A corporate action: "XXXMANDATORY MERGER EFF: 01/22/26" -> "(mandatory merger 01/22/26)".
    .replace(/\s*X*MANDATORY MERGER EFF\s*:\s*(\S+)/i, " (mandatory merger $1)")
    // A letter heading: "RE: $ 900,065,000 GO".
    .replace(/^RE\s*:\s*/i, "")
    // OCR of "SPDR" with a stray colon: "SPOR : Ser Tr".
    .replace(/^SPOR\s*:\s*/i, "SPDR ")
    // A platform prefix: "Hedge Fund Select: ELT Associates" -> "Hedge Fund Select – ELT Associates".
    .replace(/^(Hedge Fund Select)\s*:\s*/i, "$1 – ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!n) n = name;
  return { name: n, ticker };
}

/** Both, in order, for a parsed transaction. Keeps a parsed owner/ticker over one found here. */
export function cleanParsedAsset<T extends { assetName: string; owner: string | null; ticker: string | null }>(t: T): T {
  const glued = stripGluedComment(t.assetName);
  const labelled = stripLabels(glued.name);
  return {
    ...t,
    assetName: labelled.name,
    owner: t.owner ?? glued.owner,
    ticker: t.ticker ?? labelled.ticker,
  };
}
