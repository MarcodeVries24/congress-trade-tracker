"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

/**
 * A table row or card that opens a page when clicked anywhere, the way the
 * app's trade rows do, while the links inside it (the member, the ticker, the
 * filing) keep going where they go. Cmd/Ctrl-click and middle-click open a new
 * tab, as a link would.
 *
 * The row is not itself a link, which a <tr> cannot be, so each row should
 * also carry a real <a> to the same place (the asset name, usually) for
 * keyboards and crawlers; Enter on the focused row works too.
 */
export function RowLink({
  href,
  as = "tr",
  className = "",
  children,
}: {
  href: string;
  as?: "tr" | "div";
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const fromInteractive = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, summary, [role=button]"));

  const onClick = (e: MouseEvent) => {
    if (fromInteractive(e.target)) return;
    // Selecting text in a row is not a click on it.
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };
  const onAuxClick = (e: MouseEvent) => {
    if (e.button === 1 && !fromInteractive(e.target)) window.open(href, "_blank", "noopener");
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
  };

  const props = {
    onClick,
    onAuxClick,
    onKeyDown,
    tabIndex: 0,
    className: `cursor-pointer ${className}`,
    "data-href": href,
  };
  return as === "tr" ? <tr {...props}>{children}</tr> : <div {...props}>{children}</div>;
}
