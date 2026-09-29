import { Choice, OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useOnboarding, type Goal } from '@/lib/onboarding';
import type { IconName } from '@/ui/icon';

const GOALS: { value: Goal; label: string; hint: string; icon: IconName }[] = [
  {
    value: 'track-members',
    label: 'Follow specific members',
    hint: 'Watch who you already have an eye on',
    icon: 'people',
  },
  {
    value: 'unusual-trades',
    label: 'Spot unusual trades',
    hint: 'Large positions, and filings that arrived late',
    icon: 'flash',
  },
  {
    value: 'sector',
    label: 'Follow a sector or a ticker',
    hint: 'Defence, pharma, a single company',
    icon: 'business',
  },
  { value: 'curious', label: 'Just curious', hint: 'Show me what is in there', icon: 'compass' },
];

export default function GoalScreen() {
  const { answers, set } = useOnboarding();
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={1}
      title="What brings you here?"
      subtitle="It decides what we put in front of you first."
      canContinue={answers.goal !== null}
      onContinue={() => nav.go('/onboarding/chamber')}>
      {GOALS.map((g) => (
        <Choice
          key={g.value}
          label={g.label}
          hint={g.hint}
          icon={g.icon}
          selected={answers.goal === g.value}
          onPress={() => set({ goal: g.value })}
        />
      ))}
    </OnboardingStep>
  );
}
