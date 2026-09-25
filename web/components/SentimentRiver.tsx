"use client";

import { useEffect, useMemo, useState } from "react";
import { compactUSD } from "@/lib/format";
import type { RiverData, RiverWeek } from "@/lib/sentiment";

/**
 * What Congress bought and sold, week by week, with the balance drawn through
 * the middle of it.
 *
 * Purchases swell above the centre line and sales below, so the size of a week
 * is its thickness. The spine running through is an eight-week net tilt —
 * where the balance is leaning — and it carries the colour, so the ribbon
 * reads as direction as well as volume.
 *
 * Two readings of the same weeks, toggled: by value, where one large sale
 * outweighs dozens of small purchases, and by trade count, where every
 * decision weighs the same. They usually agree; a week where they don't is a
 * week where a few big trades are pulling against the crowd.
 *
 * Plain SVG, no chart library — same reasoning as the flow charts on the
 * member and issuer pages.
 */

type Mode = "value" | "count";

/**
 * Two shapes of the same river. A single viewBox cannot serve both: 960x260
 * scaled into a 309px phone column is an 84px sliver, and a phone-shaped box
 * stretched across a desktop card is a letterbox. The phone variant also
 * drops to a single year, because 109 weekly slices in 309px is under 3px a
 * week.
 */
const LAYOUT = {
  wide: { W: 960, H: 260, weeks: Infinity },
  narrow: { W: 420, H: 300, weeks: 52 },
} as const;
/** The rolling window for the spine. Shorter jitters, longer flattens the turns. */
const SPINE_WEEKS = 8;
const DEADLINE_DAYS = 45;

const compactCount = new Intl.NumberFormat("en-US");

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** Red through slate to green, so the number and the ink always agree. */
function sentimentColor(v: number): string {
  const t = (Math.max(-1, Math.min(1, v)) + 1) / 2;
  return t < 0.5
    ? `rgb(${lerp(244, 100, t * 2)},${lerp(63, 116, t * 2)},${lerp(94, 139, t * 2)})`
    : `rgb(${lerp(100, 52, (t - 0.5) * 2)},${lerp(116, 211, (t - 0.5) * 2)},${lerp(139, 153, (t - 0.5) * 2)})`;
}

/** The words come from the number, so they can never contradict it. */
function headline(v: number): string {
  const size = Math.abs(v);
  if (size < 0.03) return "Congress is evenly split";
  const side = v > 0 ? "Congress is buying" : "Congress is selling";
  if (size < 0.1) return `${side}, narrowly`;
  if (size >= 0.25) return `${side}, heavily`;
  return side;
}

function smooth(points: [number, number][]): string {
  return points
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
      const [px, py] = points[i - 1];
      const cx = (px + x) / 2;
      return `C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

function River({ weeks: allWeeks, mode, variant }: { weeks: RiverWeek[]; mode: Mode; variant: keyof typeof LAYOUT }) {
  const { W, H, weeks: maxWeeks } = LAYOUT[variant];
  const weeks = allWeeks.slice(-Math.min(allWeeks.length, maxWeeks));
  const PAD = { l: variant === "wide" ? 56 : 42, r: 18, t: 22, b: 34 };
  const PLOT_W = W - PAD.l - PAD.r;
  const PLOT_H = H - PAD.t - PAD.b;
  const MID = PAD.t + PLOT_H / 2;
  const up = (w: RiverWeek) => (mode === "value" ? w.buyValue : w.buyCount);
  const down = (w: RiverWeek) => (mode === "value" ? w.sellValue : w.sellCount);
  const fmt = (n: number) => (mode === "value" ? compactUSD.format(n) : compactCount.format(Math.round(n)));

  const peak = Math.max(1, ...weeks.map((w) => Math.max(up(w), down(w))));
  const x = (i: number) => PAD.l + (i / Math.max(1, weeks.length - 1)) * PLOT_W;
  const scale = (v: number) => (v / peak) * (PLOT_H / 2 - 8);

  const spine = weeks.map((_, i) => {
    const slice = weeks.slice(Math.max(0, i - SPINE_WEEKS + 1), i + 1);
    const b = slice.reduce((s, w) => s + up(w), 0);
    const l = slice.reduce((s, w) => s + down(w), 0);
    return b + l > 0 ? (b - l) / (b + l) : 0;
  });

  // Weeks after this may legally still be unfiled, so the river there is
  // incomplete by definition — drawn hatched rather than as a real decline.
  const cutoff = new Date(Date.now() - DEADLINE_DAYS * 86400000).toISOString().slice(0, 10);
  const pendingFrom = weeks.findIndex((w) => w.week > cutoff);
  const pendingX = pendingFrom >= 0 ? x(pendingFrom) : null;

  const slot = PLOT_W / Math.max(1, weeks.length);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img"
      aria-label={`Congressional trading by week: purchases above the line, sales below, ${mode === "value" ? "sized by disclosed value" : "counted per trade"}.`}>
      <defs>
        <linearGradient id={`riverBuy-${mode}-${variant}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={`riverSell-${mode}-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.72" />
        </linearGradient>
        <pattern id={`riverPending-${mode}-${variant}`} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" className="fill-panel" fillOpacity="0.7" />
          <line x1="0" y1="0" x2="0" y2="6" className="stroke-line-strong" strokeWidth="2" />
        </pattern>
      </defs>

      {weeks.map((w, i) => (
        <rect key={`wash-${variant}-${w.week}`} x={(x(i) - slot / 2).toFixed(1)} y={PAD.t} width={slot.toFixed(1)} height={PLOT_H}
          fill={sentimentColor(spine[i])} fillOpacity="0.055" />
      ))}

      <path d={`${smooth(weeks.map((w, i) => [x(i), MID - scale(up(w))]))}L${x(weeks.length - 1).toFixed(1)},${MID}L${x(0).toFixed(1)},${MID}Z`} fill={`url(#riverBuy-${mode}-${variant})`} />
      <path d={`${smooth(weeks.map((w, i) => [x(i), MID + scale(down(w))]))}L${x(weeks.length - 1).toFixed(1)},${MID}L${x(0).toFixed(1)},${MID}Z`} fill={`url(#riverSell-${mode}-${variant})`} />

      {pendingX !== null && (
        <>
          <rect x={pendingX.toFixed(1)} y={PAD.t} width={(W - PAD.r - pendingX).toFixed(1)} height={PLOT_H} fill={`url(#riverPending-${mode}-${variant})`} />
          <line x1={pendingX.toFixed(1)} x2={pendingX.toFixed(1)} y1={PAD.t} y2={H - PAD.b} className="stroke-ink-faint" strokeWidth="1.2" strokeDasharray="4 3" />
          <text x={(pendingX + 8).toFixed(1)} y={PAD.t + 13} className="fill-ink-muted" fontSize="10.5">still arriving</text>
        </>
      )}

      {weeks.map((_, i) =>
        i === 0 ? null : (
          <line key={`spine-${variant}-${weeks[i].week}`} x1={x(i - 1).toFixed(1)} y1={(MID - spine[i - 1] * (PLOT_H / 2 - 12) * 0.6).toFixed(1)}
            x2={x(i).toFixed(1)} y2={(MID - spine[i] * (PLOT_H / 2 - 12) * 0.6).toFixed(1)}
            stroke={sentimentColor(spine[i])} strokeWidth="2.6" strokeLinecap="round" />
        )
      )}

      <line x1={PAD.l} x2={W - PAD.r} y1={MID} y2={MID} className="stroke-panel" strokeWidth="1" />

      {weeks.map((w, i) => (
        <rect key={`hit-${variant}-${w.week}`} x={(x(i) - slot / 2).toFixed(1)} y={PAD.t} width={slot.toFixed(1)} height={PLOT_H} fill="transparent">
          <title>
            {`Week of ${w.week}\nBought ${fmt(up(w))} · Sold ${fmt(down(w))}\n${w.members} member${w.members === 1 ? "" : "s"} · balance ${spine[i] >= 0 ? "+" : ""}${spine[i].toFixed(2)}`}
          </title>
        </rect>
      ))}

      {weeks.map((w, i) =>
        (variant === "wide" ? ["01", "04", "07", "10"] : ["01", "07"]).includes(w.week.slice(5, 7)) && w.week.slice(8) <= "07" ? (
          <text key={`tick-${variant}-${w.week}`} x={x(i).toFixed(1)} y={H - 12} textAnchor="middle" className="fill-ink-faint" fontSize="10">
            {w.week.slice(0, 7)}
          </text>
        ) : null
      )}

      <text x={PAD.l - 8} y={(MID - scale(peak) + 4).toFixed(1)} textAnchor="end" className="fill-ink-faint" fontSize="10">{fmt(peak)}</text>
      <text x={PAD.l - 8} y={MID + 4} textAnchor="end" className="fill-ink-faint" fontSize="10">0</text>
      <text x={PAD.l - 8} y={(MID + scale(peak) + 4).toFixed(1)} textAnchor="end" className="fill-ink-faint" fontSize="10">{fmt(peak)}</text>
    </svg>
  );
}

function Dial({ value }: { value: number }) {
  const r = 46;
  const cx = 60;
  const cy = 60;
  const angle = -Math.PI / 2 + Math.max(-1, Math.min(1, value)) * (Math.PI / 2) * 0.92;
  return (
    <svg viewBox="0 6 120 60" className="h-[52px] w-[104px] shrink-0" aria-hidden>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx},${cy - r}`} fill="none" stroke="#f43f5e" strokeOpacity="0.3" strokeWidth="10" strokeLinecap="round" />
      <path d={`M${cx},${cy - r} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="#34d399" strokeOpacity="0.3" strokeWidth="10" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={(cx + r * 0.78 * Math.cos(angle)).toFixed(1)} y2={(cy + r * 0.78 * Math.sin(angle)).toFixed(1)}
        stroke={sentimentColor(value)} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={sentimentColor(value)} />
    </svg>
  );
}

export function SentimentRiver() {
  const [data, setData] = useState<RiverData | null>(null);
  const [mode, setMode] = useState<Mode>("value");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sentiment")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RiverData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const reading = useMemo(() => {
    if (!data) return null;
    const s = data.settled;
    const b = mode === "value" ? s.buyValue : s.buyCount;
    const l = mode === "value" ? s.sellValue : s.sellCount;
    return { value: b + l > 0 ? (b - l) / (b + l) : 0, bought: b, sold: l };
  }, [data, mode]);

  if (!data || !reading) {
    return <div className="mb-4 h-[360px] animate-pulse rounded-xl border border-line bg-panel sm:mb-6" />;
  }

  const fmt = (n: number) => (mode === "value" ? compactUSD.format(n) : compactCount.format(Math.round(n)));

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-line bg-panel sm:mb-6">
      <div className="flex flex-col gap-5 border-b border-line px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">Congressional trading flow</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">{headline(reading.value)}</h2>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-ink-muted sm:text-sm">
            {mode === "value"
              ? "Purchases swell above the line, sales below, both sized by the value disclosed. The line through the middle is how far the balance has tipped over the previous eight weeks."
              : "The same weeks, but every trade counts once regardless of size — the balance of decisions rather than dollars."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-2.5">
          <div className="flex items-center gap-2.5">
            <Dial value={reading.value} />
            <div className="sm:text-right">
              <div className="text-3xl font-bold leading-none tracking-tight sm:text-4xl" style={{ color: sentimentColor(reading.value) }}>
                {reading.value >= 0 ? "+" : ""}
                {reading.value.toFixed(2)}
              </div>
              <div className="mt-1.5 text-[11px] font-semibold leading-none text-ink-muted">
                net {reading.value >= 0 ? "buying" : "selling"}
              </div>
            </div>
          </div>
          <p className="text-[11px] leading-none text-ink-faint sm:whitespace-nowrap sm:text-right">
            {fmt(reading.bought)} bought · {fmt(reading.sold)} sold
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 pt-1 sm:px-6 sm:pb-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-1 rounded-full border border-line p-0.5 text-[11px]">
            {(["value", "count"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  mode === m ? "bg-panel-muted text-ink" : "text-ink-faint hover:text-ink-muted"
                }`}>
                {m === "value" ? "By value" : "By trades"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />Purchases</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />Sales</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-ink-faint" />Balance, 8-week</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm border border-line-strong" />Not yet disclosed</span>
          </div>
        </div>

        <div className="sm:hidden">
          <River weeks={data.weeks} mode={mode} variant="narrow" />
        </div>
        <div className="hidden sm:block">
          <River weeks={data.weeks} mode={mode} variant="wide" />
        </div>

        <p className="mt-3 text-[11px] leading-snug text-ink-faint">
          {mode === "value"
            ? "Read by money: one large sale outweighs dozens of small purchases, so this moves when someone large moves. Figures are the midpoint of each disclosed bracket — Congress never reports an exact amount."
            : "Read by decisions: forty small purchases now outweigh one large sale. Where this and the value reading disagree, a few big trades are pulling against the crowd."}{" "}
          The hatched tail is trading that has happened but need not be disclosed yet — the law allows 45 days — so the
          headline figure is taken from the last fully settled window, through {data.settled.settledThrough}.
        </p>
      </div>
    </section>
  );
}
