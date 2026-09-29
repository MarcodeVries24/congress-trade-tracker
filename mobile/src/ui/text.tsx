import { Text as RNText, type TextProps } from 'react-native';

import { type Palette, type TypeVariant, type as typeScale, useTheme } from '@/theme';

type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'gain' | 'loss' | 'inverse' | 'primary';

const TONES: Record<Tone, keyof Palette> = {
  default: 'text',
  muted: 'textMuted',
  faint: 'textFaint',
  accent: 'accent',
  gain: 'gain',
  loss: 'loss',
  inverse: 'primaryText',
  primary: 'primary',
};

/** Every piece of copy in the app, at one of the type scale's sizes. */
export function Text({
  variant = 'body',
  tone = 'default',
  color,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; tone?: Tone; color?: string }) {
  const { c } = useTheme();
  return <RNText style={[typeScale[variant], { color: color ?? c[TONES[tone]] }, style]} {...rest} />;
}
