import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

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
 * A company's logo, by ticker: a redirect to the logo Finnhub has on file for
 * it, or a lettered tile in the company's colour when there is none.
 *
 * One address for every place a ticker appears, on the website and in the
 * app, so neither has to carry logo URLs through every query that lists
 * trades. The redirect is cached at the edge for a day; a logo almost never
 * changes, and a new one arrives with the monthly market-cap sync.
 *
 * `?fallback=none` answers 404 instead of a tile, for a client (the app) that
 * draws its own.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).trim().toUpperCase();
  const cache = {
    "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
  };

  if (/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    const rows = (await sql.query(`SELECT logo_url FROM company_market_caps WHERE ticker = $1`, [symbol])) as {
      logo_url: string | null;
    }[];
    const logo = rows[0]?.logo_url;
    if (logo && /^https:\/\//.test(logo)) {
      return NextResponse.redirect(logo, { status: 302, headers: cache });
    }
  }

  if (req.nextUrl.searchParams.get("fallback") === "none") {
    return new NextResponse(null, { status: 404, headers: cache });
  }
  return new NextResponse(monogram(symbol), {
    headers: { ...cache, "content-type": "image/svg+xml; charset=utf-8" },
  });
}
