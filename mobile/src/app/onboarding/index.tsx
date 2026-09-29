import { OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { ThemedText } from '@/components/themed-text';
import { StyleSheet, View } from 'react-native';

const POINTS = [
  'Every disclosed trade, from the filings themselves',
  'Filed by law within 45 days, on your phone within hours',
  'Both chambers, every member who files',
];

export default function WelcomeScreen() {
  const nav = useOnboardingNav();
  return (
    <OnboardingStep
      step={0}
      title="Every Congress trade, the moment it is filed"
      subtitle="CongTrade reads the Periodic Transaction Reports the House Clerk and the Senate publish, and tells you what is in them."
      onContinue={() => nav.go('/onboarding/goal')}
      continueLabel="Get started">
      <View style={styles.points}>
        {POINTS.map((p) => (
          <View key={p} style={styles.point}>
            <ThemedText style={styles.bullet}>•</ThemedText>
            <ThemedText style={styles.text}>{p}</ThemedText>
          </View>
        ))}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  points: { gap: 14 },
  point: { flexDirection: 'row', gap: 10 },
  bullet: { fontSize: 15, color: '#3b7ddd' },
  text: { flex: 1, fontSize: 15, lineHeight: 21 },
});
