import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';

import { useAccess } from '@/lib/access';
import { useOnboarding } from '@/lib/onboarding';
import { usePush } from '@/lib/push';
import { PushPrimer } from '@/ui/push-primer';

const OFFERED_KEY = 'congtrade.push-offered-after-pro';
/** Lets the paywall close before the sheet slides up. */
const DELAY_MS = 700;

/**
 * Onboarding asks how someone wants to hear about new trades, but choosing
 * push there did not ask the system for permission, so a subscriber who
 * picked push could go on getting email only, never having been asked.
 *
 * This offers the push explanation (PushPrimer, which then asks the system)
 * once, the first time a subscriber reaches the app, when they chose push or
 * both and this phone has not been asked yet. Never for email-only, never
 * twice, and never over onboarding or the paywall.
 */
export function PushAfterPro() {
  const { status } = useAccess();
  const onboarding = useOnboarding();
  const push = usePush();
  const segments = useSegments();
  const [visible, setVisible] = useState(false);

  const due =
    status === 'pro' &&
    onboarding.loaded &&
    onboarding.done &&
    onboarding.answers.notify !== 'email' &&
    push.ready &&
    !push.unsupported &&
    push.permission === 'undetermined' &&
    segments[0] === '(tabs)';

  useEffect(() => {
    if (!due) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        if ((await AsyncStorage.getItem(OFFERED_KEY)) === 'true' || cancelled) return;
        timer = setTimeout(() => {
          if (cancelled) return;
          // Recorded once it is actually shown, so leaving the tabs in the
          // meantime only puts it off.
          void AsyncStorage.setItem(OFFERED_KEY, 'true').catch(() => {});
          setVisible(true);
        }, DELAY_MS);
      } catch {
        // Without storage it could come back every launch, so leave it out.
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [due]);

  return <PushPrimer visible={visible} onClose={() => setVisible(false)} />;
}
