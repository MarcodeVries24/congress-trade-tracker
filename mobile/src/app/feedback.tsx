import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  FEEDBACK_KIND_KEYS,
  FEEDBACK_KINDS,
  FEEDBACK_MAX_LENGTH,
  readFeedback,
  type FeedbackKind,
} from '@congtrade/shared/feedback';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { sendFeedback } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Cong } from '@/ui/cong';
import { Text } from '@/ui/text';
import { ToggleChips } from '@/ui/toggle-chips';

const KINDS = FEEDBACK_KIND_KEYS.map((key) => ({ key, label: FEEDBACK_KINDS[key] }));

/**
 * Feedback: what it is about, the message, and where to reply. Sent with the
 * app and system version and the screen it was opened from (`from`), which
 * the screen says, and filed under the account when signed in. A failed send
 * keeps everything typed, so trying again costs nothing.
 */
export default function FeedbackScreen() {
  const { c } = useTheme();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const authed = useAuthedRequest();

  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? null;
  const osVersion = Device.osVersion ?? null;

  const submit = async () => {
    const read = readFeedback({
      kind,
      message,
      email,
      source: Platform.OS === 'android' ? 'android' : 'ios',
      appVersion,
      osVersion,
      screen: from ?? null,
    });
    if (!read.ok) {
      setError(read.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(read.value, await authed());
      haptic.success();
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];

  if (sent) {
    return (
      <View style={[styles.screen, styles.done, { backgroundColor: c.background }]}>
        <Cong mood="welcome-back" width={120} />
        <Text variant="title" style={styles.center}>
          Thank you!
        </Text>
        <Text variant="callout" tone="muted" style={styles.center}>
          We read every message.{email.trim() ? " If it needs an answer, we'll reply by email." : ''}
        </Text>
        <Button label="Done" onPress={() => router.back()} style={styles.full} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="title">Send feedback</Text>
        <Text variant="callout" tone="muted">
          An idea, something that doesn&apos;t work, or a trade that looks wrong: we read every message.
        </Text>

        <Text variant="headline" style={styles.label}>
          What is it about?
        </Text>
        <ToggleChips
          options={KINDS}
          selected={kind ? [kind] : []}
          onChange={(next) => {
            setKind((next[0] as FeedbackKind) ?? null);
            setError(null);
          }}
          single
        />

        <Text variant="headline" style={styles.label}>
          Your message
        </Text>
        <TextInput
          value={message}
          onChangeText={(text) => {
            setMessage(text);
            setError(null);
          }}
          placeholder="What would make CongTrade better, or what went wrong?"
          placeholderTextColor={c.textFaint}
          multiline
          maxLength={FEEDBACK_MAX_LENGTH}
          textAlignVertical="top"
          style={[inputStyle, styles.message]}
        />
        <Text variant="caption" tone="faint" style={styles.count}>
          {message.length.toLocaleString('en-US')} / {FEEDBACK_MAX_LENGTH.toLocaleString('en-US')}
        </Text>

        <Text variant="headline" style={styles.label}>
          Email for a reply
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={isSignedIn ? "Your account's email address" : 'Optional'}
          placeholderTextColor={c.textFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          style={inputStyle}
        />

        <Text variant="caption" tone="faint">
          Sent with it: {Platform.OS === 'android' ? 'Android' : 'iOS'} {osVersion ?? ''}, app version{' '}
          {appVersion ?? 'unknown'}
          {from ? `, and that you came from ${from}` : ''}
          {isSignedIn ? ', filed under your account' : ''}.
        </Text>

        {error ? (
          <Text variant="caption" tone="loss">
            {error}
          </Text>
        ) : null}

        <Button label="Send feedback" icon="paper-plane-outline" loading={busy} disabled={busy} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 56 },
  label: { paddingTop: 12 },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
  },
  message: { minHeight: 150, paddingTop: 15 },
  count: { textAlign: 'right' },
  done: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  center: { textAlign: 'center' },
  full: { alignSelf: 'stretch', marginTop: 8 },
});
