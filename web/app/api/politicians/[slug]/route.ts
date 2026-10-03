import { NextResponse } from "next/server";
import { getMemberBySlug } from "@/lib/members";
import { getTimingSummary } from "@/lib/prices";

/**
 * One member, as JSON, for the app.
 *
 * The same function the /politicians/[slug] page renders from, so a member's
 * totals cannot differ between the website and the phone. Free, like the page:
 * it is public filing data, and the page is what search engines index.
 *
 * `redirectTo` is passed through rather than followed. It means the slug was a
 * superseded spelling, and the app should ask again under the current one so
 * that what it caches is keyed the same way as everything else.
 *
 * `timing` is the page's "before the public knew" summary, over all of the
 * member's trades rather than the hundred sent here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  const timing = member.redirectTo
    ? null
    : await getTimingSummary("t.member_name = ANY($1)", [member.profile.names]).catch(() => null);
  return NextResponse.json({ ...member, timing }, {
    headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
