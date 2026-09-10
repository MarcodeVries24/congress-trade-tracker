import type { CSSProperties } from "react";

// A single 5-point star, centered on its own origin — reused via <use> at
// each star position rather than repeating the polygon 48 times.
const STAR_POINTS = "0,-2.6 0.62,-0.85 2.47,-0.8 1,0.33 1.53,2.1 0,1.05 -1.53,2.1 -1,0.33 -2.47,-0.8 -0.62,-0.85";

// Purely decorative — a simplified (not exact 50-star) American flag, used
// faded as a background accent behind the intro banner text. Self-contained
// vector, not a hotlinked photo, so it can't break and stays crisp at any
// size. The gentle ripple (feTurbulence + feDisplacementMap) is clipped to
// this SVG's own viewBox, and the parent banner also carries
// overflow-hidden, so the waving edges never spill past the box.
export function AmericanFlag({ className = "", style }: { className?: string; style?: CSSProperties }) {
  const starRows: { cy: number; cols: number[] }[] = [
    { cy: 9, cols: [12, 32, 52, 72, 92, 112] },
    { cy: 18.5, cols: [22, 42, 62, 82, 102] },
    { cy: 28, cols: [12, 32, 52, 72, 92, 112] },
    { cy: 37.5, cols: [22, 42, 62, 82, 102] },
    { cy: 47, cols: [12, 32, 52, 72, 92, 112] },
    { cy: 56.5, cols: [22, 42, 62, 82, 102] },
    { cy: 66, cols: [12, 32, 52, 72, 92, 112] },
    { cy: 75.5, cols: [22, 42, 62, 82, 102] },
  ];

  return (
    <svg viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice" className={className} style={style} aria-hidden>
      <defs>
        <filter id="flag-wave" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.045" numOctaves="3" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <polygon id="flag-star" points={STAR_POINTS} fill="#FFFFFF" />
        {/* Diagonal soft bands that ride along with the same ripple as the
            fabric underneath, giving the folds a highlight/shadow instead of
            reading as a flat-printed rectangle. */}
        <linearGradient id="flag-fold-light" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="18%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="32%" stopColor="#fff" stopOpacity="0" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="72%" stopColor="#fff" stopOpacity="0" />
          <stop offset="90%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="flag-fold-dark" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0%" stopColor="#000" stopOpacity="0.35" />
          <stop offset="14%" stopColor="#000" stopOpacity="0" />
          <stop offset="45%" stopColor="#000" stopOpacity="0.3" />
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="82%" stopColor="#000" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g filter="url(#flag-wave)">
        <rect x="0" y="0" width="300" height="160" fill="#B22234" />
        <g fill="#FFFFFF">
          {[12.3, 36.9, 61.5, 86.1, 110.7, 135.3].map((y) => (
            <rect key={y} x="0" y={y} width="300" height="12.3" />
          ))}
        </g>
        <rect x="0" y="0" width="120" height="86" fill="#3C3B6E" />
        {starRows.map((row) => row.cols.map((cx) => <use key={`${cx}-${row.cy}`} href="#flag-star" x={cx} y={row.cy} />))}
        <rect x="0" y="0" width="300" height="160" fill="url(#flag-fold-light)" style={{ mixBlendMode: "overlay" }} />
        <rect x="0" y="0" width="300" height="160" fill="url(#flag-fold-dark)" style={{ mixBlendMode: "multiply" }} />
      </g>
    </svg>
  );
}
