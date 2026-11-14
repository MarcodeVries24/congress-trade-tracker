/**
 * An ISO date ("YYYY-MM-DD") only if it is a day that exists on the calendar,
 * else null.
 *
 * Filings do contain impossible dates: a House PTR of Ro Khanna's gave a
 * transaction date of 09/31/2026. Stored as text, one such row made every
 * query that casts the column to a date fail outright (the home page's flow
 * chart went blank), so the parsers drop it here instead, the same as a date
 * they could not read at all.
 */
export function realDate(iso: string): string | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? iso : null;
}
