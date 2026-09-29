import { memberDisplayName } from '@congtrade/shared/memberDisplay';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { Chips } from '@/components/chips';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import {
  createAlert,
  deleteAlert,
  fetchMemberOptions,
  previewAlert,
  updateAlert,
  type AlertFilters,
  type AlertFrequency,
  type MemberOption,
} from '@/lib/api';
import { recallAlert } from '@/lib/alert-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced } from '@/lib/use-paged';

const CHAMBERS = [
  { key: 'any', label: 'Both chambers' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
] as const;

const TYPES = [
  { key: 'any', label: 'Buys and sells' },
  { key: 'P', label: 'Purchases' },
  { key: 'S', label: 'Sales' },
] as const;

// A subset of the website's brackets: the thresholds people actually pick. An
// alert saved on the website with another floor gets a chip of its own.
const MIN_AMOUNTS: readonly { key: string; label: string }[] = [
  { key: 'any', label: 'Any amount' },
  { key: '15001', label: '$15K+' },
  { key: '50001', label: '$50K+' },
  { key: '250001', label: '$250K+' },
  { key: '1000001', label: '$1M+' },
];

const FREQUENCIES = [
  { key: 'instant', label: 'As it happens' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
] as const;

type ChamberKey = (typeof CHAMBERS)[number]['key'];
type TypeKey = (typeof TYPES)[number]['key'];

function Label({ children }: { children: string }) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return <ThemedText style={[styles.label, { color: colors.textSecondary }]}>{children}</ThemedText>;
}

/**
 * Making or changing one alert.
 *
 * The app edits the criteria people set on a phone: members, tickers,
 * chamber, buy or sell, and a minimum amount. An alert made on the website
 * can carry more (states, parties, owners, market cap), and those are kept as
 * they are rather than dropped, because the editor starts from the saved
 * filters and only overwrites the fields it shows.
 *
 * The count underneath is the server running the same query the sender will,
 * so a filter that would email twenty times a day is visible before saving.
 */
export default function AlertEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const authed = useAuthedRequest();
  const existing = id === 'new' ? undefined : recallAlert(id);

  const [name, setName] = useState(existing?.name ?? '');
  const [members, setMembers] = useState<string[]>(existing?.filters.members ?? []);
  const [tickers, setTickers] = useState((existing?.filters.tickers ?? []).join(', '));
  const [chamber, setChamber] = useState<ChamberKey>(
    existing?.filters.chambers?.length === 1 ? (existing.filters.chambers[0] as ChamberKey) : 'any'
  );
  const [type, setType] = useState<TypeKey>(
    existing?.filters.types?.length === 1 ? (existing.filters.types[0] as TypeKey) : 'any'
  );
  const savedMin = existing?.filters.minAmount;
  const minOptions = useMemo(
    () =>
      savedMin && !MIN_AMOUNTS.some((m) => m.key === String(savedMin))
        ? [...MIN_AMOUNTS, { key: String(savedMin), label: `$${savedMin.toLocaleString()}+` }]
        : MIN_AMOUNTS,
    [savedMin]
  );
  const [minAmount, setMinAmount] = useState<string>(savedMin ? String(savedMin) : 'any');
  const [frequency, setFrequency] = useState<AlertFrequency>(existing?.frequency ?? 'instant');

  const [options, setOptions] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [preview, setPreview] = useState<{ total: number; recent: number } | 'failed' | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMemberOptions({ signal: controller.signal })
      .then(setOptions)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const filters = useMemo<AlertFilters>(() => {
    const tickerList = tickers
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    // Start from what was saved so criteria this screen does not show survive.
    return {
      ...(existing?.filters ?? {}),
      members: members.length ? members : undefined,
      tickers: tickerList.length ? tickerList : undefined,
      chambers: chamber === 'any' ? undefined : [chamber],
      types: type === 'any' ? undefined : [type],
      minAmount: minAmount === 'any' ? undefined : Number(minAmount),
    };
  }, [existing, members, tickers, chamber, type, minAmount]);

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

  const pickedOptions = options.filter((o) => o.names.some((n) => members.includes(n)));
  const matches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => !o.names.some((n) => members.includes(n)))
      .filter((o) => memberDisplayName(o).toLowerCase().includes(q))
      .slice(0, 6);
  }, [options, memberQuery, members]);

  // One option can stand for several filed spellings, and the alert matches the
  // filed name exactly, so all of them go in together and come out together.
  const addMember = (o: MemberOption) => {
    setMembers((prev) => [...prev, ...o.names.filter((n) => !prev.includes(n))]);
    setMemberQuery('');
  };
  const removeMember = (o: MemberOption) => setMembers((prev) => prev.filter((n) => !o.names.includes(n)));

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the alert a name.');
      return;
    }
    setError(null);
    setBusy('save');
    try {
      if (existing) await updateAlert(existing.id, { name: trimmed, frequency, filters }, await authed());
      else await createAlert({ name: trimmed, frequency, filters }, await authed());
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the alert.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!existing) return;
    setError(null);
    setBusy('delete');
    try {
      await deleteAlert(existing.id, await authed());
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the alert.');
    } finally {
      setBusy(null);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }];

  if (id !== 'new' && !existing) {
    return (
      <ThemedView style={styles.missing}>
        <Stack.Screen options={{ title: 'Alert' }} />
        <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
          This alert is not loaded. Go back to the Alerts tab and open it from there.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: existing ? 'Edit alert' : 'New alert' }} />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Label>Name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pelosi's options"
            placeholderTextColor={colors.textSecondary}
            maxLength={80}
            style={inputStyle}
          />

          <Label>Members</Label>
          {pickedOptions.length ? (
            <View style={styles.picked}>
              {pickedOptions.map((o) => (
                <Pressable
                  key={o.bioguide_id ?? o.member_name}
                  onPress={() => removeMember(o)}
                  style={[styles.pill, { backgroundColor: colors.backgroundSelected }]}>
                  <ThemedText style={styles.pillLabel}>{memberDisplayName(o)} ✕</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput
            value={memberQuery}
            onChangeText={setMemberQuery}
            placeholder={pickedOptions.length ? 'Add another member' : 'Anyone, or search for a member'}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            style={inputStyle}
          />
          {matches.map((o) => (
            <Pressable
              key={o.bioguide_id ?? o.member_name}
              onPress={() => addMember(o)}
              style={[styles.match, { borderBottomColor: colors.backgroundElement }]}>
              <ThemedText style={styles.matchName}>{memberDisplayName(o)}</ThemedText>
              <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
                {o.trade_count.toLocaleString()} trades
              </ThemedText>
            </Pressable>
          ))}

          <Label>Tickers</Label>
          <TextInput
            value={tickers}
            onChangeText={setTickers}
            placeholder="Any, or e.g. NVDA, TSLA"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            style={inputStyle}
          />

          <Label>Chamber</Label>
          <View style={styles.chips}>
            <Chips options={CHAMBERS} value={chamber} onChange={setChamber} />
          </View>
          <Label>Type</Label>
          <View style={styles.chips}>
            <Chips options={TYPES} value={type} onChange={setType} />
          </View>
          <Label>Minimum amount</Label>
          <View style={styles.chips}>
            <Chips options={minOptions} value={minAmount} onChange={setMinAmount} />
          </View>
          <Label>Email me</Label>
          <View style={styles.chips}>
            <Chips options={FREQUENCIES} value={frequency} onChange={setFrequency} />
          </View>

          <View style={[styles.preview, { backgroundColor: colors.backgroundElement }]}>
            {preview === 'failed' ? (
              <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
                Couldn&apos;t count the matches right now. The alert still works.
              </ThemedText>
            ) : preview ? (
              <ThemedText style={styles.body}>
                Would have matched <ThemedText style={styles.strong}>{preview.recent.toLocaleString()}</ThemedText>{' '}
                {preview.recent === 1 ? 'trade' : 'trades'} filed in the last 90 days, and{' '}
                {preview.total.toLocaleString()} in all.
              </ThemedText>
            ) : (
              <ActivityIndicator />
            )}
          </View>

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <Pressable disabled={busy !== null} onPress={save} style={[styles.primary, { opacity: busy ? 0.6 : 1 }]}>
            {busy === 'save' ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.primaryLabel}>{existing ? 'Save changes' : 'Save alert'}</ThemedText>
            )}
          </Pressable>
          {existing ? (
            <Pressable disabled={busy !== null} onPress={remove} style={styles.delete}>
              <ThemedText style={styles.deleteLabel}>{busy === 'delete' ? 'Deleting…' : 'Delete alert'}</ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  missing: { flex: 1, padding: 24, justifyContent: 'center' },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  label: { marginTop: 10, fontSize: 13, fontWeight: '600' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  pillLabel: { fontSize: 13, fontWeight: '600' },
  match: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  matchName: { fontSize: 15 },
  meta: { fontSize: 12 },
  // The chip rows carry their own 16pt side padding, made for full-width
  // screens; cancelled here because this form is already inset.
  chips: { marginHorizontal: -16 },
  preview: { marginTop: 14, padding: 14, borderRadius: 12, minHeight: 52, justifyContent: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: '800' },
  error: { fontSize: 13, color: '#d6455d' },
  primary: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#3b7ddd',
  },
  primaryLabel: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  delete: { alignItems: 'center', paddingVertical: 14 },
  deleteLabel: { fontSize: 14, fontWeight: '600', color: '#d6455d' },
});
