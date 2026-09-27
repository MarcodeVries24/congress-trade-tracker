import type { CSSProperties } from "react";
import { AmericanFlag } from "./AmericanFlag";

/**
 * The flag behind the banner on the home and trades pages.
 *
 * One switch, two looks. `photo` uses public/american.png; `illustration`
 * uses the drawn SVG in AmericanFlag.tsx, which is what the site shipped
 * with. Change the constant below and both pages follow — the point being
 * that this is a taste decision someone may want to take back without
 * unpicking a commit.
 */
const FLAG_STYLE: "photo" | "illustration" = "photo";

export function BannerFlag({ className = "", style }: { className?: string; style?: CSSProperties }) {
  if (FLAG_STYLE === "illustration") return <AmericanFlag className={className} style={style} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative, fixed
    // size, and positioned by the caller; next/image would add a wrapper that
    // fights the absolute positioning for no benefit on a 27KB asset.
    <img
      src="/american.png"
      alt=""
      aria-hidden
      className={`object-cover object-right ${className}`}
      style={style}
    />
  );
}
