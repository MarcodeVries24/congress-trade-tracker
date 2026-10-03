"use client";

import { useState } from "react";

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
 * A company's logo, from /api/logo, which redirects to the one on file or
 * answers with a lettered tile. If the logo itself then fails to load (the
 * provider's host has gaps), the tile is drawn here instead, so a ticker
 * never shows as a broken image.
 *
 * Logos sit on white even in dark mode: most are drawn for a white page, and
 * a dark mark on the dark panel would vanish.
 */
export function TickerLogo({
  ticker,
  size = 32,
  className = "",
}: {
  ticker: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
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
      {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to
          the provider's host, which Next's optimizer would re-host instead. */}
      <img
        src={`/api/logo/${encodeURIComponent(ticker)}`}
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
