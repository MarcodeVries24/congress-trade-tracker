/**
 * Senate filings don't expose state directly the way House ones do (via
 * state_district), so senators are matched to members_reference by last
 * name instead — safe for ~100 individuals, with no current collisions.
 * Both the Senate ingest and the members sync must derive the exact same
 * key from a last name, hence sharing this function.
 */
export function normalizeLastName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      // Decompose accented letters into base + combining mark, then drop the
      // marks, so "Sánchez" becomes "sanchez" rather than "snchez".
      //
      // Without this the á was simply deleted by the strip below, and the
      // disclosure sites file these members *without* accents — so a filing
      // reading "Linda T. Sanchez" could not match the dataset's "Sánchez" and
      // instead matched Loretta Sanchez, a different congresswoman. Worse,
      // "Nanette Barragan" failed to match "Barragán" and matched Andy Barr,
      // whose surname is a substring of hers. Both attributed real trades to
      // the wrong member.
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z]/g, "")
  );
}

export function senateMemberKey(lastName: string): string {
  return `SEN:${normalizeLastName(lastName)}`;
}
