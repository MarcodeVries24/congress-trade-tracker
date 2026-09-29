import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Switch, View } from 'react-native';

import { ApiError, createAlert, fetchAlerts, updateAlert, type Alert, type AlertList } from '@/lib/api';
import { rememberAlerts } from '@/lib/alert-cache';
import { memberDisplayNameFromFiledName, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { answersAsAlertFilters, useOnboarding } from '@/lib/onboarding';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const FREQUENCY_LABELS = { instant: 'As it happens', daily: 'Daily digest', weekly: 'Weekly digest' } as const;

/**
 * Email alerts: each one a filter, emailed when a new filing matches it.
 *
 * The same alerts as the website's account page, through the same routes, so
 * one made here shows up there. With none yet, it offers to save the one the
 * setup questions described, which is what onboarding promised.
 */
export default function EmailAlertsScreen() {
  const { c } = useTheme();
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

  // On focus, so an alert saved in the editor is in the list when it closes.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = async (alert: Alert, active: boolean) => {
    haptic.select();
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
  const names = [...new Set(answers.members.map(memberDisplayNameFromFiledName))];
  const suggestedName = names.length
    ? `Trades by ${names.slice(0, 2).join(' and ')}${names.length > 2 ? ' and others' : ''}`
    : answers.chamber === 'both'
      ? 'Every new trade'
      : `Every new ${answers.chamber === 'house' ? 'House' : 'Senate'} trade`;

  const saveSuggested = async () => {
    setSaving(true);
    try {
      await createAlert({ name: suggestedName, frequency: 'instant', filters: suggested }, await authed());
      haptic.success();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Could not save the alert.'));
    } finally {
      setSaving(false);
    }
  };

  if (error instanceof ApiError && error.status === 401) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <EmptyState
          icon="mail-outline"
          title="Sign in to use email alerts"
          body="Alerts belong to your account, so they work on the website too."
          action="Sign in"
          onAction={() => router.push('/sign-in')}
        />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load your alerts"
            body={error.message}
            action="Try again"
            onAction={() => void load()}
          />
        ) : (
          <RowSkeleton count={4} />
        )}
      </View>
    );
  }

  const full = data.alerts.length >= data.maxAlerts;

  const header = (
    <View style={styles.header}>
      <Text variant="callout" tone="muted">
        {data.email
          ? `Sent to ${data.email} when a new filing matches. We check the disclosure sites every few hours.`
          : 'Add an email address to your account to receive alerts.'}
      </Text>
      <Button
        label={full ? `Limit of ${data.maxAlerts} reached` : 'New alert'}
        icon="add"
        disabled={full}
        onPress={() => router.push({ pathname: '/alert/[id]', params: { id: 'new' } })}
      />
      {error ? (
        <Text variant="caption" tone="loss">
          {error.message}
        </Text>
      ) : null}

      {data.alerts.length === 0 ? (
        <View style={[styles.suggest, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.suggestIcon, { backgroundColor: c.accentSoft }]}>
            <Icon name="sparkles" size={20} color={c.accent} />
          </View>
          <Text variant="subhead">Your first alert</Text>
          <Text variant="callout" tone="muted">
            From your answers when you set up the app: {suggestedName.toLowerCase()}, emailed as it happens.
          </Text>
          <Button label="Save this alert" kind="secondary" size="md" loading={saving} onPress={saveSuggested} />
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: Alert }) => (
    <Tap
      scaleTo={0.985}
      feedback="tap"
      onPress={() => router.push({ pathname: '/alert/[id]', params: { id: item.id } })}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: item.active ? c.gainSoft : c.surfaceMuted }]}>
        <Icon
          name={item.active ? 'notifications' : 'notifications-off-outline'}
          size={20}
          color={item.active ? c.gain : c.textMuted}
        />
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {item.summary}
        </Text>
        <Text variant="footnote" tone="faint">
          {FREQUENCY_LABELS[item.frequency]} ·{' '}
          {item.sent_count
            ? `${item.sent_count} sent, last ${shortDate(item.last_sent_at?.slice(0, 10) ?? null)}`
            : 'nothing sent yet'}
        </Text>
        {!item.active && item.paused_reason === 'subscription-ended' ? (
          <Text variant="footnote" tone="loss">
            Paused because the subscription ended.
          </Text>
        ) : null}
      </View>
      <Switch
        value={item.active}
        onValueChange={(v) => void toggle(item, v)}
        trackColor={{ true: c.gain, false: c.borderStrong }}
        thumbColor="#FFFFFF"
      />
    </Tap>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
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
            tintColor={c.textMuted}
          />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40, gap: 10 },
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 14 },
  suggest: { padding: 16, gap: 8, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  suggestIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 3 },
});
