import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Goal } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const GOALS: { value: Goal; label: string; icon: IconName }[] = [
  { value: 'track-members', label: 'Follow specific politicians', icon: 'people' },
  { value: 'unusual-trades', label: 'Spot unusual trades', icon: 'flash' },
  { value: 'sector', label: 'Follow a company or sector', icon: 'business' },
  { value: 'curious', label: 'Just curious', icon: 'compass' },
];

export default function GoalScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={1}
      title="Hi, I'm Cong! What brings you here?"
      canContinue={answers.goal !== null}
      onContinue={() => nav.go('/onboarding/chamber')}>
      {GOALS.map((g) => (
        <Choice
          key={g.value}
          label={g.label}
          icon={g.icon}
          selected={answers.goal === g.value}
          onPress={() => set({ goal: g.value })}
        />
      ))}
    </OnboardingStep>
  );
}
