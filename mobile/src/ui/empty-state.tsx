import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { Text } from '@/ui/text';

/** An empty or failed state that says what to do next, not just that nothing is here. */
export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  action,
  onAction,
  compact,
}: {
  icon?: IconName;
  title: string;
  body?: string | null;
  action?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <View style={[styles.badge, { backgroundColor: c.surfaceMuted }]}>
        <Icon name={icon} size={28} color={c.textMuted} />
      </View>
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
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  center: { textAlign: 'center' },
  button: { marginTop: 10, alignSelf: 'center' },
});
