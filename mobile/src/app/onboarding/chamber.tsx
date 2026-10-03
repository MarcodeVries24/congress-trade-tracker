import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Chamber } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const CHAMBERS: { value: Chamber; label: string; icon: IconName }[] = [
  { value: 'both', label: 'Both chambers', icon: 'layers' },
  { value: 'house', label: 'The House', icon: 'home' },
  { value: 'senate', label: 'The Senate', icon: 'library' },
];

export default function ChamberScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={2}
      title="Which chamber should I watch for you?"
      subtitle="You can change this anytime."
      onContinue={() => nav.go('/onboarding/members')}>
      {CHAMBERS.map((c) => (
        <Choice
          key={c.value}
          label={c.label}
          icon={c.icon}
          selected={answers.chamber === c.value}
          onPress={() => set({ chamber: c.value })}
        />
      ))}
    </OnboardingStep>
  );
}
