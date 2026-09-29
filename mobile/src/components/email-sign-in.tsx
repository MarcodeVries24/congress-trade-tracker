import { useSignIn } from '@clerk/clerk-expo';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

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
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];

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

  const inputStyle = [styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }];

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
      <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Or use your email</ThemedText>

      {step === 'email' ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => !action.disabled && action.onPress()}
          style={inputStyle}
        />
      ) : (
        <Pressable onPress={back}>
          <ThemedText style={[styles.email, { color: colors.textSecondary }]}>{email.trim()} · Change</ThemedText>
        </Pressable>
      )}

      {step === 'password' ? (
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
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
          <ThemedText style={[styles.hint, { color: colors.textSecondary }]}>
            {codeIsSecondFactor
              ? 'First sign-in on this device. We sent a six-digit code to that address to confirm it is you.'
              : 'We sent a six-digit code to that address.'}
          </ThemedText>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={() => !action.disabled && action.onPress()}
            style={inputStyle}
          />
        </>
      ) : null}

      <Pressable
        disabled={busy || action.disabled}
        onPress={action.onPress}
        style={[
          styles.button,
          {
            backgroundColor: '#3b7ddd',
            opacity: busy || action.disabled ? 0.5 : 1,
          },
        ]}>
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText style={styles.buttonLabel}>{action.label}</ThemedText>
        )}
      </Pressable>

      {step === 'password' && codeAvailable ? (
        <Pressable onPress={switchToCode} disabled={busy} style={styles.link}>
          <ThemedText style={[styles.linkLabel, { color: colors.textSecondary }]}>Email me a code instead</ThemedText>
        </Pressable>
      ) : null}

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 24, gap: 10 },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  email: { fontSize: 14 },
  hint: { fontSize: 13 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
  },
  buttonLabel: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkLabel: { fontSize: 14 },
  error: { fontSize: 13, color: '#d6455d' },
});
