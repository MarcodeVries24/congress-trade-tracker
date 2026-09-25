import { displayName } from "./api";
import { MEMBER_DISPLAY_NAMES } from "./memberNames";

/**
 * How a member's name is rendered, for a single row.
 *
 * Deliberately dependency-free (no database client): client components and
 * the alert emails both need it, and both of those must not pull in Neon.
 *
 * The site used to show two different names for the same person depending on
 * where you landed — member pages ran every spelling of a person through
 * groupMembers and applied the curated list, while the home page, the trade
 * list and the alert emails printed whatever the filing happened to say. So
 * Ro Khanna's page said "Ro Khanna" and the home page said "Rohit Khanna";
 * Angus King was "Angus S King, Jr."; Blumenthal was shouted. This is the
 * one-row version of that same resolution, so every surface agrees.
 *
 * A row with no bioguide_id (a filing whose member hasn't been resolved, ~12
 * rows in the corpus) still gets the tidying below, which is more than the
 * bare honorific-strip it used to get.
 */
export function memberDisplayName(row: { member_name: string; bioguide_id?: string | null }): string {
  const curated = row.bioguide_id ? MEMBER_DISPLAY_NAMES[row.bioguide_id] : undefined;
  return curated ?? titleCaseIfShouted(cleanName(displayName(row.member_name)));
}

// Tokens that are form-filling noise rather than part of a name: honorifics
// and post-nominals that appear in some spellings and not others.
export const NAME_NOISE = /\b(mr|mrs|ms|dr|hon|md|facs|dds|esq)\b/i;

/**
 * Title-cases a name that only ever appears in capitals.
 *
 * Two members — Blumenthal and Feinstein — are filed exclusively as
 * "RICHARD BLUMENTHAL" and "DIANNE FEINSTEIN", so there is no better-cased
 * variant to prefer and shouting them in an <h1> is the only alternative.
 * Applied only when the name carries no case information at all, so a
 * correctly-cased "McCaul" or "DelBene" is never touched.
 */
export function titleCaseIfShouted(name: string): string {
  if (/[a-z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s('\-])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, ch: string) => `Mc${ch.toUpperCase()}`);
}

/**
 * Strips form-filling noise from a chosen name.
 *
 * Sometimes every spelling is polluted, so picking between them can't help:
 * Neal Dunn is filed only as "Neal Patrick Dunn, MD, FACS" and "Neal Patrick
 * MD, Facs Dunn" — the second with his surname stranded mid-name. Removing the
 * post-nominals makes both read "Neal Patrick Dunn".
 *
 * Only applied when at least two words survive, so a name that is somehow all
 * honorific is left alone rather than emptied.
 */
export function cleanName(name: string): string {
  const stripped = name
    .split(/\s+/)
    .filter((w) => !NAME_NOISE.test(w.replace(/[^A-Za-z]/g, "")))
    .join(" ")
    .replace(/\s*,\s*$/, "")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;
  // "Scott Scott Franklin" -> "Scott Franklin"
  return words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase()).join(" ");
}
