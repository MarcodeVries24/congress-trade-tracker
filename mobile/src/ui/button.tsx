import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

type Kind = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

/** The app's buttons. Primary is navy, accent is the flag red and is used once per screen at most. */
export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  size = 'lg',
  style,
}: {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = {
    primary: c.primary,
    accent: c.accent,
    secondary: c.surfaceMuted,
    ghost: 'transparent',
    danger: c.lossSoft,
  }[kind];
  const fg = {
    primary: c.primaryText,
    accent: '#FFFFFF',
    secondary: c.text,
    ghost: c.text,
    danger: c.loss,
  }[kind];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      feedback="tap"
      style={[styles.base, size === 'lg' ? styles.lg : styles.md, { backgroundColor: bg }, style]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'lg' ? 19 : 17} color={fg} /> : null}
          <Text variant={size === 'lg' ? 'bodyStrong' : 'callout'} color={fg} style={styles.label}>
            {label}
          </Text>
        </View>
      )}
    </Tap>
  );
}

/** A round icon-only button, for headers. */
export function IconButton({
  name,
  onPress,
  label,
  tone = 'plain',
  size = 40,
}: {
  name: IconName;
  onPress?: () => void;
  label: string;
  tone?: 'plain' | 'filled';
  size?: number;
}) {
  const { c } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      feedback="tap"
      scaleTo={0.9}
      hitSlop={6}
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'filled'
          ? { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }
          : null,
      ]}>
      <Icon name={name} size={size * 0.52} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  lg: { minHeight: 54, paddingHorizontal: 20 },
  md: { minHeight: 42, paddingHorizontal: 16, borderRadius: radius.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '700' },
  icon: { alignItems: 'center', justifyContent: 'center' },
});
