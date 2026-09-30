import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { fetchPoliticians, type PoliticianSummary } from '@/lib/api';
import { useFollows } from '@/lib/follows';
import { compactUSD, memberDisplayNameFromFiledName, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAuthedRequest } from '@/lib/use-api';
import { brand, partyTone, radius, shadow, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

type Card = { key: string; row: PoliticianSummary };

const SWIPE_OUT = 0.28;

function memberSubtitle(m: PoliticianSummary): string {
  return [m.chamber === 'senate' ? m.member_state : m.state_district, m.chamber === 'senate' ? 'Senate' : 'House']
    .filter(Boolean)
    .join(' · ');
}

/** A member, full bleed: the photo, and the three numbers that say who they are as a trader. */
function CardFace({ card }: { card: Card }) {
  const { c } = useTheme();
  const m = card.row;
  const name = memberDisplayNameFromFiledName(m.member_name);
  return (
    <View style={[styles.face, { backgroundColor: c.surfaceMuted }]}>
      {m.photo_url ? (
        <Image
          source={{ uri: m.photo_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={200}
        />
      ) : (
        <LinearGradient colors={[partyTone(m.party), brand.ink]} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(8,16,28,0.55)', 'rgba(8,16,28,0.95)']}
        locations={[0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.faceBottom}>
        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: partyTone(m.party) }]}>
            <Text variant="footnote" color="#FFFFFF" style={styles.bold}>
              {m.party ?? 'Member'}
            </Text>
          </View>
          <View style={[styles.tag, styles.glass]}>
            <Text variant="footnote" color="#FFFFFF" style={styles.bold}>
              {memberSubtitle(m)}
            </Text>
          </View>
        </View>
        <Text variant="display" color="#FFFFFF">
          {name}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text variant="headline" color="#FFFFFF">
              {m.trade_count.toLocaleString()}
            </Text>
            <Text variant="footnote" color="rgba(255,255,255,0.7)">
              trades
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text variant="headline" color="#FFFFFF">
              {compactUSD(m.volume_sum)}
            </Text>
            <Text variant="footnote" color="rgba(255,255,255,0.7)">
              est. volume
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text variant="headline" color="#FFFFFF" numberOfLines={1}>
              {shortDate(m.last_filed).replace(/ \d{4}$/, '')}
            </Text>
            <Text variant="footnote" color="rgba(255,255,255,0.7)">
              last filed
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The draggable top card. The one below it grows into place as this one leaves. */
function TopCard({
  card,
  width,
  progress,
  onDecide,
  command,
}: {
  card: Card;
  width: number;
  progress: SharedValue<number>;
  onDecide: (follow: boolean) => void;
  command: { dir: 1 | -1; key: string } | null;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const threshold = width * SWIPE_OUT;

  // The buttons swipe the card too, by animating it off exactly as a finger
  // would. A command names the card it was pressed for, so the card that
  // slides up next does not mistake it for its own and fly off as well.
  useEffect(() => {
    if (!command || command.key !== card.key) return;
    x.set(
      withTiming(command.dir * width * 1.5, { duration: 260 }, (done) => {
        if (done) scheduleOnRN(onDecide, command.dir === 1);
      })
    );
  }, [command, card.key, width, x, onDecide]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      x.set(e.translationX);
      y.set(e.translationY * 0.4);
      progress.set(Math.min(1, Math.abs(e.translationX) / threshold));
    })
    .onEnd((e) => {
      const fling = Math.abs(e.velocityX) > 900;
      if (Math.abs(x.get()) > threshold || fling) {
        const dir = (fling ? Math.sign(e.velocityX) : Math.sign(x.get())) || 1;
        x.set(
          withTiming(dir * width * 1.5, { duration: 220 }, (done) => {
            if (done) scheduleOnRN(onDecide, dir > 0);
          })
        );
      } else {
        x.set(withSpring(0, { damping: 16 }));
        y.set(withSpring(0, { damping: 16 }));
        progress.set(withSpring(0));
      }
    });

  const moving = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: `${interpolate(x.value, [-width, 0, width], [-14, 0, 14])}deg` },
    ],
  }));
  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, threshold * 0.8], [0, 1], Extrapolation.CLAMP),
  }));
  const passStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold * 0.8, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, moving]}>
        {/* The face ignores the pointer so the whole card is one drag target;
            on web an image would otherwise start the browser's own drag. */}
        <View style={styles.fill} pointerEvents="none">
          <CardFace card={card} />
        </View>
        <Animated.View style={[styles.stamp, styles.stampLeft, { borderColor: '#22C55E' }, likeStamp]}>
          <Text variant="title" color="#22C55E">
            FOLLOW
          </Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampRight, { borderColor: '#F0484C' }, passStamp]}>
          <Text variant="title" color="#F0484C">
            PASS
          </Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function NextCard({ card, progress }: { card: Card; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.94, 1]) },
      { translateY: interpolate(progress.value, [0, 1], [14, 0]) },
    ],
    opacity: interpolate(progress.value, [0, 1], [0.7, 1]),
  }));
  return (
    <Animated.View style={[styles.card, style]} pointerEvents="none">
      <CardFace card={card} />
    </Animated.View>
  );
}

/**
 * Swipe through Congress: the Tinder deck.
 *
 * Right follows, left passes; the buttons do the same for anyone who would
 * rather tap. Members are dealt most active first, anyone already on the
 * watchlist is left out, and every follow lands on the Watchlist at once.
 */
export default function SwipeScreen() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 32, 460);

  const [deck, setDeck] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [followed, setFollowed] = useState(0);
  const [command, setCommand] = useState<{ dir: 1 | -1; key: string } | null>(null);
  const progress = useSharedValue(0);
  // Who was followed when the deck was dealt, so following a card does not
  // reshuffle the cards still to come.
  const initialFollows = useRef(follows.members);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const members = await fetchPoliticians({ limit: 80, sort: 'trade_count' }, await authed());
        if (cancelled) return;
        const already = new Set(initialFollows.current.map((m) => m.slug));
        setDeck(members.data.filter((row) => !already.has(row.slug)).map((row) => ({ key: row.slug, row })));
      } catch {
        if (!cancelled) setDeck([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  const current = deck?.[index];
  const next = deck?.[index + 1];

  const decide = useCallback(
    (follow: boolean) => {
      const card = deck?.[index];
      if (!card) return;
      if (follow) {
        const m = card.row;
        if (!follows.isFollowingMember(m.slug)) {
          follows.toggleMember({
            slug: m.slug,
            name: memberDisplayNameFromFiledName(m.member_name),
            photo_url: m.photo_url,
            party: m.party,
            subtitle: memberSubtitle(m),
          });
        }
        haptic.success();
        setFollowed((n) => n + 1);
      } else {
        haptic.tap();
      }
      progress.set(0);
      setIndex((i) => i + 1);
    },
    [deck, index, follows, progress]
  );

  const press = (dir: 1 | -1) => {
    if (current && command?.key !== current.key) setCommand({ dir, key: current.key });
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: c.background, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 },
      ]}>
      <View style={styles.header}>
        <IconButton name="close" label="Close" tone="filled" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="subhead">Swipe through Congress</Text>
          <Text variant="caption" tone="muted">
            {followed ? `${followed} followed so far` : 'Right to follow, left to pass'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.stage}>
        {deck === null ? (
          <View style={[styles.card, { width: cardWidth, backgroundColor: c.surface }]}>
            <View style={styles.loading}>
              <Skeleton width="100%" height={320} round={radius.xxl} />
              <Skeleton width="60%" height={26} />
              <Skeleton width="40%" height={14} />
            </View>
          </View>
        ) : !current ? (
          <View>
            <EmptyState
              icon="checkmark-done-circle-outline"
              title={followed ? `Nice, ${followed} followed` : "That's the whole deck"}
              body="Everyone you followed is on your Watchlist, and their trades show up in Alerts."
            />
            <Button
              label="Open my Watchlist"
              onPress={() => router.replace({ pathname: '/politicians', params: { view: 'watchlist' } })}
              style={styles.done}
            />
          </View>
        ) : (
          <View style={{ width: cardWidth, flex: 1, maxHeight: 620 }}>
            {next ? <NextCard key={`next:${next.key}`} card={next} progress={progress} /> : null}
            <View style={[StyleSheet.absoluteFill, scheme === 'light' ? shadow.raised : null, styles.shadowHost]}>
              <TopCard
                key={current.key}
                card={current}
                width={cardWidth}
                progress={progress}
                onDecide={decide}
                command={command}
              />
            </View>
          </View>
        )}
      </View>

      {current ? (
        <View style={styles.actions}>
          <Tap
            onPress={() => press(-1)}
            scaleTo={0.88}
            accessibilityLabel="Pass"
            style={[styles.action, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon name="close" size={32} color={c.loss} />
          </Tap>
          <Tap
            onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: current.row.slug } })}
            scaleTo={0.88}
            accessibilityLabel="Open"
            style={[styles.action, styles.small, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon name="information" size={24} color={c.primary} />
          </Tap>
          <Tap
            onPress={() => press(1)}
            scaleTo={0.88}
            accessibilityLabel="Follow"
            style={[styles.action, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon name="star" size={30} color={c.accent} />
          </Tap>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  headerText: { flex: 1, alignItems: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  shadowHost: { borderRadius: radius.xxl },
  card: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.xxl, overflow: 'hidden' },
  loading: { padding: 16, gap: 16 },
  face: { flex: 1, borderRadius: radius.xxl, overflow: 'hidden' },
  faceBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 22, gap: 10 },
  tagRow: { flexDirection: 'row', gap: 8 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  glass: { backgroundColor: 'rgba(255,255,255,0.18)' },
  bold: { fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statCell: { flex: 1, gap: 1 },
  stamp: { position: 'absolute', top: 36, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 4, borderRadius: 10 },
  stampLeft: { left: 24, transform: [{ rotate: '-14deg' }] },
  stampRight: { right: 24, transform: [{ rotate: '14deg' }] },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingTop: 4 },
  action: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...shadow.card,
  },
  small: { width: 50, height: 50, borderRadius: 25 },
  done: { marginHorizontal: 40 },
});
