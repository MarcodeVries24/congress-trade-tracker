/**
 * Where a member's portrait lives: Congress's own Bioguide, and the
 * community-run unitedstates/images mirror as a second try.
 *
 * The Bioguide has no photo for some members (Josh Gottheimer, G000583, for
 * one; newly sworn-in members too, until theirs is uploaded) and the mirror
 * often does. The website's MemberPhoto tries the same two in the same order.
 */
export function memberPhotoUrl(bioguideId: string): string {
  const id = bioguideId.toUpperCase();
  return `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
}

/** The mirror's copy of a Bioguide portrait URL, or null for any other URL. */
export function mirrorPhotoUrl(uri: string): string | null {
  const m = uri.match(/\/([A-Za-z]\d{6})\.jpg$/);
  return m
    ? `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/${m[1].toUpperCase()}.jpg`
    : null;
}
