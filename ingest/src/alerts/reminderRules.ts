/**
 * Who is due a push reminder, and which. Apart from sendReminders.ts, which
 * talks to the database, so the rules can be tested on their own.
 *
 * Deliberately rare, because a notification too many costs the permission for
 * all of them, the alerts included.
 */

export type Reminder =
  /** No alert at all: set up a first one. */
  | "first-alert"
  /** Alerts, but nothing from them for a while. */
  | "quiet";

export interface ReminderFacts {
  /** When this person's first phone was registered. */
  registeredAt: Date;
  /** When the app was last started on any of their phones. */
  openedAt: Date;
  remindedAt: Date | null;
  alerts: number;
  activeAlerts: number;
  /** The latest anything happened with their alerts: one was sent, made or changed. */
  alertsTouchedAt: Date | null;
  /** In a free trial, which is over before the usual two weeks are. */
  trial: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
/** The runs' times shift a little; without this a week could become a week and four hours. */
const SLACK = 4 * 60 * 60 * 1000;

const atLeast = (since: Date, days: number, now: Date) => now.getTime() - since.getTime() >= days * DAY;

export function reminderFor(p: ReminderFacts, now: Date): Reminder | null {
  const rested = (days: number) => !p.remindedAt || atLeast(p.remindedAt, days - SLACK / DAY, now);

  if (p.alerts === 0) {
    const due = atLeast(p.registeredAt, 2, now) && atLeast(p.openedAt, 1, now) && rested(7);
    return due ? "first-alert" : null;
  }
  // Someone who paused every alert chose silence.
  if (p.activeAlerts === 0 || !p.alertsTouchedAt) return null;

  // In a trial the usual two weeks would come as it ends, too late to show
  // what the subscription is for.
  const quietDays = p.trial ? 7 : 14;
  const awayDays = p.trial ? 1 : 3;
  const due = atLeast(p.alertsTouchedAt, quietDays, now) && atLeast(p.openedAt, awayDays, now) && rested(14);
  return due ? "quiet" : null;
}

/**
 * Whether a subscription is in its free trial. The stores report a trial as
 * simply active, so it is told by its shape: the trial is on the yearly plan,
 * and while it runs the period ends weeks after the subscription began rather
 * than a year after.
 */
export function inTrial(s: { annual: boolean; startedAt: Date; periodEnd: Date | null }, now: Date): boolean {
  if (!s.annual || !s.periodEnd || s.periodEnd <= now) return false;
  return s.periodEnd.getTime() - s.startedAt.getTime() < 60 * DAY;
}
