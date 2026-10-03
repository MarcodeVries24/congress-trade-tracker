import { formatMove, inTheirFavour } from "@/lib/priceMath";

/**
 * A price move as a small coloured figure: green up, red down, the way a
 * ticker tape shows it. Bought and sold keep their own colours elsewhere;
 * this is what the stock did, not what the member did.
 *
 * With `transactionType`, a tick marks a move that went the trader's way (a
 * rise after a purchase, a fall after a sale), described, not accused.
 */
export function PriceMove({
  move,
  transactionType,
  className = "",
}: {
  move: number | null;
  transactionType?: string;
  className?: string;
}) {
  if (move === null) return <span className={`text-ink-faint ${className}`}>–</span>;
  const tone =
    move > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : move < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-ink-muted";
  const favour = transactionType ? inTheirFavour(transactionType, move) : null;
  return (
    <span className={`tabular-nums font-semibold ${tone} ${className}`}>
      {formatMove(move)}
      {favour ? (
        <span
          className="ml-1 text-[10px] font-medium text-ink-faint"
          title="The stock moved the trader's way before the trade was disclosed"
        >
          their way
        </span>
      ) : null}
    </span>
  );
}
