/**
 * Cong, the mascot, in one of the moods from the designer's moving library:
 * transparent looping cut-outs (lossless animated WebP, 230 × 260) for the
 * moments a person would say something (nothing found, an error, a welcome),
 * not decoration for its own sake.
 *
 * Decorative: always beside text that says the same thing, so hidden from
 * assistive tech. A visitor who asked for reduced motion gets the still first
 * frame instead, through <picture>, with no JavaScript involved. Plain <img>
 * rather than next/image, which would re-encode the animation to a still.
 */
export type CongMood =
  | "no-results"
  | "oops"
  | "under-repair"
  | "turn-on-alerts"
  | "go-premium"
  | "about-us"
  | "welcome-back"
  | "all-quiet"
  | "champion";

export function Cong({ mood, width = 120, className = "" }: { mood: CongMood; width?: number; className?: string }) {
  return (
    <picture className={`block shrink-0 ${className}`} aria-hidden>
      <source srcSet={`/cong/${mood}-still.png`} media="(prefers-reduced-motion: reduce)" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/cong/${mood}.webp`}
        alt=""
        width={width}
        height={Math.round((width * 260) / 230)}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
