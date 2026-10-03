import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Notify } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const OPTIONS: { value: Notify; label: string; hint: string; icon: IconName }[] = [
  {
    value: 'push',
    label: 'Push notification',
    hint: 'On this phone, the moment a filing matches',
    icon: 'phone-portrait',
  },
  { value: 'email', label: 'Email', hint: 'The same alert the website sends', icon: 'mail' },
  { value: 'both', label: 'Both', hint: 'A notification and an email', icon: 'notifications' },
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
