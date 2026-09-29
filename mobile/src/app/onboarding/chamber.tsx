import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Chamber } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const CHAMBERS: { value: Chamber; label: string; hint: string; icon: IconName }[] = [
  { value: 'both', label: 'Both chambers', hint: 'Everything that gets filed', icon: 'layers' },
  { value: 'house', label: 'The House', hint: '435 members, the bulk of the filings', icon: 'home' },
  { value: 'senate', label: 'The Senate', hint: '100 members, larger positions', icon: 'library' },
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
          icon={c.icon}
          selected={answers.chamber === c.value}
          onPress={() => set({ chamber: c.value })}
        />
      ))}
    </OnboardingStep>
  );
}
