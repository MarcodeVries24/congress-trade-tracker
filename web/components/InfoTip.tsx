"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * A small ⓘ that holds a sentence of explanation until it's asked for.
 *
 * The volume note was printed in full on five pages, which is how a caveat
 * stops being read: repeated often enough, it becomes furniture. Once beside
 * the figure it explains, it's there for the person who wonders and out of the
 * way of everyone else.
 *
 * The text stays in the DOM in a visually-hidden span rather than only in a
 * title attribute, so a screen reader and a crawler both still get it — a
 * title alone is also invisible on a touch screen, which is most of this
 * site's traffic.
 */
export function InfoTip({ text, label = "What this means" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const id = useId();
  const ref = useRef<HTMLSpanElement | null>(null);
  const noteRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Centred on the icon, the card runs off screen whenever the icon sits
  // within half its width of an edge — which on a phone is most of the time,
  // since these sit at the end of a label. Measure once open and nudge it back
  // inside, keeping the icon as the anchor everywhere it fits.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const node = noteRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    const overRight = rect.right - (window.innerWidth - margin);
    const overLeft = margin - rect.left;
    setShift(overRight > 0 ? -overRight : overLeft > 0 ? overLeft : 0);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={text}
        // Sized and seated to the figure it annotates rather than to the line
        // box: 0.72em is the cap height of this typeface, so the ring matches
        // the height of "$3.6B" beside it, and its bottom sits on the same
        // baseline. The glyph is taken out of flow so the button has no inline
        // baseline of its own to be aligned by — without that, the flex item's
        // baseline governs and the ring floats. The single pixel back up is
        // measured, not guessed: without it the ring lands 1px under the
        // baseline in this typeface.
        //
        // before:-inset-2 restores a finger-sized target around a ring that is
        // only ~9px across at this text size.
        className="relative -top-px ml-[3px] inline-block h-[0.72em] w-[0.72em] shrink-0 rounded-full border border-line-strong align-baseline text-ink-faint transition-colors before:absolute before:-inset-2 before:content-[''] hover:border-ink-faint hover:text-ink-muted"
      >
        <span className="absolute inset-0 flex items-center justify-center text-[0.52em] font-semibold leading-none">i</span>
      </button>
      {open && (
        <span
          ref={noteRef}
          id={id}
          role="note"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="absolute left-1/2 top-[calc(100%+7px)] z-30 block w-64 max-w-[calc(100vw-1rem)] whitespace-normal break-words rounded-lg border border-line bg-panel px-3 py-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-ink-muted shadow-lg sm:w-72"
        >
          {text}
        </span>
      )}
      <span className="sr-only">{text}</span>
    </span>
  );
}
