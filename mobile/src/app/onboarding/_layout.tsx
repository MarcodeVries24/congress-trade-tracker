import { Stack } from 'expo-router';

/**
 * Its own stack, so back-swipe walks the questions rather than dropping out of
 * the flow, and so the whole group can be replaced in one go when it finishes.
 */
export default function OnboardingLayout() {
  // Steps only replace one another when going back with no history (see
  // useStepBack), so a replace should look like going back.
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: true, animationTypeForReplace: 'pop' }} />;
}
