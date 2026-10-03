import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { usePush } from '@/lib/push';
import { radius, shadow, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const SYSTEM = Platform.OS === 'android' ? 'Android' : 'iOS';

function Point({ icon, children }: { icon: IconName; children: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.point}>
      <View style={[styles.pointIcon, { backgroundColor: c.accentSoft }]}>
        <Icon name={icon} size={16} color={c.accent} />
      </View>
      <Text variant="callout" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/**
 * What push notifications are for, shown before the system's own prompt.
 *
 * The system asks once, in words the app does not choose; someone who taps
 * "Don't Allow" there can only undo it in Settings. So the app explains first
 * (what arrives, how often, how to stop it) and asks the system only once
 * they have said yes here. If the system has already been refused, this says
 * so and offers Settings instead of a button that would silently do nothing.
 */
export function PushPrimer({ visible, onClose, onEnabled }: { visible: boolean; onClose: () => void; onEnabled?: () => void }) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const push = usePush();
  const [result, setResult] = useState<'denied' | 'error' | 'signed-out' | null>(null);

  const denied = result === 'denied' || push.permission === 'denied';

  const turnOn = async () => {
    haptic.tap();
    const r = await push.enable();
    if (r === 'on') {
      haptic.success();
      setResult(null);
      onEnabled?.();
      onClose();
    } else if (r === 'denied' || r === 'error' || r === 'signed-out') setResult(r);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: c.background, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.close}>
          <Tap onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" size={24} color={c.textMuted} />
          </Tap>
        </View>

        <View style={styles.body}>
          <View style={[styles.bell, { backgroundColor: c.accentSoft }]}>
            <Icon name={denied ? 'notifications-off' : 'notifications'} size={34} color={c.accent} />
          </View>

          {push.unsupported ? (
            <>
              <Text variant="title" style={styles.center}>
                Not on this device
              </Text>
              <Text variant="body" tone="muted" style={styles.center}>
                {push.unsupported} Your alerts still arrive by email.
              </Text>
            </>
          ) : denied ? (
            <>
              <Text variant="title" style={styles.center}>
                Notifications are off for CongTrade
              </Text>
              <Text variant="body" tone="muted" style={styles.center}>
                {SYSTEM} won&apos;t ask again once notifications have been turned down, so this is switched in
                Settings: open Notifications, then CongTrade, and turn on Allow Notifications. Come back here and
                they&apos;re on.
              </Text>
            </>
          ) : (
            <>
              <Text variant="title" style={styles.center}>
                Know when they trade
              </Text>
              <Text variant="body" tone="muted" style={styles.center}>
                Get a notification on this phone when a new filing matches one of your alerts.
              </Text>

              {/* What one looks like, so the yes is to something concrete. */}
              <View
                style={[
                  styles.sample,
                  { backgroundColor: c.surface, borderColor: c.border },
                  scheme === 'light' ? shadow.card : null,
                ]}>
                <View style={[styles.sampleIcon, { backgroundColor: c.primary }]}>
                  <Icon name="trending-up" size={16} color={c.primaryText} />
                </View>
                <View style={styles.flex}>
                  <View style={styles.sampleHead}>
                    <Text variant="footnote" tone="muted" style={styles.bold}>
                      CONGTRADE
                    </Text>
                    <Text variant="footnote" tone="faint">
                      now
                    </Text>
                  </View>
                  <Text variant="bodyStrong">Nancy Pelosi bought NVDA</Text>
                  <Text variant="callout" tone="muted">
                    $1M–$5M · NVIDIA Corp · Big tech buys
                  </Text>
                </View>
              </View>

              <View style={styles.points}>
                <Point icon="options-outline">
                  Only for the alerts you switch Push on for, with exactly the filters you set.
                </Point>
                <Point icon="time-outline">
                  As often as each alert says: as it happens, or a daily or weekly roundup.
                </Point>
                <Point icon="toggle-outline">
                  Turn them off any time from the Alerts tab, for one alert or for this phone.
                </Point>
              </View>
            </>
          )}
        </View>

        {result === 'error' ? (
          <Text variant="caption" tone="loss" style={styles.center}>
            Couldn&apos;t turn notifications on just now. Check your connection and try again.
          </Text>
        ) : null}

        <View style={styles.actions}>
          {push.unsupported ? (
            <Button label="OK" onPress={onClose} />
          ) : result === 'signed-out' ? (
            <Button
              label="Sign in first"
              onPress={() => {
                onClose();
                router.push('/sign-in');
              }}
            />
          ) : denied ? (
            <>
              <Button label="Open Settings" icon="settings-outline" onPress={push.openSettings} />
              <Button label="Not now" kind="ghost" onPress={onClose} />
            </>
          ) : (
            <>
              <Text variant="caption" tone="muted" style={styles.center}>
                Next, {SYSTEM} asks whether CongTrade may send notifications. Choose Allow.
              </Text>
              <Button label="Turn on notifications" loading={push.busy} onPress={() => void turnOn()} />
              <Button label="Not now" kind="ghost" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * The switch for push notifications on this phone, as a card. Switching on
 * goes through the explanation above; switching off is immediate.
 */
export function PushSwitchCard({ devices }: { devices?: number | null }) {
  const { c } = useTheme();
  const push = usePush();
  const [primer, setPrimer] = useState(false);

  const others = devices != null ? devices - (push.enabled ? 1 : 0) : 0;
  const status = push.unsupported
    ? push.unsupported
    : push.enabled
      ? `On for this phone${others > 0 ? ` and ${others} other${others === 1 ? '' : 's'}` : ''}. Pick which alerts notify you in each alert.`
      : push.permission === 'denied'
        ? 'Turned off in Settings. Tap to see how to turn them back on.'
        : 'Off. Turn on to get alerts on this phone, not only by email.';

  return (
    <>
      <Tap
        feedback="tap"
        scaleTo={0.98}
        disabled={!push.ready}
        dimWhenDisabled={false}
        onPress={() => (push.enabled ? undefined : setPrimer(true))}
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[styles.cardIcon, { backgroundColor: push.enabled ? c.gainSoft : c.surfaceMuted }]}>
          <Icon
            name={push.enabled ? 'notifications' : 'notifications-off-outline'}
            size={22}
            color={push.enabled ? c.gain : c.textMuted}
          />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyStrong">Push notifications</Text>
          <Text variant="caption" tone="muted">
            {status}
          </Text>
        </View>
        {push.unsupported ? null : (
          <Switch
            value={push.enabled}
            disabled={!push.ready || push.busy}
            onValueChange={(on) => {
              haptic.select();
              if (on) setPrimer(true);
              else void push.disable();
            }}
            trackColor={{ true: c.gain, false: c.borderStrong }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Push notifications on this phone"
          />
        )}
      </Tap>
      <PushPrimer visible={primer} onClose={() => setPrimer(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700', letterSpacing: 0.4 },
  center: { textAlign: 'center' },
  sheet: { flex: 1, paddingHorizontal: 24 },
  close: { alignItems: 'flex-end', paddingTop: Platform.OS === 'ios' ? 16 : 48 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bell: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  sample: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  sampleIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sampleHead: { flexDirection: 'row', justifyContent: 'space-between' },
  points: { alignSelf: 'stretch', gap: 14, marginTop: 12 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: 10, paddingTop: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
