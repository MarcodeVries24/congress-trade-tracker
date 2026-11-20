import { Cong } from "./Cong";
import { StoreBadges } from "./StoreBadges";

const SCREENS = [
  { src: "/app-screens/04-alerts.jpg", alt: "The app's Alerts tab: every new trade by the politicians you follow" },
  { src: "/app-screens/03-politician.jpg", alt: "A politician's page in the app, with their full trading history" },
  { src: "/app-screens/05-trade-result.jpg", alt: "One trade in the app, and how the stock has done since" },
];

const POINTS = [
  "Alerts as a push notification, as soon as a filing that matches them is published",
  "Every trade, politician and company, searchable wherever you are",
  "The same account as this site: your plan and your alerts come with you",
];

/**
 * The app, on the home page.
 *
 * Its own band rather than a line in the footer: the app is where alerts
 * arrive the moment they are sent, which is the thing a visitor here most
 * wants and the site cannot do. The hero carries the store badges too; this
 * is where "Get the app" links land (#get-the-app).
 *
 * The screenshots are the App Store's own, so the site shows what the store
 * listing does. Plain <img> at a fixed size: they are already the size they
 * are drawn at, and going through Next's image optimiser would cost a request
 * against the plan for nothing.
 */
export function AppPromo() {
  return (
    <section
      id="get-the-app"
      className="mt-4 scroll-mt-6 overflow-hidden rounded-xl border border-line bg-panel lg:mt-6"
    >
      <div className="grid grid-cols-1 items-center gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10">
        <div>
          <div className="flex items-center gap-3">
            <Cong mood="turn-on-alerts" width={56} className="-my-2 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              The CongTrade app · iPhone and Android
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Know the moment they trade
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            Everything on this site, in your pocket, with your alerts arriving on your phone instead of waiting in your
            inbox.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-2.5">
                <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <StoreBadges className="mt-5" />
          <p className="mt-2 text-xs text-ink-faint">
            The app runs on CongTrade Pro, and one subscription opens Pro on this website too.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {SCREENS.map((screen, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- already sized; see above
            <img
              key={screen.src}
              src={screen.src}
              alt={screen.alt}
              width={506}
              height={1100}
              loading="lazy"
              decoding="async"
              className={`h-auto w-full rounded-xl border border-line shadow-sm sm:rounded-2xl ${i === 1 ? "lg:-translate-y-4" : ""}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
