"use client";

import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useProMirror } from "@/lib/useProMirror";

// Sized to match Clerk's own menu-item icons (16px, stroked, currentColor).
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m12 3 2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" />
    </svg>
  );
}

/**
 * The avatar menu, with a way into the account screen.
 *
 * Uses `UserButton.Action` with a router push rather than `UserButton.Link`,
 * because Clerk drops a `.Link` entry from the menu while you're on the page
 * it points at — so the item vanished exactly when someone was managing their
 * alerts and went looking for it. An action carries no href, so nothing can
 * route-match it away and the menu reads the same everywhere.
 *
 * The only cost is that it's a button rather than an anchor, so it can't be
 * middle-clicked into a new tab. Worth it for a menu that doesn't change
 * shape under you.
 *
 * Upgrade sits above it, and only for someone who isn't already paying. It is
 * gated on `loaded` as well as `isPro` so a subscriber never sees a flash of
 * "Upgrade to Pro" while Clerk is still resolving who they are. Clerk skips
 * falsy children here without complaint, so the conditional is safe.
 */
export function AccountMenu() {
  const router = useRouter();
  const { loaded, isPro } = useProMirror();
  return (
    <UserButton appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }}>
      <UserButton.MenuItems>
        {loaded && !isPro && (
          <UserButton.Action label="Upgrade to Pro" labelIcon={<SparkleIcon />} onClick={() => router.push("/upgrade")} />
        )}
        {/* "Account" rather than "Email alerts": the page also holds the plan,
            and naming it after only half its contents is why the way to
            upgrade was hard to find. Same label as the phone menu. */}
        <UserButton.Action label="Account & alerts" labelIcon={<BellIcon />} onClick={() => router.push("/account")} />
      </UserButton.MenuItems>
    </UserButton>
  );
}
