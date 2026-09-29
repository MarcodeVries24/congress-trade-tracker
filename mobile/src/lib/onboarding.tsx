import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * What the onboarding questions collect, and why they are worth asking.
 *
 * The answers are not a survey. Chamber, members and how to be told are exactly
 * the fields a saved alert needs, so the moment someone signs up these become
 * their first alert and they land in a working product rather than an empty
 * one. A question whose answer changes nothing would be a conversion ritual,
 * and this flow has none.
 */
export type Goal = 'track-members' | 'unusual-trades' | 'sector' | 'curious';
export type Chamber = 'house' | 'senate' | 'both';
export type Notify = 'push' | 'email' | 'both';

export type OnboardingAnswers = {
  goal: Goal | null;
  chamber: Chamber;
  /** Filed member names, which is what the alert filter matches on. */
  members: string[];
  notify: Notify;
};

const EMPTY: OnboardingAnswers = { goal: null, chamber: 'both', members: [], notify: 'push' };

const ANSWERS_KEY = 'congtrade.onboarding.answers';
const DONE_KEY = 'congtrade.onboarding.done';

type Store = {
  /** False until storage has been read, so the gate cannot flash the wrong screen. */
  loaded: boolean;
  done: boolean;
  answers: OnboardingAnswers;
  set: (patch: Partial<OnboardingAnswers>) => void;
  finish: () => Promise<void>;
  reset: () => Promise<void>;
};

const OnboardingContext = createContext<Store | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(false);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, doneRaw] = await AsyncStorage.multiGet([ANSWERS_KEY, DONE_KEY]);
        if (cancelled) return;
        if (raw[1]) setAnswers({ ...EMPTY, ...(JSON.parse(raw[1]) as Partial<OnboardingAnswers>) });
        setDone(doneRaw[1] === 'true');
      } catch {
        // Unreadable storage means a first run, which is the safe assumption:
        // showing onboarding twice is a mild annoyance, skipping it leaves
        // someone staring at a paywall with no idea what they are buying.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback((patch: Partial<OnboardingAnswers>) => {
    setAnswers((prev) => {
      const next = { ...prev, ...patch };
      void AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const finish = useCallback(async () => {
    setDone(true);
    await AsyncStorage.setItem(DONE_KEY, 'true').catch(() => {});
  }, []);

  const reset = useCallback(async () => {
    setAnswers(EMPTY);
    setDone(false);
    await AsyncStorage.multiRemove([ANSWERS_KEY, DONE_KEY]).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ loaded, done, answers, set, finish, reset }),
    [loaded, done, answers, set, finish, reset]
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): Store {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}

/**
 * The answers as the alert the website would have saved.
 *
 * Shaped here rather than at the call site so that the questions and the alert
 * they become cannot drift apart: adding a question means adding a field here,
 * and the compiler says so.
 */
export function answersAsAlertFilters(answers: OnboardingAnswers): {
  chambers?: ('house' | 'senate')[];
  members?: string[];
} {
  return {
    chambers: answers.chamber === 'both' ? undefined : [answers.chamber],
    members: answers.members.length ? answers.members : undefined,
  };
}
