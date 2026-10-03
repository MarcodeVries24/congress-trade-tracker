import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Notify } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const OPTIONS: { value: Notify; label: string; icon: IconName }[] = [
  { value: 'push', label: 'Push notification', icon: 'phone-portrait' },
  { value: 'email', label: 'Email', icon: 'mail' },
  { value: 'both', label: 'Both', icon: 'notifications' },
];

export default function NotifyScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={4}
      title="How should I tell you about new trades?"
      subtitle="Only when something matches. Never marketing."
      onContinue={() => nav.go('/onboarding/proof')}>
      {OPTIONS.map((o) => (
        <Choice
          key={o.value}
          label={o.label}
          icon={o.icon}
          selected={answers.notify === o.value}
          onPress={() => set({ notify: o.value })}
        />
      ))}
    </OnboardingStep>
  );
}
