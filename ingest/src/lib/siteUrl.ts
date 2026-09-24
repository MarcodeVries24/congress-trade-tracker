/**
 * The public address of the site, used in every outbound email link.
 *
 * `||` rather than `??`: an unset GitHub Actions secret arrives as an empty
 * string, not as undefined.
 *
 * Defaults to the `www` host on purpose — the apex `congtrade.com` 308s to it,
 * and a redirect hop in an email is one more thing for a mail client's link
 * scanner to trip over or rewrite.
 */
export const SITE_URL = (process.env.SITE_URL || "https://www.congtrade.com").replace(/\/$/, "");
