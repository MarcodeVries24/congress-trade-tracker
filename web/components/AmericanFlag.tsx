import type { CSSProperties } from "react";

// Purely decorative — a simplified (not exact 50-star) American flag, used
// faded as a background accent behind the intro banner text. Self-contained
// vector, not a hotlinked photo, so it can't break and stays crisp at any
// size.
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
      <rect x="0" y="0" width="300" height="160" fill="#B22234" />
      <g fill="#FFFFFF">
        {[12.3, 36.9, 61.5, 86.1, 110.7, 135.3].map((y) => (
          <rect key={y} x="0" y={y} width="300" height="12.3" />
        ))}
      </g>
      <rect x="0" y="0" width="120" height="86" fill="#3C3B6E" />
      <g fill="#FFFFFF">
        {starRows.map((row) => row.cols.map((cx) => <circle key={`${cx}-${row.cy}`} cx={cx} cy={row.cy} r="3.2" />))}
      </g>
    </svg>
  );
}
