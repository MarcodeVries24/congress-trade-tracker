/**
 * The site's canonical origin, used for metadata, the sitemap and robots.txt.
 *
 * The `www` host, not the apex: `congtrade.com` 308-redirects to it, and a
 * canonical URL that redirects is a canonical URL search engines have to
 * resolve before they can trust it.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.congtrade.com";
