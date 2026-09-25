import type { MemberFlowQuarter } from "@/lib/members";
import { compactUSD } from "@/lib/format";

/**
 * A member's disclosed trading, quarter by quarter.
 *
 * Deliberately not a price chart. Everyone draws one of those, it needs a
 * market-data feed this project doesn't have, and it mostly tells you what
 * the market did rather than what the member did. This draws the two things
 * only a disclosure corpus knows:
 *
 *  - direction and size — purchases rise from the axis, sales fall below it,
 *    so a quarter of heavy selling is a shape rather than a number to read;
 *  - whether the public was told in time — the hatched part of each bar is
 *    the value disclosed more than 45 days after the trade, which is what
 *    the STOCK Act gives them.
 *
 * That second band is the point. Only 8.8% of the corpus is late, so most
 * members' bars are solid and the chart reads as pure activity — and then
 * someone like Alan Armstrong (701 of 707 trades late) renders almost
 * entirely hatched, and the page says so at a glance.
 *
 * Plain SVG, rendered on the server. These pages exist to be crawled, and a
 * client-side chart library would leave a hole in the HTML on exactly the
 * pages built for search traffic — as well as costing every phone a download
 * to draw a few dozen rectangles.
 */

const WIDTH = 900;
const HEIGHT = 260;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PAD_LEFT = 54;
const PAD_RIGHT = 8;

const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const MID_Y = PAD_TOP + PLOT_H / 2;
const HALF_H = PLOT_H / 2;

/** Below this there is no shape to see, only noise. */
const MIN_QUARTERS = 2;

function quarterLabel(q: string): string {
  const [year, quarter] = q.split("-");
  return `${quarter} ’${year.slice(2)}`;
}

export function TradeFlowChart({ quarters, memberName }: { quarters: MemberFlowQuarter[]; memberName: string }) {
  if (quarters.length < MIN_QUARTERS) return null;

  const peak = Math.max(...quarters.map((q) => Math.max(q.buy, q.sell)), 1);
  const scale = (value: number) => (value / peak) * HALF_H;

  const slot = PLOT_W / quarters.length;
  const barW = Math.max(3, Math.min(34, slot * 0.62));

  const totals = quarters.reduce(
    (acc, q) => ({
      buy: acc.buy + q.buy,
      sell: acc.sell + q.sell,
      trades: acc.trades + q.trades,
      lateTrades: acc.lateTrades + q.lateTrades,
    }),
    { buy: 0, sell: 0, trades: 0, lateTrades: 0 }
  );
  const latePct = totals.trades > 0 ? Math.round((totals.lateTrades / totals.trades) * 100) : 0;

  // Only label every Nth quarter, or the axis becomes a smear.
  const labelEvery = Math.ceil(quarters.length / 10);

  return (
    <figure className="mt-5 border-t border-line pt-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Trading flow · last {quarters.length} quarters
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
            Purchases
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />
            Sales
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm border border-amber-500/70 bg-amber-500/25" />
            Disclosed late
          </span>
        </div>
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label={`Quarterly disclosed trading by ${memberName}: purchases above the line, sales below, with the portion filed more than 45 days late hatched.`}
      >
        <defs>
          {/* The late portion is drawn as a hatch rather than a second colour
              so it reads as "part of this bar", not a third category. */}
          <pattern id="late-hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="rgb(245 158 11 / 0.22)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="rgb(245 158 11 / 0.85)" strokeWidth="2" />
          </pattern>
        </defs>

        {[1, 0.5].map((f) => (
          <g key={f}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={MID_Y - HALF_H * f} y2={MID_Y - HALF_H * f} className="stroke-line" strokeWidth="1" />
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={MID_Y + HALF_H * f} y2={MID_Y + HALF_H * f} className="stroke-line" strokeWidth="1" />
            <text x={PAD_LEFT - 8} y={MID_Y - HALF_H * f + 4} textAnchor="end" className="fill-ink-faint" fontSize="11">
              {compactUSD.format(peak * f)}
            </text>
            <text x={PAD_LEFT - 8} y={MID_Y + HALF_H * f + 4} textAnchor="end" className="fill-ink-faint" fontSize="11">
              {compactUSD.format(peak * f)}
            </text>
          </g>
        ))}

        {quarters.map((q, i) => {
          const x = PAD_LEFT + slot * i + (slot - barW) / 2;
          const buyH = scale(q.buy);
          const sellH = scale(q.sell);
          const buyLateH = scale(Math.min(q.buyLate, q.buy));
          const sellLateH = scale(Math.min(q.sellLate, q.sell));
          const title =
            `${quarterLabel(q.quarter)} — ${q.trades.toLocaleString()} trade${q.trades === 1 ? "" : "s"}` +
            `\nBought ${compactUSD.format(q.buy)} · Sold ${compactUSD.format(q.sell)}` +
            (q.lateTrades > 0 ? `\n${q.lateTrades.toLocaleString()} filed late` : "\nAll filed on time");
          return (
            <g key={q.quarter}>
              <title>{title}</title>
              {/* Full-height hit area, so the tooltip works on a thin bar. */}
              <rect x={PAD_LEFT + slot * i} y={PAD_TOP} width={slot} height={PLOT_H} fill="transparent" />
              {q.buy > 0 && <rect x={x} y={MID_Y - buyH} width={barW} height={buyH} className="fill-emerald-500" rx="1" />}
              {buyLateH > 0 && <rect x={x} y={MID_Y - buyH} width={barW} height={buyLateH} fill="url(#late-hatch)" rx="1" />}
              {q.sell > 0 && <rect x={x} y={MID_Y} width={barW} height={sellH} className="fill-rose-500" rx="1" />}
              {sellLateH > 0 && <rect x={x} y={MID_Y + sellH - sellLateH} width={barW} height={sellLateH} fill="url(#late-hatch)" rx="1" />}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={HEIGHT - 12} textAnchor="middle" className="fill-ink-faint" fontSize="11">
                  {quarterLabel(q.quarter)}
                </text>
              )}
            </g>
          );
        })}

        <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={MID_Y} y2={MID_Y} className="stroke-line-strong" strokeWidth="1.5" />
      </svg>

      <p className="mt-2 text-[11px] leading-snug text-ink-faint">
        Purchases above the line, sales below, sized by the midpoint of each disclosed bracket. Hatching marks value the
        public learned about more than 45 days after the trade, the deadline the STOCK Act sets —{" "}
        {latePct > 0 ? (
          <>
            <span className="text-amber-500">{latePct}% of these trades were filed late</span>.
          </>
        ) : (
          <>every trade here was filed on time.</>
        )}
      </p>
    </figure>
  );
}
