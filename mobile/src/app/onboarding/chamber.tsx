import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Chamber } from '@/lib/onboarding';

const CHAMBERS: { value: Chamber; label: string; hint: string }[] = [
  { value: 'both', label: 'Both chambers', hint: 'Everything that gets filed' },
  { value: 'house', label: 'The House', hint: '435 members, the bulk of the filings' },
  { value: 'senate', label: 'The Senate', hint: '100 members, larger positions' },
];

export default function ChamberScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={2}
      title="Which chamber?"
      subtitle="This becomes the first filter on your feed. You can change it whenever you like."
      onContinue={() => nav.go('/onboarding/members')}>
      {CHAMBERS.map((c) => (
        <Choice
          key={c.value}
          label={c.label}
          hint={c.hint}
          selected={answers.chamber === c.value}
          onPress={() => set({ chamber: c.value })}
        />
      ))}
    </OnboardingStep>
  );
}
