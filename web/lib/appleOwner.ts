import { grantsAccess, type SubscriptionRow } from "@congtrade/shared/subscriptionAccess";

/**
 * Which CongTrade account an App Store subscription belongs to.
 *
 * Apple keeps one subscription per Apple Account for all its life: a plan
 * change, and subscribing again years after it ended, carry the same original
 * transaction id, and so the same row here. What can change is the token in
 * the latest purchase, which names whoever was signed in when they tapped buy.
 * The row and the token then disagree, in two quite different ways:
 *
 *  - The account holding it still has Pro from it, and someone signed in as
 *    another account changed its plan. It stays with the holder, who is the
 *    one using it.
 *  - The holder's has ended, and someone subscribed anew signed in as another
 *    account. They paid for that account, so it is theirs.
 *
 * Import-light so the rule can be tested on its own.
 */

/** A row past its period by more than this has ended, even if Apple's word of it was lost. */
const LATE_MS = 60 * 60 * 1000;

export function appleOwner(
  holder: SubscriptionRow | null,
  /** The account the purchase's token names, if it still exists. */
  tokenUser: string | null,
  now = Date.now()
): string | null {
  if (!holder) return tokenUser;
  if (!tokenUser || tokenUser === holder.clerk_user_id) return holder.clerk_user_id;
  const over = holder.current_period_end !== null && new Date(holder.current_period_end).getTime() < now - LATE_MS;
  return grantsAccess(holder) && !over ? holder.clerk_user_id : tokenUser;
}
