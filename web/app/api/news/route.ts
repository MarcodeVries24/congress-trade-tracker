import { NextResponse } from "next/server";
import { getGeneralNews } from "@/lib/newsFeed";

/** The home page's news row. Same caching reasoning as /api/policy. */
export const revalidate = 1800;

export async function GET() {
  const sections = await getGeneralNews(4);
  return NextResponse.json(
    { sections },
    { headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } }
  );
}
