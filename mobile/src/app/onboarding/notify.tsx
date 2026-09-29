import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Notify } from '@/lib/onboarding';

const OPTIONS: { value: Notify; label: string; hint: string }[] = [
  { value: 'push', label: 'Push notification', hint: 'The fastest, straight to the trade' },
  { value: 'email', label: 'Email', hint: 'The same alert the website sends' },
  { value: 'both', label: 'Both', hint: 'Push now, email as the record' },
];

export default function NotifyScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={4}
      title="How should we tell you?"
      subtitle="Only when a filing matches what you just picked. Never a digest, never marketing."
      onContinue={() => nav.go('/onboarding/proof')}>
      {OPTIONS.map((o) => (
        <Choice
          key={o.value}
          label={o.label}
          hint={o.hint}
          selected={answers.notify === o.value}
          onPress={() => set({ notify: o.value })}
        />
      ))}
    </OnboardingStep>
  );
}
