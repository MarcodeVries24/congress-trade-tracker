/**
 * Feedback people send from the app or the website: what kinds there are, and
 * the limits a message has to keep to.
 *
 * Shared because the form shows the same kinds and counts the same characters
 * that the server then checks, and a form that lets through what the server
 * refuses only moves the error to a worse moment.
 */
export const FEEDBACK_KINDS = {
  idea: "Idea",
  bug: "Something's broken",
  data: "Data looks wrong",
  other: "Other",
} as const;

export type FeedbackKind = keyof typeof FEEDBACK_KINDS;

export const FEEDBACK_KIND_KEYS = Object.keys(FEEDBACK_KINDS) as FeedbackKind[];

/** Where a message was sent from. */
export type FeedbackSource = "ios" | "android" | "web";

export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 2000;

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  /** Where to reply, or null for none. */
  email: string | null;
  source: FeedbackSource;
  appVersion: string | null;
  osVersion: string | null;
  /** The screen or page it was opened from, such as "help". */
  screen: string | null;
}

export type FeedbackReadResult = { ok: true; value: FeedbackInput } | { ok: false; error: string };

// Enough to catch a typo, not a full RFC 5322 parser: the address is only
// ever a reply-to, and a person reads it before anything is sent to it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A short label such as a version or screen name, or null if absent or odd. */
function shortLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, 40);
  return /^[\w .:/()+-]+$/.test(v) ? v : null;
}

/**
 * Checks a submitted body and returns it tidied, or the sentence to show.
 * The message keeps its line breaks; leading and trailing space is dropped.
 */
export function readFeedback(body: unknown): FeedbackReadResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind;
  if (typeof kind !== "string" || !FEEDBACK_KIND_KEYS.includes(kind as FeedbackKind)) {
    return { ok: false, error: "Pick what your feedback is about." };
  }
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (message.length < FEEDBACK_MIN_LENGTH) return { ok: false, error: "Write a few words first." };
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { ok: false, error: `Keep it under ${FEEDBACK_MAX_LENGTH.toLocaleString("en-US")} characters.` };
  }
  const rawEmail = typeof b.email === "string" ? b.email.trim() : "";
  if (rawEmail && (rawEmail.length > 254 || !EMAIL.test(rawEmail))) {
    return { ok: false, error: "That email address doesn't look right." };
  }
  const source: FeedbackSource = b.source === "ios" || b.source === "android" ? b.source : "web";
  return {
    ok: true,
    value: {
      kind: kind as FeedbackKind,
      message,
      email: rawEmail || null,
      source,
      appVersion: shortLabel(b.appVersion),
      osVersion: shortLabel(b.osVersion),
      screen: shortLabel(b.screen),
    },
  };
}
