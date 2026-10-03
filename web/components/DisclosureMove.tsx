import { DISCLOSURE_MOVE_NOTE, formatMove, inTheirFavour } from "@/lib/priceMath";
import { InfoTip } from "@/components/InfoTip";

/**
 * What the stock did while a trade was still undisclosed, as a table cell:
 * the move with an arrow, coloured by direction (green up, red down, what the
 * stock did, not what the member did), and underneath how long the stretch
 * was and whether the move went the trader's way.
 *
 * `inline` is the one-line form for the phone cards.
 */
export function DisclosureMove({
  move,
  transactionType,
  days,
  inline = false,
}: {
  move: number | null;
  transactionType: string;
  days: number | null;
  inline?: boolean;
}) {
  // Disclosed the day it was made: there was no stretch to measure.
  if (days === 0) {
    return inline ? null : (
      <span className="text-xs text-ink-faint" title="Disclosed the same day as the trade">
        same day
      </span>
    );
  }
  if (move === null) {
    return inline ? null : (
      <span className="text-ink-faint" title="No daily price for this asset">
        –
      </span>
    );
  }
  const up = move > 0;
  const flat = move === 0;
  const tone = flat ? "text-ink-muted" : up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const arrow = flat ? "" : up ? "▲" : "▼";
  const pct = formatMove(Math.abs(move)).replace("+", "");
  const favour = inTheirFavour(transactionType, move);
  const span = days !== null && days > 0 ? `${days} ${days === 1 ? "day" : "days"}` : null;
  const verdict =
    favour === true ? (
      <span className="text-ink-muted">✓ their way</span>
    ) : favour === false ? (
      <span className="text-ink-faint">against them</span>
    ) : null;

  if (inline) {
    return (
      <span>
        Stock{" "}
        <span className={`font-semibold tabular-nums ${tone}`}>
          {arrow} {pct}
        </span>{" "}
        {span ? `in the ${span} before disclosure` : "before disclosure"}
        {verdict ? <> · {verdict}</> : null}
      </span>
    );
  }

  return (
    <div className="leading-tight">
      <div className={`font-semibold tabular-nums ${tone}`}>
        <span className="mr-0.5 text-[10px]">{arrow}</span>
        {pct}
      </div>
      <div className="mt-0.5 whitespace-nowrap text-[11px]">
        {span ? <span className="text-ink-faint">in {span}</span> : null}
        {span && verdict ? <span className="text-ink-faint"> · </span> : null}
        {verdict}
      </div>
    </div>
  );
}

/** The column header, with the explanation one tap away. */
export function DisclosureMoveHeader() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      Stock before disclosure
      <span className="normal-case tracking-normal">
        <InfoTip text={DISCLOSURE_MOVE_NOTE} />
      </span>
    </span>
  );
}
