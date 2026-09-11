"use client";

import { useState } from "react";

const AVATAR_COLORS = [
  "bg-rose-500/20 text-rose-600 dark:text-rose-300",
  "bg-amber-500/20 text-amber-600 dark:text-amber-300",
  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300",
  "bg-sky-500/20 text-sky-600 dark:text-sky-300",
  "bg-violet-500/20 text-violet-600 dark:text-violet-300",
  "bg-pink-500/20 text-pink-600 dark:text-pink-300",
  "bg-teal-500/20 text-teal-600 dark:text-teal-300",
  "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300",
];

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function InitialsAvatar({ name }: { name: string }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(name)}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

// Official photos are hotlinked from congress.gov; fall back to an initials
// avatar if one isn't mapped yet or fails to load, rather than guessing.
export function MemberPhoto({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!photoUrl || errored) return <InitialsAvatar name={name} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl} alt="" onError={() => setErrored(true)} className="h-8 w-8 shrink-0 rounded-full bg-panel-muted object-cover" />
  );
}
