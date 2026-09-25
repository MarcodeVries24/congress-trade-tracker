/**
 * The URL form of a member's disclosed name: "Hon. Tom O'Halleran" ->
 * "tom-o-halleran".
 *
 * Lives in its own module, dependency-free, because both sides need it: the
 * server pages that query by it, and the client-rendered politicians list that
 * links to it. lib/members.ts pulls in the database client, so a client
 * component importing the slug function from there would drag Neon into the
 * browser bundle.
 */
export function memberSlug(name: string): string {
  return name
    .replace(/^Hon\.\s+/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
