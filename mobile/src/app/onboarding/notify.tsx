import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Notify } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const OPTIONS: { value: Notify; label: string; hint: string; icon: IconName }[] = [
  {
    value: 'push',
    label: 'Push notification',
    hint: 'Coming soon. We will switch it on for you.',
    icon: 'phone-portrait',
  },
  { value: 'email', label: 'Email', hint: 'Works today: the same alert the website sends', icon: 'mail' },
  { value: 'both', label: 'Both', hint: 'Email now, push as soon as it launches', icon: 'notifications' },
];

export default function NotifyScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={4}
      title="How should we tell you?"
      subtitle="Only when a filing matches what you picked. Never marketing."
      onContinue={() => nav.go('/onboarding/proof')}>
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
  );
}
