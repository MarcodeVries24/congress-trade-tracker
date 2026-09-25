"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function InitialsAvatar({ name, className = "h-8 w-8 text-xs" }: { name: string; className?: string }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${className} ${avatarColor(name)}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

// stored photo_url points at bioguide.congress.gov, whose own photo
// directory — despite covering ~99% of members per the ingest pipeline's
// notes — 404s for some (newly appointed members especially, before their
// photo is uploaded there). Extracting the bioguide ID lets us retry
// against the community-maintained unitedstates/images mirror, which often
// has a photo bioguide.congress.gov is still missing.
function bioguideIdFromPhotoUrl(photoUrl: string): string | null {
  const m = photoUrl.match(/\/([A-Za-z]\d{6})\.jpg$/);
  return m ? m[1].toUpperCase() : null;
}

function fallbackPhotoUrl(photoUrl: string): string | null {
  const id = bioguideIdFromPhotoUrl(photoUrl);
  return id ? `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/${id}.jpg` : null;
}

// Official photos are hotlinked from congress.gov, with a fallback mirror
// tried before giving up to an initials avatar (see bioguideIdFromPhotoUrl
// above) — only if that's unavailable or itself fails to load does this
// guess with initials instead.
export function MemberPhoto({
  name,
  photoUrl,
  // Sizing is a prop rather than fixed so a profile header can show a real
  // portrait while list rows keep their 32px avatar. Passed through to the
  // initials fallback too, or a failed photo would change the layout.
  className = "h-8 w-8",
}: {
  name: string;
  photoUrl: string | null;
  className?: string;
}) {
  const [stage, setStage] = useState<"primary" | "fallback" | "failed">("primary");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fallback = photoUrl ? fallbackPhotoUrl(photoUrl) : null;

  const advance = useCallback(() => {
    setStage((s) => (s === "primary" && fallback ? "fallback" : "failed"));
  }, [fallback]);

  // On a server-rendered page — the member and issuer pages — the browser
  // starts fetching this <img> from the HTML, long before React hydrates. If
  // it 404s in that window the error event has already come and gone, so the
  // onError below never runs and the photo stays a broken-image icon forever
  // (seen on Josh Gottheimer, whose bioguide.congress.gov portrait is
  // missing). A finished image with no intrinsic width is exactly that case,
  // so check for it once the handler is finally attached. Re-runs per stage,
  // since the fallback can have failed by then too.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) advance();
  }, [stage, advance]);

  const initialsClass = `${className} ${className.includes("h-8") ? "text-xs" : "text-lg"}`;
  if (!photoUrl || stage === "failed") return <InitialsAvatar name={name} className={initialsClass} />;

  const src = stage === "primary" ? photoUrl : fallback;
  if (!src) return <InitialsAvatar name={name} className={initialsClass} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt=""
      onError={advance}
      className={`shrink-0 rounded-full bg-panel-muted object-cover ${className}`}
    />
  );
}
