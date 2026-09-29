import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Switch, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListState } from '@/components/list-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { ApiError, createAlert, fetchAlerts, updateAlert, type Alert, type AlertList } from '@/lib/api';
import { rememberAlerts } from '@/lib/alert-cache';
import { memberDisplayNameFromFiledName, shortDate } from '@/lib/format';
import { answersAsAlertFilters, useOnboarding } from '@/lib/onboarding';
import { useAuthedRequest } from '@/lib/use-api';

const FREQUENCY_LABELS = { instant: 'As it happens', daily: 'Daily digest', weekly: 'Weekly digest' } as const;

/**
 * Saved alerts: each one a filter, emailed when a new filing matches it.
 *
 * The same alerts as the website's account page, read and written through the
 * same routes, so one made here shows up there and the other way round. They
 * are emails for now; push notifications come later, and the screen says so
 * rather than implying the phone will buzz.
 *
 * With no alerts yet, it offers to save the one the setup questions described,
 * which is what onboarding promised ("this becomes your first alert").
 */
export default function AlertsScreen() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const authed = useAuthedRequest();
  const { answers } = useOnboarding();

  const [data, setData] = useState<AlertList | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchAlerts(await authed());
      rememberAlerts(list.alerts);
      setData(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Something went wrong.'));
    } finally {
      setRefreshing(false);
    }
  }, [authed]);

  // On focus rather than on mount, so an alert saved in the editor is in the
  // list when the editor closes.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = async (alert: Alert, active: boolean) => {
    setData((prev) =>
      prev ? { ...prev, alerts: prev.alerts.map((a) => (a.id === alert.id ? { ...a, active } : a)) } : prev
    );
    try {
      await updateAlert(alert.id, { active }, await authed());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Could not update the alert.'));
      void load();
    }
  };

  const suggested = answersAsAlertFilters(answers);
  const suggestedName = answers.members.length
    ? `Trades by ${[...new Set(answers.members.map(memberDisplayNameFromFiledName))].slice(0, 2).join(' and ')}${
        new Set(answers.members.map(memberDisplayNameFromFiledName)).size > 2 ? ' and others' : ''
      }`
    : answers.chamber === 'both'
      ? 'Every new trade'
      : `Every new ${answers.chamber === 'house' ? 'House' : 'Senate'} trade`;

  const saveSuggested = async () => {
    setSaving(true);
    try {
      await createAlert({ name: suggestedName, frequency: 'instant', filters: suggested }, await authed());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Could not save the alert.'));
    } finally {
      setSaving(false);
    }
  };

  const top = { paddingTop: Platform.OS === 'web' ? 60 : insets.top + 8 };

  if (error instanceof ApiError && error.status === 401) {
    return (
      <ThemedView style={[styles.screen, top]}>
        <ListState
          kind="empty"
          title="Sign in to use alerts"
          body="Alerts belong to your account, so they work on the website too."
        />
        <Pressable onPress={() => router.push('/sign-in')} style={[styles.primary, styles.signIn]}>
          <ThemedText style={styles.primaryLabel}>Sign in</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!data) {
    return (
      <ThemedView style={[styles.screen, top]}>
        {error ? (
          <ListState kind="error" title="Couldn't load your alerts" body={error.message} onRetry={() => void load()} />
        ) : (
          <ListState kind="loading" />
        )}
      </ThemedView>
    );
  }

  const full = data.alerts.length >= data.maxAlerts;

  const header = (
    <View style={styles.header}>
      <ThemedText style={styles.title}>Alerts</ThemedText>
      <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
        {data.email
          ? `Emailed to ${data.email} when a new filing matches. Push notifications are coming.`
          : 'Add an email address to your account to receive alerts.'}
      </ThemedText>
      <Pressable
        disabled={full}
        onPress={() => router.push({ pathname: '/alert/[id]', params: { id: 'new' } })}
        style={[styles.primary, { opacity: full ? 0.5 : 1 }]}>
        <ThemedText style={styles.primaryLabel}>{full ? `Limit of ${data.maxAlerts} reached` : 'New alert'}</ThemedText>
      </Pressable>
      {error ? <ThemedText style={styles.error}>{error.message}</ThemedText> : null}

      {data.alerts.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText style={styles.cardTitle}>Your first alert</ThemedText>
          <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
            From your answers when you set up the app: {suggestedName.toLowerCase()}, emailed as it happens.
          </ThemedText>
          <Pressable
            disabled={saving}
            onPress={saveSuggested}
            style={[styles.secondary, { backgroundColor: colors.backgroundSelected, opacity: saving ? 0.6 : 1 }]}>
            <ThemedText style={styles.secondaryLabel}>{saving ? 'Saving…' : 'Save this alert'}</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: Alert }) => (
    <Pressable
      onPress={() => router.push({ pathname: '/alert/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1} style={styles.rowTitle}>
          {item.name}
        </ThemedText>
        <ThemedText numberOfLines={2} style={[styles.meta, { color: colors.textSecondary }]}>
          {item.summary}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
          {FREQUENCY_LABELS[item.frequency]} ·{' '}
          {item.sent_count
            ? `${item.sent_count} sent, last ${shortDate(item.last_sent_at?.slice(0, 10) ?? null)}`
            : 'nothing sent yet'}
        </ThemedText>
        {!item.active && item.paused_reason === 'subscription-ended' ? (
          <ThemedText style={styles.warning}>Paused because the subscription ended.</ThemedText>
        ) : null}
      </View>
      <Switch value={item.active} onValueChange={(v) => void toggle(item, v)} />
    </Pressable>
  );

  return (
    <ThemedView style={[styles.screen, top]}>
      <FlatList
        data={data.alerts}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={styles.list}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 32, gap: 8 },
  header: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  body: { fontSize: 14, lineHeight: 20 },
  primary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#3b7ddd',
  },
  primaryLabel: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  signIn: { marginHorizontal: 32, marginBottom: 48 },
  error: { fontSize: 13, color: '#d6455d' },
  card: { padding: 14, borderRadius: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: 10 },
  secondaryLabel: { fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 14,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 17 },
  warning: { fontSize: 12, color: '#d6455d' },
});
