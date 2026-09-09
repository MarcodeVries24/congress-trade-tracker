import { chromium, type Browser, type BrowserContext } from "playwright";

/**
 * efdsearch.senate.gov sits behind Akamai bot detection that blocks
 * Playwright's bundled Chromium build outright (403 "Access Denied"), even
 * with a spoofed user-agent and navigator.webdriver patched out. The real,
 * locally-installed Google Chrome binary (channel: "chrome") gets through
 * fine in headless mode — Akamai is evidently fingerprinting the browser
 * build itself, not just JS-visible automation signals. This means CI needs
 * actual Google Chrome installed (see .github/workflows), not just
 * `playwright install chromium`.
 */
export async function launchSenateBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return { browser, context };
}
