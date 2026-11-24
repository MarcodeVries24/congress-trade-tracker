import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useAccess } from '@/lib/access';
import { haptic } from '@/lib/haptics';
import { useOnboarding } from '@/lib/onboarding';
import { usePush } from '@/lib/push';
import { nudgeDue, type NudgeState } from '@/lib/push-nudge';
import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { PushPrimer } from '@/ui/push-primer';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const KEY = 'congtrade.push-nudge';

async function read(): Promise<NudgeState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NudgeState) : null;
  } catch {
    return null;
  }
}

const write = (state: NudgeState) => AsyncStorage.setItem(KEY, JSON.stringify(state));

/**
 * On Discover, for a subscriber who wanted push and does not get it: they said
 * "not now", turned the system's question down, or took the permission away
 * later. One quiet card that can be put away, at most every two weeks and not
 * after the third time (lib/push-nudge). Never for someone who chose email
 * only, or who turned push off in the app: those are answers.
 */
export function PushNudge() {
  const { c } = useTheme();
  const { status } = useAccess();
  const onboarding = useOnboarding();
  const push = usePush();
  const [state, setState] = useState<NudgeState | null>(null);
  const [primer, setPrimer] = useState(false);
  const [busy, setBusy] = useState(false);
  const accepted = useRef(false);

  const wanted =
    status === 'pro' &&
    onboarding.loaded &&
    onboarding.done &&
    onboarding.answers.notify !== 'email' &&
    push.ready &&
    !push.unsupported &&
    !push.enabled &&
    !push.turnedOff;

  // The first time it is wanted only starts the clock.
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void (async () => {
      try {
        let next = await read();
        if (!next) {
          next = { at: Date.now(), dismissed: 0 };
          await write(next);
        }
        if (cancelled) return;
        setState(next);
        setDue(nudgeDue(next, Date.now()));
      } catch {
        // Without storage it could not be put away, so leave it out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  const putAway = () => {
    setDue(false);
    void write({ at: Date.now(), dismissed: (state?.dismissed ?? 0) + 1 }).catch(() => {});
  };

  const turnOn = async () => {
    haptic.tap();
    // Already allowed, so there is nothing to explain or to ask the system.
    if (push.permission === 'granted') {
      setBusy(true);
      const result = await push.enable();
      setBusy(false);
      if (result === 'on') {
        haptic.success();
        return;
      }
      // Did not work: the sheet has a way to try again.
    }
    setPrimer(true);
  };

  return (
    <>
      {wanted && due ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={styles.wrap}>
          <Tap
            feedback="tap"
            scaleTo={0.98}
            disabled={busy}
            onPress={() => void turnOn()}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.icon, { backgroundColor: c.accentSoft }]}>
              <Icon name="notifications-off-outline" size={20} color={c.accent} />
            </View>
            <View style={styles.text}>
              <Text variant="bodyStrong">Notifications are off</Text>
              <Text variant="caption" tone="muted">
                Turn them on to hear about new trades.
              </Text>
            </View>
            <Tap onPress={putAway} hitSlop={12} accessibilityLabel="Not now">
              <Icon name="close" size={20} color={c.textMuted} />
            </Tap>
          </Tap>
        </Animated.View>
      ) : null}
      <PushPrimer
        visible={primer}
        onEnabled={() => {
          accepted.current = true;
        }}
        onClose={() => {
          setPrimer(false);
          if (!accepted.current) putAway();
          accepted.current = false;
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
