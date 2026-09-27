import { NextResponse } from "next/server";
import { getPolicyFeed } from "@/lib/policyFeed";

/**
 * The policy releases shown on the home page.
 *
 * A route rather than a server component because the home page is a client
 * component and already loads its other panels this way. Revalidated every
 * half hour: these are agencies publishing a handful of times a week, and
 * five government web servers shouldn't be touched once per visitor.
 */
export const revalidate = 1800;

export async function GET() {
  const items = await getPolicyFeed();
  return NextResponse.json(
    { items },
    // Shared cache for half an hour, and a stale copy is far better than a
    // gap in the page while one agency is slow.
    { headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } }
  );
}
