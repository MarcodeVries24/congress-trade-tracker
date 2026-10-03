import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { change, formatMove, formatPrice, type PricePoint } from '@/lib/prices';
import { useTheme } from '@/theme';
import { Text } from '@/ui/text';

// SVG text takes the browser's serif default on the web build; native uses
// the system face already.
const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' : undefined;

export interface ChartMarker {
  day: string;
  kind: 'buy' | 'sell' | 'filed';
  /** Shown in the readout when the finger is on this day: "Pelosi bought". */
  label?: string;
}

/**
 * A stock's daily closes as a line you can run a finger along, with trades
 * marked on it.
 *
 * Built for the one question the app asks of a price: what did it do around
 * a trade? `window` shades the stretch between a trade and its disclosure,
 * the days only the member knew, amber when it ran past the legal deadline.
 * Dragging sideways reads out the date, the close and whatever was traded
 * that day; scrolling up and down still scrolls the page.
 *
 * Plotted by trading day rather than calendar day, so weekends do not draw
 * flat steps.
 */
export function PriceChart({
  points,
  markers = [],
  window,
  height = 180,
  idle,
}: {
  points: PricePoint[];
  markers?: ChartMarker[];
  window?: { from: string; to: string; late?: boolean } | null;
  height?: number;
  /** The readout when no finger is on the chart. */
  idle?: ReactNode;
}) {
  const { c, scheme } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  // Unique per chart: on the web build, gradient ids share one document.
  const fillId = `fill${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const PAD_TOP = 14;
  const PAD_BOTTOM = 22;
  const PAD_RIGHT = 46;
  const plotW = Math.max(width - PAD_RIGHT, 1);
  const plotH = height - PAD_TOP - PAD_BOTTOM;

  const geo = useMemo(() => {
    if (points.length < 2 || !width) return null;
    const lo = Math.min(...points.map((p) => p.c));
    const hi = Math.max(...points.map((p) => p.c));
    const pad = (hi - lo) * 0.1 || hi * 0.05;
    const yMin = Math.max(0, lo - pad);
    const yMax = hi + pad;
    const x = (i: number) => (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD_TOP + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    let line = '';
    points.forEach((p, i) => {
      line += `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`;
    });
    const area = `${line}L${x(points.length - 1).toFixed(1)},${PAD_TOP + plotH}L0,${PAD_TOP + plotH}Z`;
    return { lo, hi, x, y, line, area };
  }, [points, width, plotW, plotH]);

  // The index of the last close on or before a day; -1 when the day is
  // before the series starts.
  const indexOf = useMemo(() => {
    return (day: string) => {
      let lo = 0;
      let hi = points.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (points[mid].d <= day) {
          found = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return found;
    };
  }, [points]);

  const placed = useMemo(
    () =>
      markers
        .map((m) => ({ ...m, i: indexOf(m.day) }))
        .filter((m) => m.i >= 0 && m.day <= points[points.length - 1]?.d),
    [markers, indexOf, points]
  );
  const markerDays = useMemo(() => new Set(placed.map((m) => m.i)), [placed]);

  const toIndex = (px: number) => Math.max(0, Math.min(points.length - 1, Math.round((px / plotW) * (points.length - 1))));
  const scrub = (px: number) => setActive(toIndex(px));

  // A tick under the finger as it crosses a trade.
  useEffect(() => {
    if (active !== null && markerDays.has(active)) haptic.select();
  }, [active, markerDays]);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((e) => scrub(e.x))
    .onUpdate((e) => scrub(e.x))
    .onFinalize(() => setActive(null));

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const first = points[0];
  const activePoint = active !== null ? points[active] : null;
  const activeMarkers = active !== null ? placed.filter((m) => m.i === active) : [];
  const activeMove = activePoint ? change(first?.c, activePoint.c) : null;

  const winFrom = window ? indexOf(window.from) : -1;
  const winTo = window ? indexOf(window.to) : -1;
  const shade = window?.late ? c.warn : c.accent;

  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        {activePoint ? (
          <View style={styles.readoutRow}>
            <Text variant="bodyStrong">{formatPrice(activePoint.c)}</Text>
            {activeMove !== null ? (
              <Text variant="footnote" tone={activeMove >= 0 ? 'gain' : 'loss'}>
                {formatMove(activeMove)}
              </Text>
            ) : null}
            <Text variant="footnote" tone="muted">
              {shortDate(activePoint.d)}
            </Text>
            {activeMarkers.length ? (
              <Text variant="footnote" style={styles.flex} numberOfLines={1}>
                {activeMarkers
                  .map((m) => m.label ?? m.kind)
                  .slice(0, 2)
                  .join(', ')}
                {activeMarkers.length > 2 ? ` +${activeMarkers.length - 2}` : ''}
              </Text>
            ) : null}
          </View>
        ) : (
          idle
        )}
      </View>
      <GestureDetector gesture={pan}>
        <View onLayout={onLayout} style={{ height }} collapsable={false}>
          {geo ? (
            <Svg width={width} height={height}>
              <Defs>
                <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={c.accent} stopOpacity={scheme === 'dark' ? 0.3 : 0.2} />
                  <Stop offset="1" stopColor={c.accent} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {winFrom >= 0 && winTo >= winFrom ? (
                <>
                  <Rect
                    x={geo.x(winFrom)}
                    y={PAD_TOP - 6}
                    width={Math.max(geo.x(winTo) - geo.x(winFrom), 2)}
                    height={plotH + 6}
                    fill={shade}
                    opacity={scheme === 'dark' ? 0.2 : 0.12}
                    rx={4}
                  />
                  {geo.x(winTo) - geo.x(winFrom) > 64 ? (
                    <SvgText
                      x={(geo.x(winFrom) + geo.x(winTo)) / 2}
                      y={PAD_TOP + 6}
                      fill={shade}
                      fontSize={10} fontFamily={FONT}
                      fontWeight="700"
                      textAnchor="middle">
                      NOT YET PUBLIC
                    </SvgText>
                  ) : null}
                </>
              ) : null}

              {/* Where the range started, so up and down read at a glance. */}
              <Line
                x1={0}
                x2={plotW}
                y1={geo.y(first.c)}
                y2={geo.y(first.c)}
                stroke={c.borderStrong}
                strokeDasharray="2 4"
                strokeWidth={1}
              />

              <Path d={geo.area} fill={`url(#${fillId})`} />
              <Path d={geo.line} fill="none" stroke={c.accent} strokeWidth={2} strokeLinejoin="round" />

              {placed.map((m, k) =>
                m.kind === 'filed' ? (
                  <Circle
                    key={k}
                    cx={geo.x(m.i)}
                    cy={geo.y(points[m.i].c)}
                    r={5}
                    fill={c.surface}
                    stroke={c.accent}
                    strokeWidth={2.5}
                  />
                ) : (
                  <Circle
                    key={k}
                    cx={geo.x(m.i)}
                    cy={geo.y(points[m.i].c)}
                    r={placed.length > 30 ? 3.5 : 5}
                    fill={m.kind === 'buy' ? c.gain : c.loss}
                    stroke={c.surface}
                    strokeWidth={1.5}
                  />
                )
              )}

              <SvgText x={width - 2} y={geo.y(geo.hi) + 4} fill={c.textFaint} fontSize={11} fontFamily={FONT} textAnchor="end">
                {formatPrice(geo.hi)}
              </SvgText>
              <SvgText x={width - 2} y={geo.y(geo.lo) + 4} fill={c.textFaint} fontSize={11} fontFamily={FONT} textAnchor="end">
                {formatPrice(geo.lo)}
              </SvgText>
              <SvgText x={0} y={height - 4} fill={c.textFaint} fontSize={11} fontFamily={FONT}>
                {shortDate(first.d)}
              </SvgText>
              <SvgText x={plotW} y={height - 4} fill={c.textFaint} fontSize={11} fontFamily={FONT} textAnchor="end">
                {shortDate(points[points.length - 1].d)}
              </SvgText>

              {activePoint && active !== null ? (
                <>
                  <Line
                    x1={geo.x(active)}
                    x2={geo.x(active)}
                    y1={PAD_TOP - 6}
                    y2={PAD_TOP + plotH}
                    stroke={c.textMuted}
                    strokeWidth={1}
                  />
                  <Circle
                    cx={geo.x(active)}
                    cy={geo.y(activePoint.c)}
                    r={6}
                    fill={c.accent}
                    stroke={c.surface}
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </Svg>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  readout: { minHeight: 22, justifyContent: 'center' },
  readoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  flex: { flex: 1, fontWeight: '600' },
});
