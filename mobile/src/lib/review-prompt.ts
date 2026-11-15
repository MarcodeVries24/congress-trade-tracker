import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAccess } from '@/lib/access';

/**
 * Asking for an App Store / Play Store rating, with the stores' own prompt.
 *
 * No question of our own comes first ("Do you like CongTrade?"): Google's
 * in-app review rules forbid asking anything before or while showing the
 * prompt, and Apple's guidelines allow only the system prompt. Instead the
 * prompt is kept for moments when someone is likely getting value out of the
 * app: a subscriber who has opened it on a few different days, right after
 * they set up an alert, followed a politician, or looked at a trade an alert
 * brought them to.
 *
 * The systems decide whether the prompt actually appears (iOS at most three
 * times a year, Google by its own quota), so this only picks the moment, and
 * waits a while before picking another.
 */

const KEY = 'review-prompt.v1';
/** Distinct days the app was opened before asking. */
const MIN_OPEN_DAYS = 3;
/**
 * Between two asks, whether or not the system showed the first. iOS shows the
 * prompt at most three times a year anyway; Google's limit is its own.
 */
const ASK_EVERY_DAYS = 60;
/** How long after an alert notification is tapped a trade still counts as "from the alert". */
const FROM_ALERT_MS = 30 * 60_000;
/** Lets the screen that was closed (an alert sheet) finish animating away. */
const DELAY_MS = 900;

type Stored = { openDays: number; lastOpenDay: string | null; lastAskedAt: string | null };
const EMPTY: Stored = { openDays: 0, lastOpenDay: null, lastAskedAt: null };

async function read(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Stored>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(next: Stored) {
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

/** The local calendar day, so a late evening and the next morning are two days. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function countOpenDay() {
  const s = await read();
  const day = today();
  if (s.lastOpenDay === day) return;
  write({ ...s, openDays: s.openDays + 1, lastOpenDay: day });
}

/** Counts the days the app is opened on: at launch and on each return to it. Mount once. */
export function useCountOpenDays() {
  useEffect(() => {
    void countOpenDay();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void countOpenDay();
    });
    return () => sub.remove();
  }, []);
}

/**
 * Returns a function to call at a good moment (an alert saved, a politician
 * followed). It asks for a rating only when every condition holds, and does
 * nothing otherwise, so callers need not check anything.
 */
export function useAskForReview() {
  const { status } = useAccess();
  return useCallback(() => {
    // Subscribers only: everyone else is on the paywall or signed out.
    if (status !== 'pro') return;
    void (async () => {
      try {
        const s = await read();
        if (s.openDays < MIN_OPEN_DAYS) return;
        if (s.lastAskedAt && Date.now() - Date.parse(s.lastAskedAt) < ASK_EVERY_DAYS * 86_400_000) return;
        // The native prompt only, never a jump to the store: false on web and
        // on TestFlight builds.
        if (!(await StoreReview.isAvailableAsync())) return;
        write({ ...s, lastAskedAt: new Date().toISOString() });
        setTimeout(() => void StoreReview.requestReview().catch(() => {}), DELAY_MS);
      } catch {
        // A rating prompt is never worth an error.
      }
    })();
  }, [status]);
}

/** When an alert notification was last tapped (push.tsx), in this run of the app. */
let alertTappedAt = 0;

/** Called when an alert notification opens the app on that alert's trades. */
export function noteAlertTapped() {
  alertTappedAt = Date.now();
}

/**
 * For the trade screen: when someone who came in through an alert notification
 * goes back from a trade, they have just had what the app is for, which is a
 * good moment to ask (if it is due). Counts once per notification tap.
 */
export function useAskAfterAlertTrade() {
  const askForReview = useAskForReview();
  // The latest one, so the check below runs once, on leaving the screen, and
  // not each time the subscription status settles while it is open.
  const ask = useRef(askForReview);
  useEffect(() => {
    ask.current = askForReview;
  }, [askForReview]);
  useEffect(
    () => () => {
      if (!alertTappedAt || Date.now() - alertTappedAt > FROM_ALERT_MS) return;
      alertTappedAt = 0;
      ask.current();
    },
    []
  );
}
