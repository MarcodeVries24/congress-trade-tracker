"use client";

import { useState } from "react";
import { brandLogoUrl } from "@congtrade/shared/brandLogo";

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

/**
 * A company's logo, from Brandfetch: the address the row brought along
 * (`logo`, from LOGO_SQL) or, when it has none, the one built from the
 * ticker, so a list of trades costs this site no request per logo. The
 * lettered tile at once when the row says there is none (''), and when the
 * logo fails to load, which is how Brandfetch says it has none for this
 * ticker, so a ticker never shows as a broken image.
 *
 * Logos sit on white even in dark mode: most are drawn for a white page, and
 * a dark mark on the dark panel would vanish.
 */
export function TickerLogo({
  ticker,
  logo,
  size = 32,
  className = "",
}: {
  ticker: string;
  logo?: string | null;
  size?: number;
  className?: string;
}) {
  const src = logo === "" ? null : logo || brandLogoUrl(ticker);
  const [failed, setFailed] = useState(!src);
  const label =
    ticker
      .replace(/[^A-Za-z0-9.]/g, "")
      .slice(0, 4)
      .toUpperCase() || "?";
  const radius = Math.round(size * 0.28);

  if (failed) {
    const fontSize = label.length <= 2 ? size * 0.38 : label.length === 3 ? size * 0.3 : size * 0.25;
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center font-extrabold text-white ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: TONES[hash(label) % TONES.length],
          fontSize,
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-line bg-white ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Brandfetch's own
          address, which it requires: Next's optimizer would re-host it. */}
      <img
        src={src ?? undefined}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain p-[12%]"
      />
    </span>
  );
}
