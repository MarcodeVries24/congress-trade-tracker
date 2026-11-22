import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appLinks";

/**
 * The official "Download on the App Store" and "Get it on Google Play" badges.
 *
 * Both stores require their own artwork, unaltered, rather than a button made
 * to look like it, so the images come from Apple's and Google's own badge
 * services. That also keeps them off this site's request count.
 *
 * Google's badge carries a transparent margin inside the image (about 41 of
 * its 250 pixels top and bottom, 41 of 646 left and right). Drawn at the same
 * height as Apple's it looks a size smaller, which Google's guidelines say it
 * should not, so it is drawn larger and the margin pulled back in.
 */
const SIZES = {
  sm: { apple: "h-9", google: "h-[52px] -my-[8.5px] -mx-[8px]" },
  md: { apple: "h-11", google: "h-[64px] -my-[10.5px] -mx-[10px]" },
} as const;

export function StoreBadges({
  size = "md",
  className = "",
  eager = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** For badges on the first screen, which lazy loading would show a beat after the rest. */
  eager?: boolean;
}) {
  const s = SIZES[size];
  const loading = eager ? "eager" : "lazy";
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="shrink-0 transition-opacity hover:opacity-85">
        {/* eslint-disable-next-line @next/next/no-img-element -- the store's own artwork, served by the store */}
        <img
          src="https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us"
          alt="Download on the App Store"
          // The badge's own proportions, so its space is kept before it loads.
          width={120}
          height={40}
          className={`${s.apple} w-auto`}
          loading={loading}
        />
      </a>
      <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="shrink-0 transition-opacity hover:opacity-85">
        {/* eslint-disable-next-line @next/next/no-img-element -- the store's own artwork, served by the store */}
        <img
          src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
          alt="Get it on Google Play"
          width={646}
          height={250}
          className={`${s.google} w-auto max-w-none`}
          loading={loading}
        />
      </a>
    </div>
  );
}
