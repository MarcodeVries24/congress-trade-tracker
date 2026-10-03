import { useAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { fetchAlerts, registerPushDevice, unregisterPushDevice } from '@/lib/api';
import { fromAlertFilters } from '@/lib/trade-filters';
import { useAuthedRequest } from '@/lib/use-api';

/**
 * Push notifications on this phone: whether they are on, turning them on and
 * off, and where a tapped notification leads.
 *
 * "On" takes two yeses: the system's permission, which only the system can
 * grant, and this app's own switch, which registers the phone's Expo push
 * token with the account (POST /api/push/devices) so the alert sender can
 * reach it. The switch is what the Alerts tab shows; turning it off removes
 * the token, and the system permission is left alone for the person to
 * manage in Settings, as iOS expects.
 *
 * Which alerts arrive here is per alert (its "Push" switch in the editor);
 * this decides only whether this phone is one of the places they go.
 */

const STORE_KEY = 'push:v1';
/** The Android channel alerts arrive on; the sender names it too (ingest/src/alerts/push.ts). */
const CHANNEL = 'alerts';

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type EnableResult = 'on' | 'denied' | 'unsupported' | 'signed-out' | 'error';

// Banners while the app is open, too: an alert is worth seeing either way.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Why this phone cannot get push notifications at all, or null when it can.
 * Simulators have no push token; Expo Go on Android lost remote notifications
 * in SDK 53, so there it takes a real build.
 */
function unsupportedReason(): string | null {
  if (Platform.OS === 'web') return 'Notifications need the iPhone or Android app.';
  if (!Device.isDevice) return 'Notifications need a real phone, not a simulator.';
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'On Android, notifications need the installed app rather than Expo Go.';
  }
  return null;
}

// Fixed for the life of the process: the device and the runtime do not change.
const UNSUPPORTED = unsupportedReason();

function permissionOf(status: Notifications.NotificationPermissionsStatus): PushPermission {
  // iOS has states the cross-platform `granted` flattens: provisional and
  // ephemeral both still deliver.
  const ios = status.ios?.status;
  if (
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  )
    return 'granted';
  if (status.granted) return 'granted';
  return status.status === 'undetermined' || status.canAskAgain ? 'undetermined' : 'denied';
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Trade alerts',
    description: 'A new congressional trade matched one of your alerts.',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function pushToken(): Promise<string> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

type Stored = { enabled: boolean; token: string | null };

interface PushState {
  /** Read storage and the system permission yet. */
  ready: boolean;
  /** This phone receives alert notifications: the switch is on and the system allows it. */
  enabled: boolean;
  permission: PushPermission;
  /** Set when this phone cannot get them at all; say this instead of offering the switch. */
  unsupported: string | null;
  busy: boolean;
  /** Asks the system if it has not been asked, then registers this phone. Call after explaining why. */
  enable: () => Promise<EnableResult>;
  disable: () => Promise<void>;
  /** For a permission the system will no longer ask about: only Settings can change it. */
  openSettings: () => void;
  /** Signs out, first taking this phone off the account so it stops getting that account's alerts. */
  signOut: () => Promise<void>;
}

const PushContext = createContext<PushState | null>(null);

export function PushProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, signOut: clerkSignOut } = useAuth();
  const authed = useAuthedRequest();
  const router = useRouter();
  const unsupported = UNSUPPORTED;
  const [stored, setStored] = useState<Stored>({ enabled: false, token: null });
  const [permission, setPermission] = useState<PushPermission>(unsupported ? 'unsupported' : 'undetermined');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = useCallback((next: Stored) => {
    setStored(next);
    void AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const readPermission = useCallback(async () => {
    if (unsupported) return 'unsupported' as const;
    const p = permissionOf(await Notifications.getPermissionsAsync());
    setPermission(p);
    return p;
  }, [unsupported]);

  // Storage and permission on launch, and the permission again whenever the
  // app comes back to the front, since it may have been changed in Settings.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw && live) setStored(JSON.parse(raw) as Stored);
      } catch {
        // Unreadable storage reads as "off", which is safe.
      }
      await readPermission().catch(() => {});
      if (live) setReady(true);
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void readPermission().catch(() => {});
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [readPermission]);

  // While on, re-register once per launch: it keeps the server's row fresh and
  // follows a token that rotated. If permission was taken away in Settings,
  // take the phone off the account instead, so the switch tells the truth.
  const synced = useRef(false);
  useEffect(() => {
    if (!ready || synced.current || !stored.enabled || !isSignedIn || unsupported) return;
    synced.current = true;
    void (async () => {
      const options = await authed();
      if (permission !== 'granted') {
        if (stored.token) await unregisterPushDevice(stored.token, options).catch(() => {});
        save({ enabled: false, token: null });
        return;
      }
      try {
        const token = await pushToken();
        await registerPushDevice(token, Platform.OS === 'android' ? 'android' : 'ios', options);
        if (token !== stored.token) save({ enabled: true, token });
      } catch {
        // Offline at launch: the row from last time still stands.
      }
    })();
  }, [ready, stored, isSignedIn, permission, unsupported, authed, save]);

  const enable = useCallback(async (): Promise<EnableResult> => {
    if (unsupported) return 'unsupported';
    if (!isSignedIn) return 'signed-out';
    setBusy(true);
    try {
      await ensureChannel();
      let p = await readPermission();
      if (p === 'undetermined') {
        p = permissionOf(await Notifications.requestPermissionsAsync());
        setPermission(p);
      }
      if (p !== 'granted') return 'denied';
      const token = await pushToken();
      await registerPushDevice(token, Platform.OS === 'android' ? 'android' : 'ios', await authed());
      save({ enabled: true, token });
      synced.current = true;
      return 'on';
    } catch {
      return 'error';
    } finally {
      setBusy(false);
    }
  }, [unsupported, isSignedIn, readPermission, authed, save]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      if (stored.token) await unregisterPushDevice(stored.token, await authed());
    } catch {
      // Off locally regardless. A row the server keeps is cleaned up when Expo
      // reports the token gone, or replaced when this phone registers again.
    } finally {
      save({ enabled: false, token: null });
      setBusy(false);
    }
  }, [stored.token, authed, save]);

  const signOut = useCallback(async () => {
    if (stored.enabled && stored.token) {
      await unregisterPushDevice(stored.token, await authed()).catch(() => {});
      save({ enabled: false, token: null });
    }
    await clerkSignOut();
  }, [stored, authed, save, clerkSignOut]);

  // A tapped alert opens its trades: the Trades tab, filtered the way the
  // alert is. The alert is looked up rather than carried in the payload,
  // which has a 4KB ceiling an alert with many members would pass. Covers a
  // tap that launched the app (the last response) and one while it runs.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (unsupported) return;
    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      const data = response.notification.request.content.data as { type?: string; alertId?: string } | undefined;
      if (data?.type !== 'alert' || !data.alertId) return;
      void (async () => {
        try {
          const list = await fetchAlerts(await authed());
          const alert = list.alerts.find((a) => a.id === data.alertId);
          if (alert) {
            router.push({ pathname: '/trades', params: { filters: JSON.stringify(fromAlertFilters(alert.filters)) } });
            return;
          }
        } catch {
          // Fall through to the list.
        }
        router.push('/email-alerts');
      })();
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => r && open(r))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [unsupported, authed, router]);

  const value = useMemo<PushState>(
    () => ({
      ready,
      // Signed out some other way than signOut below (an expired session, a
      // deleted account) reads as off; signing back in re-registers the phone
      // under whoever that is, since this phone already said yes.
      enabled: stored.enabled && permission === 'granted' && Boolean(isSignedIn),
      permission,
      unsupported,
      busy,
      enable,
      disable,
      openSettings: () => void Linking.openSettings(),
      signOut,
    }),
    [ready, stored.enabled, permission, isSignedIn, unsupported, busy, enable, disable, signOut]
  );

  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush(): PushState {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePush must be used inside PushProvider');
  return ctx;
}
