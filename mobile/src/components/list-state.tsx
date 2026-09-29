import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

/** Loading, failed and empty, said the same way on every screen. */
export function ListState({
  kind,
  title,
  body,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'empty';
  title?: string;
  body?: string | null;
  onRetry?: () => void;
}) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  if (kind === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  return (
    <ThemedView style={styles.centered}>
      {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
      {body ? <ThemedText style={[styles.body, { color: colors.textSecondary }]}>{body}</ThemedText> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.retry, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText style={styles.retryLabel}>Try again</ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  title: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  retry: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  retryLabel: { fontSize: 14, fontWeight: '600' },
});
