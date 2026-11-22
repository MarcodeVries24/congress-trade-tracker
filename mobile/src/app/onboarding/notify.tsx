import { useState } from 'react';

import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Notify } from '@/lib/onboarding';
import { usePush } from '@/lib/push';
import type { IconName } from '@/ui/icon';
import { PushPrimer } from '@/ui/push-primer';

// Push first and chosen to start with: it arrives the moment an alert is
// sent. Email stays a choice, for anyone who wants it.
const OPTIONS: { value: Notify; label: string; hint: string; icon: IconName }[] = [
  {
    value: 'push',
    label: 'Push notification',
    hint: 'Fastest: on your phone the moment a trade is filed',
    icon: 'phone-portrait',
  },
  { value: 'both', label: 'Push and email', hint: 'A notification, and a copy in your inbox', icon: 'notifications' },
  { value: 'email', label: 'Email only', hint: 'Slower, and can end up in spam', icon: 'mail' },
];

/**
 * How to be told about new trades, and, for push, the phone's permission to
 * do it.
 *
 * Choosing push here used to change nothing on the phone: the system was only
 * asked after subscribing, so plenty of people who picked push never allowed
 * it and got email or nothing. Now Continue explains what the notifications
 * are and has the system ask (PushPrimer), before the account exists if need
 * be: the yes is kept and the phone registered once someone signs in. "Not
 * now", or a no, simply goes on; the first alert then falls back to email
 * (see email-alerts), so it still reaches them.
 */
export default function NotifyScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  const push = usePush();
  const [asking, setAsking] = useState(false);

  const next = () => nav.go('/onboarding/proof');

  const onContinue = () => {
    const wantsPush = answers.notify !== 'email';
    if (!wantsPush || push.unsupported || push.permission === 'denied') {
      next();
      return;
    }
    // Already allowed (a reinstall, say): nothing to ask, only to remember.
    if (push.permission === 'granted') {
      void push.enable();
      next();
      return;
    }
    setAsking(true);
  };

  return (
    <>
      <OnboardingStep
        step={4}
        title="How should I tell you about new trades?"
        subtitle="Only when something matches. Never marketing."
        onContinue={onContinue}>
        {OPTIONS.map((o) => (
          <Choice
            key={o.value}
            label={o.label}
            hint={o.hint}
            icon={o.icon}
            selected={answers.notify === o.value}
            onPress={() => set({ notify: o.value })}
          />
        ))}
      </OnboardingStep>
      <PushPrimer
        visible={asking}
        onClose={() => {
          setAsking(false);
          next();
        }}
      />
    </>
  );
}
