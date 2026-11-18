import { NextResponse } from "next/server";
import { PUBLISHED_DATA_TAG } from "@/lib/cache";
import { getIssuerBySlug } from "@/lib/issuers";

/**
 * One issuer, as JSON, for the app: the company, who in Congress traded it,
 * and the most recent trades.
 *
 * The same function the /issuers/[slug] page renders from, and free for the
 * same reason the page is.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getIssuerBySlug(slug);
  if (!found) return NextResponse.json({ error: "Issuer not found" }, { status: 404 });
  return NextResponse.json(found, {
    headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600", "Vercel-Cache-Tag": PUBLISHED_DATA_TAG },
  });
}
