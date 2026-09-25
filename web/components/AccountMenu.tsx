"use client";

import { UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

// Sized to match Clerk's own menu-item icons (16px, stroked, currentColor).
function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
 */
export function AccountMenu() {
  const router = useRouter();
  return (
    <UserButton appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }}>
      <UserButton.MenuItems>
        <UserButton.Action label="Email alerts" labelIcon={<BellIcon />} onClick={() => router.push("/account")} />
      </UserButton.MenuItems>
    </UserButton>
  );
}
