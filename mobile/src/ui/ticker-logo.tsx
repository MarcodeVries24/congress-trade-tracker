import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { API_BASE } from '@/lib/api';
import { useTheme } from '@/theme';
import { Text } from '@/ui/text';

// Deep, saturated tones that all carry white text. Picked from the ticker by
// a hash, so a company always wears the same colour everywhere in the app,
// and the same one the website draws when it has no logo either.
const TONES = [
  '#101729',
  '#1D4ED8',
  '#0F766E',
  '#7C3AED',
  '#BE123C',
  '#B45309',
  '#15803D',
  '#334155',
  '#9D174D',
  '#3A82C2',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Tickers with no logo on file, so a long list asks about each one once per
// session rather than once per row it appears in.
const missing = new Set<string>();

const TICKER = /^[A-Z0-9.-]{1,12}$/;

/**
 * A company's logo, from the website's /api/logo (which redirects to the one
 * on file), over a lettered tile in the company's colour.
 *
 * The tile is drawn first and the logo fades in on top once it has loaded, so
 * a slow network shows the tile rather than a blank, and a ticker with no
 * logo (funds, most bonds, delisted names) simply keeps it. Logos sit on
 * white in both schemes, as on the website: most are drawn for a white page.
 *
 * Callers pass an asset's name when it has no ticker; that only ever gets
 * the tile.
 */
export function TickerLogo({ ticker, size = 44 }: { ticker: string | null; size?: number }) {
  // Keyed, so a row that is handed another company starts over rather than
  // showing the last one's "loaded".
  return <Mark key={ticker ?? ''} ticker={ticker} size={size} />;
}

function Mark({ ticker, size }: { ticker: string | null; size: number }) {
  const { scheme, c } = useTheme();
  const symbol = (ticker ?? '').trim().toUpperCase();
  const remote = TICKER.test(symbol) && !missing.has(symbol);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const label =
    (ticker ?? '?')
      .replace(/[^A-Z0-9.]/gi, '')
      .slice(0, 4)
      .toUpperCase() || '?';
  const bg = TONES[hash(label) % TONES.length];
  const fontSize = label.length <= 2 ? size * 0.38 : label.length === 3 ? size * 0.3 : size * 0.25;
  const borderRadius = size * 0.3;
  const showLogo = remote && !failed;

  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius, backgroundColor: loaded && showLogo ? '#FFFFFF' : bg },
        // The navy and slate tones sink into a dark card without an edge, and
        // a white logo tile needs one on a white card.
        loaded && showLogo
          ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong }
          : scheme === 'dark'
            ? styles.edge
            : null,
      ]}>
      {!(loaded && showLogo) ? (
        <Text variant="bodyStrong" color="#FFFFFF" style={{ fontSize, lineHeight: fontSize * 1.2, fontWeight: '800' }}>
          {label}
        </Text>
      ) : null}
      {showLogo ? (
        <Image
          source={{ uri: `${API_BASE}/api/logo/${encodeURIComponent(symbol)}?fallback=none` }}
          style={[StyleSheet.absoluteFill, { opacity: loaded ? 1 : 0 }]}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={symbol}
          transition={loaded ? 180 : 0}
          onLoad={() => setLoaded(true)}
          onError={() => {
            missing.add(symbol);
            setFailed(true);
          }}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  edge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
});
