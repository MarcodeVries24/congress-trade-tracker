import { InfoTip } from "@/components/InfoTip";
import { formatMove } from "@/lib/priceMath";
import type { TimingSummary } from "@/lib/prices";

const EXPLAINER =
  "Between the day a trade was made and the day it was disclosed, only the member knew about it. " +
  "This compares the stock's close on those two days, for every purchase and sale we have prices for. " +
  "“Their way” means it rose after a purchase or fell after a sale. It describes what the price did, " +
  "not why, and says nothing on its own about what the member knew.";

/**
 * How the stock moved in the gap between trade and disclosure, summed up:
 * for a member, across everything they traded; for a company, across
 * everyone who traded it.
 */
export function TimingPanel({ summary, subject }: { summary: TimingSummary; subject: "member" | "company" }) {
  if (summary.priced < 3) return null;
  const share = summary.theirWay / summary.priced;
  const edge = summary.averageEdge;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex items-center">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">Before the public knew</h2>
        <InfoTip text={EXPLAINER} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-panel-muted px-3 py-2.5">
          <div className="text-xs text-ink-faint">Moved {subject === "member" ? "their" : "the trader’s"} way</div>
          <div className="mt-0.5 text-base font-semibold text-ink">
            {Math.round(share * 100)}%{" "}
            <span className="text-xs font-normal text-ink-muted">of {summary.priced.toLocaleString()} trades</span>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-panel-muted px-3 py-2.5">
          <div className="text-xs text-ink-faint">Average move, in the trader&rsquo;s favour</div>
          <div
            className={`mt-0.5 text-base font-semibold tabular-nums ${
              edge !== null && edge > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : edge !== null && edge < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-ink"
            }`}
          >
            {formatMove(edge)}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-panel-muted px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
          From each trade&rsquo;s closing price to the close on the day it was disclosed.
          {summary.sameDay ? ` ${summary.sameDay.toLocaleString()} disclosed the same day are left out.` : ""}
        </div>
      </div>
    </div>
  );
}
