import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Cong, type CongMood } from '@/ui/cong';
import { Icon, type IconName } from '@/ui/icon';
import { Text } from '@/ui/text';

// Which Cong goes with which situation, read off the icon every caller
// already picks, so every empty state in the app gets him without each one
// having to choose. An icon not listed keeps the plain icon badge.
const MOOD_FOR_ICON: Partial<Record<IconName, CongMood>> = {
  'cloud-offline-outline': 'offline',
  'search-outline': 'no-results',
  'funnel-outline': 'no-results',
  'newspaper-outline': 'all-quiet',
  'time-outline': 'all-quiet',
  'star-outline': 'following',
  'notifications-outline': 'turn-on-alerts',
  'document-text-outline': 'oops',
};

/** An empty or failed state that says what to do next, not just that nothing is here. */
export function EmptyState({
  icon = 'sparkles-outline',
  cong,
  title,
  body,
  action,
  onAction,
  compact,
}: {
  icon?: IconName;
  /** Cong's mood, when the icon's usual one does not fit; false for the plain icon. */
  cong?: CongMood | false;
  title: string;
  body?: string | null;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const { c } = useTheme();
  const mood = cong === false ? undefined : (cong ?? MOOD_FOR_ICON[icon]);
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {mood ? (
        <View style={styles.cong}>
          <Cong mood={mood} width={compact ? 84 : 104} />
        </View>
      ) : (
        <View style={[styles.badge, { backgroundColor: c.surfaceMuted }]}>
          <Icon name={icon} size={28} color={c.textMuted} />
        </View>
      )}
      <Text variant="subhead" style={styles.center}>
        {title}
      </Text>
      {body ? (
        <Text variant="callout" tone="muted" style={styles.center}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button label={action} onPress={onAction} size="md" style={styles.button} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 36, paddingVertical: 56 },
  compact: { paddingVertical: 28 },
  cong: { marginBottom: 2 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  center: { textAlign: 'center' },
  button: { marginTop: 10, alignSelf: 'center' },
});
