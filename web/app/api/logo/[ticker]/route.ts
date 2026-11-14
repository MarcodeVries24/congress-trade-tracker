import { NextRequest, NextResponse } from "next/server";
import { brandLogoUrl } from "@congtrade/shared/brandLogo";

// Deep, saturated tones that all carry white text, chosen from the ticker by a
// hash so a company always wears the same colour. The app's TickerLogo uses
// the same list for its own fallback tile.
const TONES = [
  "#101729",
  "#1D4ED8",
  "#0F766E",
  "#7C3AED",
  "#BE123C",
  "#B45309",
  "#15803D",
  "#334155",
  "#9D174D",
  "#3A82C2",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function monogram(ticker: string): string {
  const label = ticker.replace(/[^A-Z0-9.]/g, "").slice(0, 4) || "?";
  const size = label.length <= 2 ? 26 : label.length === 3 ? 21 : 17;
  const tone = TONES[hash(label) % TONES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
<rect width="64" height="64" rx="16" fill="${tone}"/>
<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif" font-size="${size}" font-weight="800" fill="#fff">${label}</text>
</svg>`;
}

/**
 * A company's logo, by ticker: a redirect to Brandfetch's (see
 * @congtrade/shared/brandLogo), or a lettered tile in the company's colour
 * for something that is not a ticker. Brandfetch answers 404 for a ticker it
 * has no logo for, and the image then fails like any other, so the clients
 * draw their tile.
 *
 * Only for app versions from before logos were addressed directly: rows
 * carry Brandfetch's address (LOGO_SQL), and the website and the app build
 * it from the ticker otherwise. Cached for a day at the edge and a week in
 * the browser.
 *
 * `?fallback=none` answers 404 instead of a tile, for a client (the app) that
 * draws its own.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).trim().toUpperCase();
  const cache = {
    "cache-control": "public, max-age=604800, s-maxage=86400, stale-while-revalidate=604800",
  };
  const logo = brandLogoUrl(symbol);
  if (logo) return NextResponse.redirect(logo, { status: 302, headers: cache });

  if (req.nextUrl.searchParams.get("fallback") === "none") {
    return new NextResponse(null, { status: 404, headers: cache });
  }
  return new NextResponse(monogram(symbol), {
    headers: { ...cache, "content-type": "image/svg+xml; charset=utf-8" },
  });
}
