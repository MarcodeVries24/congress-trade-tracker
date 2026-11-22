import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { createAlert, deleteAlert, previewAlert, updateAlert, type AlertFilters, type AlertFrequency } from '@/lib/api';
import { recallAlert } from '@/lib/alert-cache';
import { haptic } from '@/lib/haptics';
import { usePush } from '@/lib/push';
import { useAskForReview } from '@/lib/review-prompt';
import { countActive, fromAlertFilters, toAlertFilters, type TradeFilters } from '@/lib/trade-filters';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced } from '@/lib/use-paged';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { FilterFields } from '@/ui/filter-fields';
import { Icon, type IconName } from '@/ui/icon';
import { PushPrimer } from '@/ui/push-primer';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const FREQUENCIES = [
  { key: 'instant', label: 'As it happens' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
] as const;

const FREQUENCY_HINTS: Record<AlertFrequency, string> = {
  instant: 'When a matching filing is published. CongTrade is updated daily.',
  daily: 'At most once a day, everything that matched in one go.',
  weekly: 'At most once a week. Nothing matched, nothing sent.',
};

function Heading({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={styles.heading}>
      <Text variant="headline">{children}</Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function Channel({
  icon,
  title,
  detail,
  value,
  onChange,
  divider,
}: {
  icon: IconName;
  title: string;
  detail: string;
  value: boolean;
  onChange: (on: boolean) => void;
  divider?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View
      style={[styles.channel, divider && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.channelIcon, { backgroundColor: value ? c.accentSoft : c.surfaceMuted }]}>
        <Icon name={icon} size={18} color={value ? c.accent : c.textMuted} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(on) => {
          haptic.select();
          onChange(on);
        }}
        trackColor={{ true: c.accent, false: c.borderStrong }}
        thumbColor="#FFFFFF"
        accessibilityLabel={title}
      />
    </View>
  );
}

/**
 * Making or changing one alert.
 *
 * Opened empty from the alerts list, or pre-filled from a member, a company, a
 * trade ("tell me when NVDA is traded") or a whole search on the Trades tab.
 * Every filter the website has is here, drawn by the same component as the
 * Trades tab's filter sheet, so an alert can be exactly any search.
 *
 * At the top, how it reaches you: a push notification on this phone, an
 * email, or both. Push for an alert needs notifications on for the phone,
 * and switching it on here asks for that first, with the same explanation as
 * the Alerts tab. The count at the bottom is the server running the query the
 * sender will.
 */
export default function AlertEditorScreen() {
  const params = useLocalSearchParams<{
    id: string;
    members?: string;
    tickers?: string;
    name?: string;
    filters?: string;
  }>();
  const { id } = params;
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const askForReview = useAskForReview();
  const push = usePush();
  const existing = id === 'new' ? undefined : recallAlert(id);

  // Where the editor starts: a saved alert, or what the opening screen handed
  // over (a whole filter set, or a member or a ticker).
  const [initial] = useState<TradeFilters>(() => {
    if (existing) return fromAlertFilters(existing.filters);
    let preset: AlertFilters = {};
    if (params.filters) {
      try {
        preset = JSON.parse(params.filters) as AlertFilters;
      } catch {
        // A malformed hand-over starts empty rather than failing.
      }
    }
    const members = params.members ? params.members.split('|').filter(Boolean) : undefined;
    return fromAlertFilters({
      ...preset,
      members: preset.members ?? members,
      tickers: preset.tickers ?? (params.tickers ? [params.tickers] : undefined),
    });
  });

  const [name, setName] = useState(existing?.name ?? params.name ?? '');
  const [draft, setDraft] = useState<TradeFilters>(initial);
  const [frequency, setFrequency] = useState<AlertFrequency>(existing?.frequency ?? 'instant');
  const [byEmail, setByEmail] = useState(existing ? existing.email_enabled !== false : true);
  // A new alert notifies this phone when the phone already has notifications on.
  const [byPush, setByPush] = useState(existing ? Boolean(existing.push_enabled) : push.enabled);
  const [primer, setPrimer] = useState(false);

  const [preview, setPreview] = useState<{ total: number; recent: number } | 'failed' | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether the Save button at the bottom is on screen. While it is not (the
  // filters make this a long screen), a Save button shows in the header, so
  // saving never needs a scroll to the end. Measured from the scroll position,
  // the visible height (which shrinks while the keyboard is up) and where the
  // button sits in the content.
  const [saveInView, setSaveInView] = useState(true);
  const view = useRef({ offset: 0, height: 0, saveBottom: 0 });
  const recheck = () => {
    const { offset, height, saveBottom } = view.current;
    if (!height || !saveBottom) return;
    const visible = offset + height >= saveBottom;
    setSaveInView((was) => (was === visible ? was : visible));
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    view.current.offset = e.nativeEvent.contentOffset.y;
    view.current.height = e.nativeEvent.layoutMeasurement.height;
    recheck();
  };
  const onViewport = (e: LayoutChangeEvent) => {
    view.current.height = e.nativeEvent.layout.height;
    recheck();
  };
  const onSaveLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    view.current.saveBottom = y + height;
    recheck();
  };

  const set = (patch: Partial<TradeFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const filters = useMemo<AlertFilters>(() => toAlertFilters(draft), [draft]);
  const criteria = countActive(draft) + (draft.q ? 1 : 0);

  const settled = useDebounced(filters, 500);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await previewAlert(settled, await authed());
        if (!cancelled) setPreview(result);
      } catch {
        if (!cancelled) setPreview('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settled, authed]);

  const togglePush = (on: boolean) => {
    if (!on) {
      if (!byEmail) {
        setError('An alert needs a way to reach you. Keep email on, or pause the alert from the list.');
        return;
      }
      setByPush(false);
      return;
    }
    setError(null);
    // The phone itself must be able to receive them first.
    if (push.enabled) setByPush(true);
    else setPrimer(true);
  };

  const toggleEmail = (on: boolean) => {
    if (!on && !byPush) {
      setError('An alert needs a way to reach you. Turn on push notifications first, or keep email.');
      return;
    }
    setError(null);
    setByEmail(on);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the alert a name.');
      return;
    }
    setError(null);
    setBusy('save');
    try {
      const body = { name: trimmed, frequency, filters, email: byEmail, push: byPush };
      if (existing) await updateAlert(existing.id, body, await authed());
      else await createAlert(body, await authed());
      haptic.success();
      router.back();
      // A new alert set up is a good moment to ask for a rating (if it is due).
      if (!existing) askForReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the alert.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirmDelete) {
      haptic.select();
      setConfirmDelete(true);
      return;
    }
    setError(null);
    setBusy('delete');
    try {
      await deleteAlert(existing.id, await authed());
      haptic.commit();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the alert.');
    } finally {
      setBusy(null);
    }
  };

  if (id !== 'new' && !existing) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <EmptyState icon="notifications-outline" title="This alert isn't loaded" body="Open it from your alerts." />
      </View>
    );
  }

  const pushDetail = push.unsupported
    ? push.unsupported
    : byPush && !push.enabled
      ? 'Notifications are off on this phone, so this goes to your other phones only.'
      : 'A notification on this phone, and any other phone you have them on for.';

  const headerSave = (
    <Tap
      onPress={save}
      disabled={busy !== null}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={existing ? 'Save changes' : 'Save alert'}
      style={[styles.headerSave, { backgroundColor: c.primary }]}>
      {busy === 'save' ? (
        <ActivityIndicator size="small" color={c.primaryText} />
      ) : (
        <Text variant="subhead" color={c.primaryText}>
          Save
        </Text>
      )}
    </Tap>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit alert' : 'New alert',
          // A small version of the Save button below: the same dark fill,
          // with rounded corners rather than iOS 26's round glass, which the
          // header would otherwise put around anything placed in it. On iOS
          // that takes a custom header item with the shared background
          // hidden; Android draws no background of its own.
          ...(saveInView
            ? { headerRight: undefined, unstable_headerRightItems: undefined }
            : Platform.OS === 'ios'
              ? {
                  unstable_headerRightItems: () => [
                    { type: 'custom' as const, element: headerSave, hidesSharedBackground: true },
                  ],
                }
              : { headerRight: () => headerSave }),
        }}
      />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={32}
          onLayout={onViewport}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name it, e.g. Pelosi's options"
            placeholderTextColor={c.textFaint}
            maxLength={80}
            style={[styles.name, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
          />

          <Heading>Notify me by</Heading>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Channel
              icon="phone-portrait-outline"
              title="Push notification"
              detail={pushDetail}
              value={byPush}
              onChange={togglePush}
              divider
            />
            <Channel
              icon="mail-outline"
              title="Email"
              detail={existing?.email ? `To ${existing.email}` : "To your account's email address"}
              value={byEmail}
              onChange={toggleEmail}
            />
          </View>

          <Heading hint={FREQUENCY_HINTS[frequency]}>How often</Heading>
          <ChipRow options={FREQUENCIES} value={frequency} onChange={setFrequency} inset={0} />

          <Heading
            hint={
              criteria
                ? 'A trade has to match every section you set; within one, any choice counts.'
                : 'Nothing set yet, so this alert covers every new trade.'
            }>
            What to watch
          </Heading>
          <View style={styles.fields}>
            <FilterFields draft={draft} set={set} mode="alert" />
          </View>

          <View style={[styles.preview, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.previewIcon, { backgroundColor: c.surfaceMuted }]}>
              <Icon name="pulse" size={20} color={c.primary} />
            </View>
            <View style={styles.flex}>
              {preview === 'failed' ? (
                <Text variant="callout" tone="muted">
                  Couldn&apos;t count the matches right now. The alert still works.
                </Text>
              ) : preview ? (
                <Text variant="callout">
                  Would have matched{' '}
                  <Text variant="callout" style={styles.strong}>
                    {preview.recent.toLocaleString()}
                  </Text>{' '}
                  {preview.recent === 1 ? 'trade' : 'trades'} filed in the last 90 days, and{' '}
                  {preview.total.toLocaleString()} in all.
                </Text>
              ) : (
                <ActivityIndicator />
              )}
            </View>
          </View>

          {error ? (
            <Text variant="caption" tone="loss">
              {error}
            </Text>
          ) : null}

          <View onLayout={onSaveLayout}>
            <Button
              label={existing ? 'Save changes' : 'Save alert'}
              loading={busy === 'save'}
              disabled={busy !== null}
              onPress={save}
            />
          </View>
          {existing ? (
            <Button
              label={confirmDelete ? 'Tap again to delete' : 'Delete alert'}
              kind="danger"
              loading={busy === 'delete'}
              disabled={busy !== null}
              onPress={remove}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <PushPrimer visible={primer} onClose={() => setPrimer(false)} onEnabled={() => setByPush(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerSave: {
    minWidth: 64,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  flex: { flex: 1, gap: 2 },
  heading: { gap: 2, paddingTop: 10, paddingHorizontal: 2 },
  name: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    fontWeight: '600',
  },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  channelIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  fields: { marginTop: -10 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
    marginTop: 6,
  },
  previewIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  strong: { fontWeight: '800' },
});
