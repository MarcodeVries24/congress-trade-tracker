import { memberDisplayNameFromFiledName } from '@congtrade/shared/memberDisplay';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { AuthOptions } from '@/components/auth-options';
import { OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { useAccess } from '@/lib/access';
import { useOnboarding } from '@/lib/onboarding';
import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * The last step before the plans: an account, framed as what it is for. The
 * alerts set up in the questions need somewhere to go (this phone, an email
 * address), and Pro is tied to the account so it works on the website too.
 *
 * Asked here rather than when the plan is bought, so the purchase itself is
 * one tap to the store's own sheet. Never required: "Not now" goes on to the
 * plans, which ask for an account only when a plan is picked.
 *
 * Signing in here moves on by itself. Someone already signed in (back from
 * the plans, say) sees who they are signed in as and a button on, rather than
 * being bounced forward.
 *
 * "Already have an account? Sign in" turns the wording to signing in. The
 * ways in stay the same: Apple, Google and an email address each sign in to
 * an account that exists and make one that does not.
 */
export default function AccountStep() {
  const nav = useOnboardingNav();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { answers } = useOnboarding();
  const { c } = useTheme();
  const router = useRouter();
  // A subscriber redoing the questions (Settings) has no plan to pick: "Done"
  // takes them back into the app with the new answers.
  const pro = useAccess().status === 'pro';

  const followed = [...new Set(answers.members.map(memberDisplayNameFromFiledName))];
  const forWhom = followed.length === 1 ? `for ${followed[0]} ` : '';
  const [returning, setReturning] = useState(false);

  // Only a sign-in that happens on this screen moves on by itself.
  const signingIn = useRef(!isSignedIn);
  useEffect(() => {
    if (isSignedIn && signingIn.current) {
      signingIn.current = false;
      // The plans close themselves for an account that has Pro already.
      nav.go('/paywall');
    }
  }, [isSignedIn, nav]);

  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OnboardingStep
        step={6}
        title={returning && !isSignedIn ? 'Welcome back.' : 'Save your setup.'}
        subtitle={
          returning && !isSignedIn
            ? 'Sign in with the account you use on congtrade.com. Your plan and alerts come with you.'
            : `So your alerts ${forWhom}can reach you, on this phone and on congtrade.com.`
        }
        skip={isSignedIn ? undefined : () => nav.go('/paywall')}
        skipLabel="Not now"
        continueLabel={pro ? 'Done' : 'See the plans'}
        onContinue={isSignedIn ? () => (pro ? router.replace('/') : nav.go('/paywall')) : undefined}>
        {isSignedIn ? (
          <View style={[styles.signedIn, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Icon name="checkmark-circle" size={22} color={c.gain} />
            <Text variant="callout" style={styles.flex} numberOfLines={1}>
              {email ? `Signed in as ${email}` : 'Signed in'}
            </Text>
          </View>
        ) : (
          <AuthOptions
            extra={
              <Tap onPress={() => setReturning((r) => !r)} hitSlop={8} style={styles.switch}>
                <Text variant="callout" tone="muted">
                  {returning ? 'New here? ' : 'Already have an account? '}
                  <Text variant="callout" style={styles.bold}>
                    {returning ? 'Create an account' : 'Sign in'}
                  </Text>
                </Text>
              </Tap>
            }
          />
        )}
      </OnboardingStep>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  switch: { alignItems: 'center', paddingVertical: 4 },
  signedIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
