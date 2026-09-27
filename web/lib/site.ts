/**
 * The site's canonical origin, used for metadata, the sitemap and robots.txt.
 *
 * The `www` host, not the apex: `congtrade.com` 308-redirects to it, and a
 * canonical URL that redirects is a canonical URL search engines have to
 * resolve before they can trust it.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.congtrade.com";

/**
 * The address alerts are sent from.
 *
 * Mirrors ALERT_FROM_EMAIL, which the sender reads from the environment. Kept
 * as a plain constant here rather than plumbed through an API, because the
 * page that prints it is telling someone which address to whitelist, and an
 * address that fails to load is worse than one that is occasionally a deploy
 * behind. If the sending address changes, change it in both places.
 */
export const ALERT_FROM_ADDRESS = "alerts@congtrade.com";
