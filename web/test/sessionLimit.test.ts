// The browser cap in lib/sessionLimit.ts, run against a stand-in Clerk client.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/sessionLimit.test.ts
//
// Reaching the branch that revokes anything would need a live Clerk instance, a
// paid subscription and four signed-in browsers, so the client is faked; the
// shape of the fake is checked by the compiler, because lib/sessionLimit.ts
// assigns the real client to the same type with no cast.
//
// Prints one line per assertion and exits non-zero if any failed.

import {
  enforceSessionLimit,
  MAX_CONCURRENT_SESSIONS,
  type SessionLimitClient,
} from "../lib/sessionLimit";

const PRO = { subscriptionItems: [{ status: "active", plan: { features: [{ slug: "filters" }] } }] };
const FREE = { subscriptionItems: [{ status: "active", plan: { features: [] } }] };

type Session = { id: string; lastActiveAt: number; createdAt: number };

type Opts = {
  metadata?: unknown;
  subscription?: unknown;
  userError?: { status?: number };
  billingError?: { status?: number };
  sessions?: Session[];
  failRevoke?: string[];
};

function fakeClerk(opts: Opts) {
  const calls = { getUser: 0, billing: 0, list: 0, revoked: [] as string[] };
  const client: SessionLimitClient = {
    users: {
      async getUser() {
        calls.getUser++;
        if (opts.userError) throw Object.assign(new Error("user lookup failed"), opts.userError);
        return { publicMetadata: opts.metadata ?? {} };
      },
    },
    billing: {
      async getUserBillingSubscription() {
        calls.billing++;
        if (opts.billingError) throw Object.assign(new Error("billing failed"), opts.billingError);
        return (opts.subscription ?? FREE) as never;
      },
    },
    sessions: {
      async getSessionList(params) {
        calls.list++;
        if (params.status !== "active" || params.limit !== 100) {
          throw new Error(`unexpected list params: ${JSON.stringify(params)}`);
        }
        return { data: opts.sessions ?? [] };
      },
      async revokeSession(id) {
        if (opts.failRevoke?.includes(id)) throw new Error("revoke refused");
        calls.revoked.push(id);
        return null;
      },
    },
  };
  return { client, calls };
}

// Six browsers whose sign-in order is the exact reverse of their last-used
// order, which is the whole point of sorting on lastActiveAt: the browser
// signed into first is the one still in daily use, and the one signed into
// most recently has sat idle since. Deliberately unsorted in the response.
const six: Session[] = [
  { id: "s_idle_2", lastActiveAt: 200, createdAt: 50 },
  { id: "s_used_today", lastActiveAt: 600, createdAt: 10 },
  { id: "s_idle_longest", lastActiveAt: 100, createdAt: 60 },
  { id: "s_used_last_week", lastActiveAt: 400, createdAt: 30 },
  { id: "s_idle_1", lastActiveAt: 300, createdAt: 40 },
  { id: "s_used_yesterday", lastActiveAt: 500, createdAt: 20 },
];

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`
  );
}

async function main() {
  console.log(`MAX_CONCURRENT_SESSIONS = ${MAX_CONCURRENT_SESSIONS}\n`);

  // --- who the cap applies to ---
  {
    const { client, calls } = fakeClerk({ subscription: FREE, sessions: six });
    check("free account, 6 browsers: revokes nothing", await enforceSessionLimit("u", client), []);
    check("free account: never even lists sessions", calls.list, 0);
  }
  {
    const { client, calls } = fakeClerk({
      metadata: { admin: true },
      subscription: PRO,
      sessions: six,
    });
    check("comped admin, 6 browsers: revokes nothing", await enforceSessionLimit("u", client), []);
    check("comped admin: never asks billing", calls.billing, 0);
  }

  // --- the cap itself ---
  {
    const { client } = fakeClerk({ subscription: PRO, sessions: six.slice(0, 3) });
    check("pro, 3 browsers: revokes nothing", await enforceSessionLimit("u", client), []);
  }
  {
    const { client } = fakeClerk({ subscription: PRO, sessions: six.slice(0, 4) });
    check(
      "pro, 4 browsers: revokes the one idle longest",
      await enforceSessionLimit("u", client),
      ["s_idle_longest"]
    );
  }
  {
    const { client, calls } = fakeClerk({ subscription: PRO, sessions: six });
    const revoked = await enforceSessionLimit("u", client);
    check("pro, 6 browsers: revokes the 3 idlest, least idle first", revoked, [
      "s_idle_1",
      "s_idle_2",
      "s_idle_longest",
    ]);
    check("pro, 6 browsers: those are the ones actually revoked", calls.revoked, revoked);
    check(
      "the browsers still in use survive, however long ago they signed in",
      six.filter((s) => !revoked.includes(s.id)).map((s) => s.id).sort(),
      ["s_used_last_week", "s_used_today", "s_used_yesterday"]
    );
  }
  {
    // Same six, judged on sign-in date instead: the survivors would have been
    // the three idle ones. Sorting on the wrong field is not a near miss.
    const byCreated = [...six].sort((a, b) => b.createdAt - a.createdAt).slice(MAX_CONCURRENT_SESSIONS);
    check(
      "sanity: sorting on createdAt would have revoked the opposite three",
      byCreated.map((s) => s.id),
      ["s_used_last_week", "s_used_yesterday", "s_used_today"]
    );
  }
  {
    const tied: Session[] = [
      { id: "s_a", lastActiveAt: 500, createdAt: 90 },
      { id: "s_b", lastActiveAt: 500, createdAt: 80 },
      { id: "s_c", lastActiveAt: 500, createdAt: 70 },
      { id: "s_oldest_signin", lastActiveAt: 500, createdAt: 60 },
    ];
    const { client } = fakeClerk({ subscription: PRO, sessions: tied });
    check(
      "equally active browsers: sign-in date breaks the tie",
      await enforceSessionLimit("u", client),
      ["s_oldest_signin"]
    );
  }
  {
    const pastDue = {
      subscriptionItems: [{ status: "past_due", plan: { features: [{ slug: "notifications" }] } }],
    };
    const { client } = fakeClerk({ subscription: pastDue, sessions: six });
    check("past_due pro: still capped", (await enforceSessionLimit("u", client)).length, 3);
  }

  // --- resilience ---
  {
    const { client } = fakeClerk({ subscription: PRO, sessions: six, failRevoke: ["s_idle_2"] });
    check("one revoke fails: the other two still go", await enforceSessionLimit("u", client), [
      "s_idle_1",
      "s_idle_longest",
    ]);
  }

  // --- fail directions ---
  {
    const { client, calls } = fakeClerk({ userError: { status: 404 }, sessions: six });
    check("deleted user: nothing to do, no retry", await enforceSessionLimit("u", client), []);
    check("deleted user: never lists sessions", calls.list, 0);
  }
  {
    const { client } = fakeClerk({ billingError: { status: 404 }, sessions: six });
    check("no subscription record: treated as free", await enforceSessionLimit("u", client), []);
  }
  for (const [name, opts] of [
    ["user lookup 503", { userError: { status: 503 }, sessions: six }],
    ["billing 503", { billingError: { status: 503 }, sessions: six }],
  ] as [string, Opts][]) {
    const { client, calls } = fakeClerk(opts);
    let threw = false;
    try {
      await enforceSessionLimit("u", client);
    } catch {
      threw = true;
    }
    check(`${name}: throws so the webhook 500s and Clerk retries`, threw, true);
    check(`${name}: revokes nothing`, calls.revoked, []);
  }

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
