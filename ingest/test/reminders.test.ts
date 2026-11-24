// Who is due a push reminder (src/alerts/reminderRules.ts).
//
//   npx tsx ingest/test/reminders.test.ts
//
// Prints one line per assertion and exits non-zero if any failed.

import { inTrial, reminderFor, type ReminderFacts } from "../src/alerts/reminderRules.js";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${actual}, expected ${expected}`}`);
}

const now = new Date("2026-11-24T15:23:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
const ahead = (days: number) => ago(-days);

function due(over: Partial<ReminderFacts>) {
  return reminderFor(
    {
      registeredAt: ago(60),
      openedAt: ago(10),
      remindedAt: null,
      alerts: 0,
      activeAlerts: 0,
      alertsTouchedAt: null,
      trial: false,
      ...over,
    },
    now
  );
}

check("no alerts: reminded", due({}), "first-alert");
check("no alerts, phone registered yesterday: not yet", due({ registeredAt: ago(1), openedAt: ago(1) }), null);
check("no alerts, opened today: not", due({ openedAt: ago(0.5) }), null);
check("no alerts, reminded 3 days ago: not again", due({ remindedAt: ago(3) }), null);
check("no alerts, reminded just under a week ago: again", due({ remindedAt: ago(6.9) }), "first-alert");

const quiet = { alerts: 2, activeAlerts: 1, alertsTouchedAt: ago(15) };
check("quiet for 15 days: reminded", due(quiet), "quiet");
check("quiet for 10 days: not yet", due({ ...quiet, alertsTouchedAt: ago(10) }), null);
check("quiet, opened 2 days ago: not", due({ ...quiet, openedAt: ago(2) }), null);
check("quiet, reminded a week ago: not again", due({ ...quiet, remindedAt: ago(8) }), null);
check("quiet, reminded two weeks ago: again", due({ ...quiet, remindedAt: ago(14) }), "quiet");
check("every alert paused: chose silence", due({ ...quiet, activeAlerts: 0 }), null);

const trial = { ...quiet, trial: true, alertsTouchedAt: ago(7) };
check("trial, quiet for a week: reminded", due(trial), "quiet");
check("trial, opened 2 days ago: still reminded", due({ ...trial, openedAt: ago(2) }), "quiet");
check("trial, opened today: not", due({ ...trial, openedAt: ago(0.5) }), null);
check("trial, quiet for 5 days: not yet", due({ ...trial, alertsTouchedAt: ago(5) }), null);

check("14 day trial on yearly", inTrial({ annual: true, startedAt: ago(7), periodEnd: ahead(7) }, now), true);
check("yearly, paid", inTrial({ annual: true, startedAt: ago(20), periodEnd: ahead(359) }, now), false);
check("monthly is never a trial", inTrial({ annual: false, startedAt: ago(7), periodEnd: ahead(23) }, now), false);
check("trial that has ended", inTrial({ annual: true, startedAt: ago(20), periodEnd: ago(6) }, now), false);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
