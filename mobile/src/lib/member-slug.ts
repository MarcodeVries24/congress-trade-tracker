/**
 * A member's page slug from a filed spelling ("Hon. Tom O'Halleran" ->
 * "tom-o-halleran"): web/lib/memberSlug.ts, which the API resolves to the
 * member whichever of their spellings it came from.
 */
export function memberSlug(name: string): string {
  return name
    .replace(/^Hon\.\s+/i, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
