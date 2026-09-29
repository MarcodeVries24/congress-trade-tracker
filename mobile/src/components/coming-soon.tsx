import { StyleSheet, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

/**
 * An honest placeholder. A tab that exists but does nothing yet says so,
 * rather than showing an empty list that reads as a failure.
 */
export function ComingSoon({ title, body }: { title: string; body: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <ThemedView style={styles.screen}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText style={[styles.body, { color: Colors[scheme].textSecondary }]}>{body}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  title: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
