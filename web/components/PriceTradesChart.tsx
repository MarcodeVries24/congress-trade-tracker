import type { PricePoint } from "@/lib/priceSeries";
import { change, formatMove } from "@/lib/priceMath";

/**
 * The stock's price, with every disclosed trade on it, and below it the gap
 * between each trade and the day the public was told about it.
 *
 * The top panel answers "what did they buy into, and what happened next": a
 * green dot for each purchase, a red one for each sale, on the price that day.
 * The lane underneath answers "and when did anyone else find out": a line from
 * each trade to its disclosure, amber when it ran past the 45 days the law
 * allows. Read together, a dot followed by a long line and a steep climb is
 * the whole story of a well-timed trade the public learned about too late.
 *
 * Plain SVG, rendered on the server like TradeFlowChart, with each dot's
 * details in a native tooltip, so the page stays readable to a crawler and
 * costs a phone nothing to draw.
 */

export interface ChartTrade {
  transaction_type: string;
  transaction_date: string | null;
  filing_date: string | null;
  who: string;
  amount: string | null;
  price_at_trade: number | null;
  price_at_filing: number | null;
}

// Drawn twice, at a phone's width and at a desktop's, with one shown by
// breakpoint: an SVG scales its text with it, so one canvas stretched across
// both would have labels too small on one or far too large on the other.
const NARROW = 680;
const WIDE = 1120;
const PRICE_H = 210;
const LANE_H = 50;
const GAP = 26;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;
const PAD_LEFT = 50;
const PAD_RIGHT = 12;
const HEIGHT = PAD_TOP + PRICE_H + GAP + LANE_H + PAD_BOTTOM;
const LATE_DAYS = 45;

const dayMs = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;
}

function monthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function PriceTradesChart({
  points,
  trades,
  ticker,
}: {
  points: PricePoint[];
  trades: ChartTrade[];
  ticker: string;
}) {
  if (points.length < 10) return null;
  return (
    <>
      <div className="lg:hidden">
        <Chart points={points} trades={trades} ticker={ticker} width={NARROW} />
      </div>
      <div className="hidden lg:block">
        <Chart points={points} trades={trades} ticker={ticker} width={WIDE} />
      </div>
    </>
  );
}

function Chart({
  points,
  trades,
  ticker,
  width: WIDTH,
}: {
  points: PricePoint[];
  trades: ChartTrade[];
  ticker: string;
  width: number;
}) {
  const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;

  const start = dayMs(points[0].d);
  const end = dayMs(points[points.length - 1].d);
  const span = Math.max(end - start, 1);
  const x = (d: string) => PAD_LEFT + ((dayMs(d) - start) / span) * PLOT_W;
  const inRange = (d: string | null): d is string => !!d && dayMs(d) >= start && dayMs(d) <= end;

  const lo = Math.min(...points.map((p) => p.c));
  const hi = Math.max(...points.map((p) => p.c));
  const pad = (hi - lo) * 0.08 || hi * 0.05;
  const yMin = Math.max(0, lo - pad);
  const yMax = hi + pad;
  const y = (c: number) => PAD_TOP + PRICE_H - ((c - yMin) / (yMax - yMin)) * PRICE_H;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.c).toFixed(1)}`).join("");
  const area = `${line}L${x(points[points.length - 1].d).toFixed(1)},${PAD_TOP + PRICE_H}L${PAD_LEFT},${PAD_TOP + PRICE_H}Z`;

  // Each trade's price is read off the series being drawn (the last close on
  // or before its date), not the stored closes, so the dots sit exactly on
  // the line and a ticker the price sync has not reached yet still has them.
  const closeOn = (day: string): number | null => {
    let lo = 0;
    let hi = points.length - 1;
    let found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].d <= day) {
        found = points[mid].c;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };
  const shown = trades
    .filter((t) => inRange(t.transaction_date) && /^[PS]/i.test(t.transaction_type))
    .map((t) => ({
      ...t,
      price_at_trade: closeOn(t.transaction_date!),
      price_at_filing: inRange(t.filing_date) ? closeOn(t.filing_date) : t.price_at_filing,
    }))
    .filter((t) => t.price_at_trade !== null);
  const laneTop = PAD_TOP + PRICE_H + GAP;
  // Each gap gets its own row in the lane, cycling, so overlapping ones stay
  // separable rather than painting one thick bar.
  const rows = Math.max(1, Math.min(8, shown.length));
  const rowH = LANE_H / rows;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + (yMax - yMin) * f);
  const months: number[] = [];
  const first = new Date(start);
  const cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1);
  // About one label per 110 units of width.
  const spanMonths = span / (30.4 * 86_400_000);
  const stepMonths = [1, 2, 3, 4, 6, 12].find((m) => spanMonths / m <= PLOT_W / 110) ?? 12;
  for (let m = cursor; m <= end;) {
    months.push(m);
    const d = new Date(m);
    m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + stepMonths, 1);
  }

  const lateCount = shown.filter(
    (t) =>
      t.filing_date && t.transaction_date && (dayMs(t.filing_date) - dayMs(t.transaction_date)) / 86_400_000 > LATE_DAYS
  ).length;

  return (
    <figure className="rounded-lg border border-line bg-panel p-4">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{ticker} price, with Congress&rsquo;s trades on it</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Purchase
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Sale
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-amber-500" /> Disclosed late
          </span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${ticker} daily closing price with ${shown.length} congressional trades marked`}
      >
        <defs>
          <linearGradient id={`area-${ticker}-${WIDTH}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(58 130 194)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(58 130 194)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text
              x={PAD_LEFT - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-faint text-[12px]"
            >
              {money(t)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#area-${ticker}-${WIDTH})`} />
        <path d={line} fill="none" stroke="rgb(58 130 194)" strokeWidth={2} strokeLinejoin="round" />

        {shown.map((t, i) => {
          const buy = /^P/i.test(t.transaction_type);
          const move = change(t.price_at_trade, t.price_at_filing);
          const days =
            t.filing_date && t.transaction_date
              ? Math.round((dayMs(t.filing_date) - dayMs(t.transaction_date)) / 86_400_000)
              : null;
          return (
            <circle
              key={i}
              cx={x(t.transaction_date!)}
              cy={y(t.price_at_trade!)}
              r={4.5}
              className={buy ? "fill-emerald-500" : "fill-rose-500"}
              stroke="white"
              strokeWidth={1.5}
            >
              <title>
                {`${t.who} ${buy ? "bought" : "sold"} on ${t.transaction_date} at ${money(t.price_at_trade!)}` +
                  (t.amount ? ` (${t.amount})` : "") +
                  (t.filing_date ? `. Disclosed ${t.filing_date}${days !== null ? `, ${days} days later` : ""}` : "") +
                  (move !== null ? `; the stock moved ${formatMove(move)} in between.` : ".")}
              </title>
            </circle>
          );
        })}

        <text x={PAD_LEFT} y={laneTop - 8} className="fill-ink-faint text-[12px]">
          Trade to disclosure
        </text>
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={laneTop + LANE_H}
          y2={laneTop + LANE_H}
          className="stroke-line"
        />
        {shown.map((t, i) => {
          if (!t.filing_date) return null;
          const from = x(t.transaction_date!);
          const to = Math.min(
            x(inRange(t.filing_date) ? t.filing_date : points[points.length - 1].d),
            WIDTH - PAD_RIGHT
          );
          const days = (dayMs(t.filing_date) - dayMs(t.transaction_date!)) / 86_400_000;
          const late = days > LATE_DAYS;
          const yy = laneTop + rowH * (i % rows) + rowH / 2;
          return (
            <g key={`gap-${i}`}>
              <line
                x1={from}
                x2={Math.max(to, from + 1)}
                y1={yy}
                y2={yy}
                strokeWidth={2}
                strokeLinecap="round"
                className={late ? "stroke-amber-500" : "stroke-ink-faint"}
                opacity={late ? 0.9 : 0.5}
              />
              <circle
                cx={from}
                cy={yy}
                r={2}
                className={/^P/i.test(t.transaction_type) ? "fill-emerald-500" : "fill-rose-500"}
              />
            </g>
          );
        })}

        {months.map((m) => (
          <text
            key={m}
            x={PAD_LEFT + ((m - start) / span) * PLOT_W}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-ink-faint text-[12px]"
          >
            {monthLabel(m)}
          </text>
        ))}
      </svg>
      <p className="mt-2 text-xs text-ink-faint">
        Daily closes
        {shown.length ? `, with the ${shown.length} trades in this window` : ""}. Each line underneath runs from a trade
        to the day it was disclosed
        {lateCount ? `; ${lateCount} took longer than the 45 days the law allows` : ""}. Hover a dot for the details.
      </p>
    </figure>
  );
}
