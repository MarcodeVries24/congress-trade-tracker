/**
 * Senate filings don't expose state directly the way House ones do (via
 * state_district), so senators are matched to members_reference by last
 * name instead — safe for ~100 individuals, with no current collisions.
 * Both the Senate ingest and the members sync must derive the exact same
 * key from a last name, hence sharing this function.
 */
export function normalizeLastName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function senateMemberKey(lastName: string): string {
  return `SEN:${normalizeLastName(lastName)}`;
}
