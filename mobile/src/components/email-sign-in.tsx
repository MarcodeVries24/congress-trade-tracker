import { useSignIn } from '@clerk/clerk-expo';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

type Step = 'email' | 'password' | 'code';

/** Clerk's API errors carry a readable sentence; anything else gets a plain one. */
function messageFrom(err: unknown, fallback: string): string {
  const errors = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors;
  return errors?.[0]?.longMessage ?? errors?.[0]?.message ?? fallback;
}

/**
 * Signing in with an email address, by password or by a one-time code.
 *
 * Both, because they serve different people. The code is what most users want,
 * since nobody has to remember anything. The password is what an App Store or
 * Play reviewer needs: review hands over a username and a password and cannot
 * receive a code sent to someone else's inbox, and a hard paywall means review
 * cannot see the app at all without signing in.
 *
 * Which methods are offered is decided by the Clerk instance, not here. After
 * the email is entered, Clerk says which first factors that account supports,
 * and the screen follows it. So switching password sign-in on or off in the
 * dashboard needs no release.
 */
export function EmailSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { c } = useTheme();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeAvailable, setCodeAvailable] = useState(false);
  // Whether the code being asked for is the sign-in itself or the check that
  // follows a correct password, since Clerk verifies those through different calls.
  const [codeIsSecondFactor, setCodeIsSecondFactor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];

  const finish = async (sessionId: string | null) => {
    if (!sessionId || !setActive) {
      setError('Sign-in needs another step this app does not support yet.');
      return;
    }
    await setActive({ session: sessionId });
  };

  const sendCode = async () => {
    if (!signIn) return;
    const factor = signIn.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
    if (!factor || !('emailAddressId' in factor)) {
      setError('Email codes are not available for this account.');
      return;
    }
    await signIn.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: factor.emailAddressId,
    });
    setCodeIsSecondFactor(false);
    setStep('code');
  };

  const start = async () => {
    if (!isLoaded || !signIn) return;
    setError(null);
    setBusy(true);
    try {
      await signIn.create({ identifier: email.trim() });
      const strategies = signIn.supportedFirstFactors?.map((f) => f.strategy) ?? [];
      const hasCode = strategies.includes('email_code');
      setCodeAvailable(hasCode);
      if (strategies.includes('password')) setStep('password');
      else if (hasCode) await sendCode();
      else setError('This account cannot sign in with an email address. Try Google or Apple above.');
    } catch (err) {
      setError(messageFrom(err, 'Could not find that account.'));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    if (!signIn) return;
    setError(null);
    setBusy(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'password',
        password,
      });
      if (result.status === 'needs_second_factor') {
        // Device Trust: the first password sign-in on a device is confirmed
        // with a code sent to the account's email, so a leaked password alone
        // is not enough. Every phone is a new device the first time.
        const factor = result.supportedSecondFactors?.find((f) => f.strategy === 'email_code');
        if (!factor) {
          setError('This account needs a second step this app does not support yet.');
          return;
        }
        await result.prepareSecondFactor({
          strategy: 'email_code',
          ...('emailAddressId' in factor ? { emailAddressId: factor.emailAddressId } : {}),
        });
        setCodeIsSecondFactor(true);
        setStep('code');
        return;
      }
      await finish(result.status === 'complete' ? result.createdSessionId : null);
    } catch (err) {
      setError(messageFrom(err, 'That password did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!signIn) return;
    setError(null);
    setBusy(true);
    try {
      const attempt = { strategy: 'email_code', code: code.trim() } as const;
      const result = codeIsSecondFactor
        ? await signIn.attemptSecondFactor(attempt)
        : await signIn.attemptFirstFactor(attempt);
      await finish(result.status === 'complete' ? result.createdSessionId : null);
    } catch (err) {
      setError(messageFrom(err, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const switchToCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendCode();
    } catch (err) {
      setError(messageFrom(err, 'Could not send a code.'));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setStep('email');
    setPassword('');
    setCode('');
    setCodeIsSecondFactor(false);
    setError(null);
  };

  const action =
    step === 'email'
      ? { label: 'Continue', onPress: start, disabled: !email.includes('@') }
      : step === 'password'
        ? {
            label: 'Sign in',
            onPress: submitPassword,
            disabled: password.length === 0,
          }
        : {
            label: 'Verify code',
            onPress: submitCode,
            disabled: code.trim().length < 6,
          };

  return (
    <View style={styles.wrap}>
      {step === 'email' ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={c.textFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => !action.disabled && action.onPress()}
          style={inputStyle}
        />
      ) : (
        <Tap onPress={back} style={[styles.chosen, { backgroundColor: c.surfaceMuted }]}>
          <Text variant="callout" numberOfLines={1} style={styles.flex}>
            {email.trim()}
          </Text>
          <Text variant="callout" style={styles.bold}>
            Change
          </Text>
        </Tap>
      )}

      {step === 'password' ? (
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={c.textFaint}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => !action.disabled && action.onPress()}
          style={inputStyle}
        />
      ) : null}

      {step === 'code' ? (
        <>
          <Text variant="caption" tone="muted">
            {codeIsSecondFactor
              ? 'First sign-in on this device. We sent a six-digit code to that address to confirm it is you.'
              : 'We sent a six-digit code to that address.'}
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={() => !action.disabled && action.onPress()}
            style={[inputStyle, styles.code]}
          />
        </>
      ) : null}

      <Button label={action.label} onPress={action.onPress} loading={busy} disabled={action.disabled} />

      {step === 'password' && codeAvailable ? (
        <Tap onPress={switchToCode} disabled={busy} style={styles.link}>
          <Text variant="callout" tone="muted" style={styles.underline}>
            Email me a code instead
          </Text>
        </Tap>
      ) : null}

      {error ? (
        <Text variant="caption" tone="loss">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
  },
  code: { fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: '700' },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  link: { alignItems: 'center', paddingVertical: 6 },
  underline: { textDecorationLine: 'underline' },
});
