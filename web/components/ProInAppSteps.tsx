import { StoreBadges } from "./StoreBadges";

/**
 * How to get CongTrade Pro, now that it is sold in the app only.
 *
 * The website no longer takes payment: Apple and Google sell the subscription,
 * handle the VAT, the receipts and the refunds, and the subscription belongs to
 * the CongTrade account, not to the device. So the third step is the one that
 * matters on this site: sign in here with the same account and the website's
 * Pro features open too, filters included.
 *
 * Shared by the pop-up a locked filter opens and by the /upgrade page, so the
 * two never explain it differently.
 */
export function ProInAppSteps({ compact = false }: { compact?: boolean }) {
  const steps = [
    {
      title: "Get the CongTrade app",
      body: "For iPhone and Android.",
      extra: <StoreBadges size="sm" className="mt-2.5" />,
    },
    {
      title: "Start Pro in the app",
      body: "Subscribe there, through the App Store or Google Play.",
    },
    {
      title: "Sign in here with the same account",
      body: "Pro comes with your account, so the filters, email alerts and the ad-free site unlock on the website too.",
    },
  ];
  return (
    <ol className={compact ? "space-y-3.5" : "space-y-5"}>
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent"
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{step.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{step.body}</p>
            {step.extra}
          </div>
        </li>
      ))}
    </ol>
  );
}
