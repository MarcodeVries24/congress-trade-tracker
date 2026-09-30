import { memberDisplayName, memberDisplayNameFromFiledName } from '@congtrade/shared/memberDisplay';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

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
import { activeChips } from '@/lib/trade-filters';
import { haptic } from '@/lib/haptics';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced } from '@/lib/use-paged';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="label" tone="faint" style={styles.fieldLabel}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

/**
 * Making or changing one email alert.
 *
 * Opened empty from the alerts list, or pre-filled from a member, a company or
 * a trade ("email me when NVDA is traded"). The app edits the criteria people
 * set on a phone; an alert made on the website can carry more (states,
 * parties, owners, market cap) and those are kept, because the editor starts
 * from the saved filters and only overwrites the fields it shows.
 *
 * The count underneath is the server running the same query the sender will.
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
  const existing = id === 'new' ? undefined : recallAlert(id);
  // A whole filter set handed over by the trades page ("get alerts for this
  // search"); the editor starts from it exactly as it would from a saved alert.
  const [preset] = useState<AlertFilters | undefined>(() => {
    if (!params.filters) return undefined;
    try {
      return JSON.parse(params.filters) as AlertFilters;
    } catch {
      return undefined;
    }
  });
  const base: AlertFilters | undefined = existing?.filters ?? preset;

  const [name, setName] = useState(existing?.name ?? params.name ?? '');
  const [members, setMembers] = useState<string[]>(
    base?.members ?? (params.members ? params.members.split('|').filter(Boolean) : [])
  );
  const [tickers, setTickers] = useState((base?.tickers ?? (params.tickers ? [params.tickers] : [])).join(', '));
  const [chamber, setChamber] = useState<ChamberKey>(
    base?.chambers?.length === 1 ? (base.chambers[0] as ChamberKey) : 'any'
  );
  const [type, setType] = useState<TypeKey>(base?.types?.length === 1 ? (base.types[0] as TypeKey) : 'any');
  const savedMin = base?.minAmount;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      ...(base ?? {}),
      members: members.length ? members : undefined,
      tickers: tickerList.length ? tickerList : undefined,
      // "Any" here only means this screen's single choice is unset; a saved
      // combination it cannot show (purchases and exchanges, say) is kept.
      chambers:
        chamber === 'any' ? (base?.chambers && base.chambers.length > 1 ? base.chambers : undefined) : [chamber],
      types: type === 'any' ? (base?.types && base.types.length > 1 ? base.types : undefined) : [type],
      minAmount: minAmount === 'any' ? undefined : Number(minAmount),
    };
  }, [base, members, tickers, chamber, type, minAmount]);

  // Criteria the alert carries that this screen does not edit, listed so an
  // alert made from a search, or on the website, says everything it matches.
  const hidden = useMemo(
    () =>
      activeChips({
        q: base?.q,
        parties: base?.parties,
        states: base?.states,
        owners: base?.owners,
        assetTypes: base?.assetTypes,
        amountRanges: base?.amountRanges,
        marketCapTiers: base?.marketCapTiers,
        filedStatus: base?.filedStatus,
      }),
    [base]
  );

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

  // A member pre-filled from their page may not be in the loaded options yet,
  // or may be filed under a spelling the options group differently; the chip
  // falls back to the filed name so nothing picked is ever invisible.
  const pickedOptions = options.filter((o) => o.names.some((n) => members.includes(n)));
  const unmatchedGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const n of members.filter((m) => !pickedOptions.some((o) => o.names.includes(m)))) {
      const display = memberDisplayNameFromFiledName(n);
      groups.set(display, [...(groups.get(display) ?? []), n]);
    }
    return [...groups.entries()];
  }, [members, pickedOptions]);
  const matches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => !o.names.some((n) => members.includes(n)))
      .filter((o) => memberDisplayName(o).toLowerCase().includes(q))
      .slice(0, 6);
  }, [options, memberQuery, members]);

  const addMember = (o: MemberOption) => {
    haptic.select();
    setMembers((prev) => [...prev, ...o.names.filter((n) => !prev.includes(n))]);
    setMemberQuery('');
  };
  const removeNames = (names: string[]) => setMembers((prev) => prev.filter((n) => !names.includes(n)));

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
      haptic.success();
      router.back();
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

  const input = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];

  if (id !== 'new' && !existing) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <EmptyState icon="mail-outline" title="This alert isn't loaded" body="Open it from the email alerts list." />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: existing ? 'Edit alert' : 'New alert' }} />
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Name">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Pelosi's options"
              placeholderTextColor={c.textFaint}
              maxLength={80}
              style={input}
            />
          </Field>

          <Field label="Members">
            {pickedOptions.length || unmatchedGroups.length ? (
              <View style={styles.picked}>
                {pickedOptions.map((o) => (
                  <Tap
                    key={o.bioguide_id ?? o.member_name}
                    onPress={() => removeNames(o.names)}
                    scaleTo={0.94}
                    style={[styles.token, { backgroundColor: c.primary }]}>
                    <Text variant="callout" color={c.primaryText} style={styles.bold}>
                      {memberDisplayName(o)}
                    </Text>
                    <Icon name="close" size={14} color={c.primaryText} />
                  </Tap>
                ))}
                {unmatchedGroups.map(([display, names]) => (
                  <Tap
                    key={display}
                    onPress={() => removeNames(names)}
                    scaleTo={0.94}
                    style={[styles.token, { backgroundColor: c.primary }]}>
                    <Text variant="callout" color={c.primaryText} style={styles.bold}>
                      {display}
                    </Text>
                    <Icon name="close" size={14} color={c.primaryText} />
                  </Tap>
                ))}
              </View>
            ) : null}
            <TextInput
              value={memberQuery}
              onChangeText={setMemberQuery}
              placeholder={pickedOptions.length ? 'Add another member' : 'Anyone, or search for a member'}
              placeholderTextColor={c.textFaint}
              autoCorrect={false}
              style={input}
            />
            {matches.length ? (
              <View style={[styles.matches, { backgroundColor: c.surface, borderColor: c.border }]}>
                {matches.map((o, i) => (
                  <Tap
                    key={o.bioguide_id ?? o.member_name}
                    onPress={() => addMember(o)}
                    scaleTo={0.99}
                    style={[
                      styles.match,
                      i < matches.length - 1 && {
                        borderBottomColor: c.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}>
                    <Text variant="bodyStrong">{memberDisplayName(o)}</Text>
                    <Text variant="caption" tone="muted">
                      {o.trade_count.toLocaleString()} trades
                    </Text>
                  </Tap>
                ))}
              </View>
            ) : null}
          </Field>

          <Field label="Tickers">
            <TextInput
              value={tickers}
              onChangeText={setTickers}
              placeholder="Any, or e.g. NVDA, TSLA"
              placeholderTextColor={c.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              style={input}
            />
          </Field>

          <Field label="Chamber">
            <ChipRow options={CHAMBERS} value={chamber} onChange={setChamber} inset={0} />
          </Field>
          <Field label="Type">
            <ChipRow options={TYPES} value={type} onChange={setType} inset={0} />
          </Field>
          <Field label="Minimum amount">
            <ChipRow options={minOptions} value={minAmount} onChange={setMinAmount} inset={0} />
          </Field>
          {hidden.length ? (
            <Field label="Also matching">
              <View style={styles.picked}>
                {hidden.map((chip) => (
                  <View key={chip.key} style={[styles.token, { backgroundColor: c.accentSoft }]}>
                    <Text variant="callout" tone="accent" style={styles.bold}>
                      {chip.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Field>
          ) : null}

          <Field label="Email me">
            <ChipRow options={FREQUENCIES} value={frequency} onChange={setFrequency} inset={0} />
          </Field>

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

          <Button
            label={existing ? 'Save changes' : 'Save alert'}
            loading={busy === 'save'}
            disabled={busy !== null}
            onPress={save}
          />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 20, paddingBottom: 56 },
  flex: { flex: 1 },
  field: { gap: 10 },
  fieldLabel: { paddingHorizontal: 2 },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  picked: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  token: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  bold: { fontWeight: '700' },
  matches: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  match: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  previewIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  strong: { fontWeight: '800' },
});
