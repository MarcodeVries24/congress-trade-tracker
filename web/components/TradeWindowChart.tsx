import type { PricePoint } from "@/lib/priceSeries";

/**
 * One trade on the stock's price: the day it was made, the day the public
 * was told, and the stretch in between shaded, amber when it ran past the 45
 * days the law allows. The trade page's chart, where PriceTradesChart is the
 * company's.
 *
 * Drawn twice, at a phone's width and a desktop's, with one shown by
 * breakpoint, for the same reason as PriceTradesChart: an SVG scales its text
 * with it.
 */

// Narrow enough that 12px labels stay readable scaled down to a phone.
const NARROW = 420;
const WIDE = 1000;
const HEIGHT = 260;
const PAD_TOP = 30;
const PAD_BOTTOM = 26;
const PAD_LEFT = 52;
const PAD_RIGHT = 14;
const LATE_DAYS = 45;

const dayMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
}

function shortDay(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export interface WindowChartProps {
  points: PricePoint[];
  traded: string;
  filed: string | null;
  kind: "buy" | "sell" | "other";
}

export function TradeWindowChart(props: WindowChartProps) {
  if (props.points.length < 5) return null;
  return (
    <>
      <div className="lg:hidden">
        <Chart {...props} width={NARROW} />
      </div>
      <div className="hidden lg:block">
        <Chart {...props} width={WIDE} />
      </div>
    </>
  );
}

function Chart({ points, traded, filed, kind, width }: WindowChartProps & { width: number }) {
  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const start = dayMs(points[0].d);
  const end = dayMs(points[points.length - 1].d);
  const span = Math.max(end - start, 1);
  const x = (d: string) => PAD_LEFT + ((Math.min(Math.max(dayMs(d), start), end) - start) / span) * plotW;

  const lo = Math.min(...points.map((p) => p.c));
  const hi = Math.max(...points.map((p) => p.c));
  const pad = (hi - lo) * 0.12 || hi * 0.05;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const y = (c: number) => PAD_TOP + plotH - ((c - yMin) / (yMax - yMin)) * plotH;

  const closeOn = (day: string): number | null => {
    let found: number | null = null;
    for (const p of points) {
      if (p.d <= day) found = p.c;
      else break;
    }
    return found;
  };

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.c).toFixed(1)}`).join("");
  const area = `${line}L${x(points[points.length - 1].d).toFixed(1)},${PAD_TOP + plotH}L${PAD_LEFT},${PAD_TOP + plotH}Z`;

  const tradeClose = closeOn(traded);
  const filedIn = filed && dayMs(filed) <= end ? filed : null;
  const filedClose = filedIn ? closeOn(filedIn) : null;
  const gapDays = filed ? Math.round((dayMs(filed) - dayMs(traded)) / 86_400_000) : null;
  const late = gapDays !== null && gapDays > LATE_DAYS;
  const shadeColor = late ? "rgb(245 158 11)" : "rgb(58 130 194)";
  const dotClass = kind === "buy" ? "fill-emerald-500" : kind === "sell" ? "fill-rose-500" : "fill-amber-500";

  const ticks = [0, 0.5, 1].map((f) => yMin + (yMax - yMin) * f);
  const shadeFrom = x(traded);
  const shadeTo = filed ? x(filed) : shadeFrom;
  const id = `win-${width}`;

  // A label sits right of its dot unless that would run off the plot.
  const labelX = (px: number) => (px > width - 130 ? { x: px - 8, anchor: "end" as const } : { x: px + 8, anchor: "start" as const });

  return (
    <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label="The stock's daily closing price around this trade">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(58 130 194)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="rgb(58 130 194)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
          <text x={PAD_LEFT - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-faint text-[12px]">
            {money(t)}
          </text>
        </g>
      ))}

      {filed && shadeTo > shadeFrom ? (
        <g>
          <rect
            x={shadeFrom}
            y={PAD_TOP - 18}
            width={shadeTo - shadeFrom}
            height={plotH + 18}
            fill={shadeColor}
            opacity={0.1}
            rx={4}
          />
          {shadeTo - shadeFrom > 56 ? (
            <text
              x={(shadeFrom + shadeTo) / 2}
              y={PAD_TOP - 6}
              textAnchor="middle"
              className="text-[11px] font-semibold"
              fill={shadeColor}
            >
              {/* The full label where the stretch is wide enough to hold it. */}
              {shadeTo - shadeFrom > 190
                ? `NOT YET PUBLIC · ${gapDays} DAYS${late ? " (LATE)" : ""}`
                : `${gapDays} DAYS${late ? " · LATE" : ""}`}
            </text>
          ) : null}
        </g>
      ) : null}

      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="rgb(58 130 194)" strokeWidth={2} strokeLinejoin="round" />

      {tradeClose !== null ? (
        <g>
          <circle cx={x(traded)} cy={y(tradeClose)} r={6} className={dotClass} stroke="white" strokeWidth={2} />
          <text
            x={labelX(x(traded)).x}
            y={y(tradeClose) + (filedClose !== null && filedClose < tradeClose ? -10 : 18)}
            textAnchor={labelX(x(traded)).anchor}
            className="fill-ink text-[12px] font-semibold"
          >
            Traded {money(tradeClose)}
          </text>
        </g>
      ) : null}

      {filedIn && filedClose !== null ? (
        <g>
          <circle cx={x(filedIn)} cy={y(filedClose)} r={6} fill="white" stroke="rgb(58 130 194)" strokeWidth={3} />
          <text
            x={labelX(x(filedIn)).x}
            y={y(filedClose) + (tradeClose !== null && filedClose < tradeClose ? 18 : -10)}
            textAnchor={labelX(x(filedIn)).anchor}
            className="fill-ink text-[12px] font-semibold"
          >
            Disclosed {money(filedClose)}
          </text>
        </g>
      ) : null}

      <text x={PAD_LEFT} y={HEIGHT - 8} className="fill-ink-faint text-[12px]">
        {shortDay(points[0].d)}
      </text>
      <text x={width - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end" className="fill-ink-faint text-[12px]">
        {shortDay(points[points.length - 1].d)}
      </text>
    </svg>
  );
}
