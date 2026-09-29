import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchIssuers, fetchPoliticians, type IssuerSummary, type PoliticianSummary } from '@/lib/api';
import { useFollows } from '@/lib/follows';
import { memberDisplayNameFromFiledName } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced } from '@/lib/use-paged';
import { useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { IconButton } from '@/ui/button';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { FollowStar } from '@/ui/follow-button';
import { SearchBar } from '@/ui/search-bar';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

const SCOPES = [
  { key: 'all', label: 'Everything' },
  { key: 'members', label: 'Members' },
  { key: 'stocks', label: 'Stocks' },
] as const;
type Scope = (typeof SCOPES)[number]['key'];

type Result =
  { kind: 'member'; key: string; row: PoliticianSummary } | { kind: 'stock'; key: string; row: IssuerSummary };

const POPULAR = ['Pelosi', 'NVDA', 'Tuberville', 'MSFT', 'Khanna', 'TSLA'];

/**
 * One search box for people and companies, as Airbnb has one for places.
 *
 * Both directories are searched at once and interleaved, members first when
 * the query looks like a name and stocks first when it looks like a ticker.
 * Every result can be followed without opening it.
 */
export default function SearchScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [results, setResults] = useState<Result[] | null>(null);
  const q = useDebounced(query.trim(), 250);

  const search = useCallback(
    async (text: string, cancelled: () => boolean) => {
      const options = await authed();
      const [members, stocks] = await Promise.all([
        scope !== 'stocks' ? fetchPoliticians({ q: text, limit: 20 }, options).catch(() => null) : null,
        scope !== 'members' ? fetchIssuers({ q: text, limit: 20 }, options).catch(() => null) : null,
      ]);
      if (cancelled()) return;
      const m: Result[] = (members?.data ?? []).map((row) => ({ kind: 'member', key: `m:${row.slug}`, row }));
      const s: Result[] = (stocks?.data ?? []).map((row) => ({ kind: 'stock', key: `s:${row.slug}`, row }));
      const looksLikeTicker = /^[A-Z.]{1,5}$/.test(text);
      setResults(looksLikeTicker ? [...s, ...m] : [...m, ...s]);
    },
    [authed, scope]
  );

  useEffect(() => {
    if (!q) {
      // Clearing the box clears the results; nothing to fetch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    let cancelled = false;
    void search(q, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [q, search]);

  const renderItem = ({ item }: { item: Result }) => {
    if (item.kind === 'member') {
      const m = item.row;
      const name = memberDisplayNameFromFiledName(m.member_name);
      const subtitle = [
        m.chamber === 'senate' ? m.member_state : m.state_district,
        m.chamber === 'senate' ? 'Senate' : 'House',
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <Tap
          scaleTo={0.985}
          onPress={() => {
            Keyboard.dismiss();
            router.push({ pathname: '/politician/[slug]', params: { slug: m.slug } });
          }}
          style={styles.row}>
          <Avatar uri={m.photo_url} name={name} party={m.party} size={46} />
          <View style={styles.text}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[m.party, subtitle].filter(Boolean).join(' · ')} · {m.trade_count.toLocaleString()} trades
            </Text>
          </View>
          <FollowStar
            following={follows.isFollowingMember(m.slug)}
            onPress={() =>
              follows.toggleMember({ slug: m.slug, name, photo_url: m.photo_url, party: m.party, subtitle })
            }
          />
        </Tap>
      );
    }
    const s = item.row;
    return (
      <Tap
        scaleTo={0.985}
        onPress={() => {
          Keyboard.dismiss();
          router.push({ pathname: '/issuer/[slug]', params: { slug: s.slug } });
        }}
        style={styles.row}>
        <TickerLogo ticker={s.ticker} size={46} />
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {s.ticker}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {s.company_name ?? 'Listed company'} · {s.trade_count.toLocaleString()} trades
          </Text>
        </View>
        <FollowStar
          following={follows.isFollowingStock(s.ticker)}
          onPress={() => follows.toggleStock({ ticker: s.ticker, slug: s.slug, company_name: s.company_name })}
        />
      </Tap>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <SearchBar value={query} onChangeText={setQuery} autoFocus placeholder="Members, tickers, companies" />
        </View>
        <IconButton name="close" label="Close search" tone="filled" onPress={() => router.back()} size={44} />
      </View>
      <View style={styles.scopes}>
        <ChipRow options={SCOPES} value={scope} onChange={setScope} />
      </View>

      {!q ? (
        <View style={styles.popular}>
          <Text variant="label" tone="faint">
            POPULAR SEARCHES
          </Text>
          <View style={styles.popularRow}>
            {POPULAR.map((p) => (
              <Tap
                key={p}
                onPress={() => setQuery(p)}
                scaleTo={0.94}
                style={[styles.popularChip, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text variant="callout" style={styles.popularLabel}>
                  {p}
                </Text>
              </Tap>
            ))}
          </View>
        </View>
      ) : results === null ? (
        <RowSkeleton count={5} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="search-outline" title="No matches" body={`Nothing in Congress matches "${q}".`} compact />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  flex: { flex: 1 },
  scopes: { paddingTop: 14, paddingBottom: 6 },
  popular: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  popularRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  popularChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  popularLabel: { fontWeight: '600' },
  list: { paddingBottom: 40, paddingTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  text: { flex: 1, gap: 2 },
});
