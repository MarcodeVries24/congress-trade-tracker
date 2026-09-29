import { Platform, useColorScheme } from 'react-native';

/**
 * The app's design tokens.
 *
 * One palette per scheme, one spacing scale, one set of radii and shadows, so
 * no screen invents its own grey. The look is a white, card-based app in the
 * manner of the consumer apps people already know how to use: a navy that
 * reads as serious and civic, and the flag's red kept for the one thing on
 * each screen that should draw the eye.
 */
const light = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F2F5',
  surfacePressed: '#E9ECF1',
  border: '#E5E8ED',
  borderStrong: '#D4D9E1',
  text: '#0D1B2E',
  textMuted: '#667085',
  textFaint: '#98A2B3',
  primary: '#0B2A4A',
  primaryText: '#FFFFFF',
  accent: '#E03A3E',
  accentSoft: '#FDECEC',
  gain: '#16A34A',
  gainSoft: '#E7F6EC',
  loss: '#DC2626',
  lossSoft: '#FDECEC',
  warn: '#B45309',
  warnSoft: '#FEF3C7',
  overlay: 'rgba(13, 27, 46, 0.45)',
  tabBar: '#FFFFFF',
  skeleton: '#E9ECF1',
};

const dark: typeof light = {
  background: '#0A0E14',
  surface: '#141A23',
  surfaceMuted: '#1B2330',
  surfacePressed: '#222C3A',
  border: '#232C39',
  borderStrong: '#2F3A4A',
  text: '#F3F5F8',
  textMuted: '#9AA4B2',
  textFaint: '#6B7686',
  primary: '#E8EEF6',
  primaryText: '#0B2A4A',
  accent: '#F0484C',
  accentSoft: '#3A1719',
  gain: '#34D17A',
  gainSoft: '#11291C',
  loss: '#F26464',
  lossSoft: '#331618',
  warn: '#F5B544',
  warnSoft: '#33260E',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: '#10151D',
  skeleton: '#1F2733',
};

export type Palette = typeof light;
export const palettes = { light, dark };

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 999 } as const;

/** Party colours, the same in both schemes because they are identity, not chrome. */
export const party = {
  democrat: '#2F6FEB',
  republican: '#E03A3E',
  independent: '#8B5CF6',
  unknown: '#98A2B3',
};

export function partyTone(name: string | null | undefined): string {
  const p = (name ?? '').trim().toLowerCase();
  if (p.startsWith('d')) return party.democrat;
  if (p.startsWith('r')) return party.republican;
  if (p.startsWith('i')) return party.independent;
  return party.unknown;
}

export const type = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.4 },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.2 },
  subhead: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  callout: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '400' as const },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.6 },
};
export type TypeVariant = keyof typeof type;

/** Soft, wide shadows: cards lift off the page rather than sitting on it. */
export const shadow = {
  card: Platform.select({
    ios: { shadowColor: '#0D1B2E', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
    default: { boxShadow: '0 6px 18px rgba(13,27,46,0.07)' },
  }),
  raised: Platform.select({
    ios: { shadowColor: '#0D1B2E', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
    android: { elevation: 8 },
    default: { boxShadow: '0 12px 32px rgba(13,27,46,0.16)' },
  }),
} as const;

export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: palettes[scheme] } as const;
}
