import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ionicons, because the same glyphs render on iOS, Android and the web preview. */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const { c } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? c.text} />;
}
