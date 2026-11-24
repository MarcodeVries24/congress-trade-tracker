/**
 * When Discover may show the card that notifications are off (ui/push-nudge).
 * Apart from the card, so the rule can be read and tested on its own.
 */

export type NudgeState = {
  /** When the card last had its turn: first found to be due, or put away (ms). */
  at: number;
  /** How often it was put away. */
  dismissed: number;
};

const DAY = 24 * 60 * 60 * 1000;
/** Someone who has just said "not now" is not asked again the same day. */
const FIRST_AFTER = DAY;
const AGAIN_AFTER = 14 * DAY;
/** After this many times no, the answer is no. */
const MAX_DISMISSED = 3;

export function nudgeDue(state: NudgeState, now: number): boolean {
  if (state.dismissed >= MAX_DISMISSED) return false;
  return now - state.at >= (state.dismissed === 0 ? FIRST_AFTER : AGAIN_AFTER);
}
