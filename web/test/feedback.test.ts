// What POST /api/feedback accepts, and how it tidies a message.
//
//   npx tsx --tsconfig web/test/tsconfig.json web/test/feedback.test.ts
//
// readFeedback is pure and shared with the app's and the website's forms, so
// the form and the server can never disagree about what is allowed.

import { FEEDBACK_MAX_LENGTH, readFeedback } from "@congtrade/shared/feedback";

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${got}, want ${want}`}`);
}

const base = { kind: "idea", message: "Add a dark mode", source: "ios", appVersion: "1.0.0", osVersion: "18.0" };
const ok = (body: unknown) => {
  const r = readFeedback(body);
  return r.ok ? r.value : null;
};
const error = (body: unknown) => {
  const r = readFeedback(body);
  return r.ok ? null : r.error;
};

check("a plain message is accepted", ok(base)?.message, "Add a dark mode");
check("surrounding space is trimmed", ok({ ...base, message: "  hi there \n" })?.message, "hi there");
check("line breaks inside are kept", ok({ ...base, message: "one\ntwo" })?.message, "one\ntwo");
check("no kind is refused", error({ ...base, kind: undefined }), "Pick what your feedback is about.");
check("an unknown kind is refused", error({ ...base, kind: "praise" }), "Pick what your feedback is about.");
check("a kind from the prototype chain is refused", error({ ...base, kind: "toString" }), "Pick what your feedback is about.");
check("too short is refused", error({ ...base, message: " a " }), "Write a few words first.");
check("exactly the maximum is accepted", ok({ ...base, message: "x".repeat(FEEDBACK_MAX_LENGTH) }) !== null, true);
check("one over the maximum is refused", error({ ...base, message: "x".repeat(FEEDBACK_MAX_LENGTH + 1) })?.startsWith("Keep it under"), true);
check("no email becomes null", ok(base)?.email, null);
check("a valid email is kept", ok({ ...base, email: " a@b.co " })?.email, "a@b.co");
check("a broken email is refused", error({ ...base, email: "not-an-email" }), "That email address doesn't look right.");
check("an unknown source counts as the website", ok({ ...base, source: "fax" })?.source, "web");
check("android stays android", ok({ ...base, source: "android" })?.source, "android");
check("a label with markup is dropped", ok({ ...base, screen: "<script>" })?.screen, null);
check("a normal screen name is kept", ok({ ...base, screen: "Help" })?.screen, "Help");
check("a long version is cut to 40 characters", ok({ ...base, appVersion: "1".repeat(60) })?.appVersion?.length, 40);
check("a missing body is refused, not thrown", error(null), "Pick what your feedback is about.");

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
