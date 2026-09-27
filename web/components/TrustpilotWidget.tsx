"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A Trustpilot TrustBox.
 *
 * Their own widget, their own script, their own iframe: the rating shown is
 * whatever Trustpilot says it is, which is the only version worth showing and
 * the only version their terms allow. Nothing here can be styled into saying
 * something else.
 *
 * Template choice carries the decision about what appears. Micro TrustScore
 * prints the score and the stars; Micro Star prints the stars alone; neither
 * prints the review count, which is a property of those templates rather than
 * anything hidden after the fact.
 *
 * Note for whoever wonders why the badge is only a logo: the TrustScore is
 * computed from the last twelve months of reviews. With none in that window
 * there is no score to draw, and the widget falls back to the wordmark. It
 * starts showing stars on its own once reviews land — no deploy needed.
 */
const BUSINESS_UNIT_ID = "6ab792a6788645343cb69c10";
const PROFILE_URL = "https://www.trustpilot.com/review/congtrade.com";
const SCRIPT_SRC = "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

export const TRUSTPILOT_TEMPLATES = {
  /** Score and stars, no review count. */
  microTrustScore: { id: "5419b637fa0340045cd0c936", height: "20px" },
  /** Stars alone. */
  microStar: { id: "5419b732fbfb950b10de65e5", height: "24px" },
  /** "Review us on Trustpilot" button. */
  reviewCollector: { id: "56278e9abfbbba0bdcd568bc", height: "52px" },
} as const;

type TrustpilotApi = { loadFromElement: (el: HTMLElement, forceReload?: boolean) => void };

declare global {
  interface Window {
    Trustpilot?: TrustpilotApi;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Loaded once per page however many widgets ask for it. */
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      if (window.Trustpilot) resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("trustpilot script failed")), { once: true });
    document.head.appendChild(script);
  }).catch(() => {
    // A blocked or failed script leaves the plain link below in place, which
    // is a perfectly good trust mark on its own.
    scriptPromise = null;
  });
  return scriptPromise;
}

export function TrustpilotWidget({
  template,
  className = "",
  label = "See CongTrade on Trustpilot",
}: {
  template: keyof typeof TRUSTPILOT_TEMPLATES;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dark, setDark] = useState(false);
  const { id, height } = TRUSTPILOT_TEMPLATES[template];

  // The widget bakes its colours in at load, so a theme change has to
  // re-initialise it rather than restyle it.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadScript().then(() => {
      if (!cancelled && ref.current && window.Trustpilot) window.Trustpilot.loadFromElement(ref.current, true);
    });
    return () => {
      cancelled = true;
    };
  }, [dark, id]);

  return (
    <div
      ref={ref}
      className={`trustpilot-widget ${className}`}
      data-locale="en-US"
      data-template-id={id}
      data-businessunit-id={BUSINESS_UNIT_ID}
      data-style-height={height}
      data-style-width="100%"
      data-theme={dark ? "dark" : "light"}
    >
      {/* Trustpilot replaces this with the iframe. It stays the fallback for
          anyone whose browser blocks the script. */}
      <a href={PROFILE_URL} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </div>
  );
}
