import Link from "next/link";
import { Logo } from "./Logo";

/**
 * A one-line note on what this site is, for a visitor who arrived from a
 * search result and has never heard of it.
 *
 * Deliberately small and free of process detail: how the filings are read is
 * a question for /about, and a front page that explains its own methodology
 * is answering a question nobody has asked yet.
 */
export function AboutCongTrade({ trades, members }: { trades?: number; members?: number }) {
  const scale =
    trades && members
      ? `${trades.toLocaleString("en-US")} disclosed trades by ${members.toLocaleString("en-US")} members of Congress`
      : "every disclosed trade by a member of Congress";

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel px-4 py-3.5 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-ink">
          <Logo size={22} />
        </span>
        <span className="text-base font-bold tracking-tight">
          <span className="text-ink">Cong</span>
          <span className="text-accent">Trade</span>
        </span>
      </div>

      <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted sm:text-[13px]">
        {scale}, taken straight from the Periodic Transaction Reports filed with the House Clerk and the Senate, and
        refreshed every four hours. Every row links to the original document.
      </p>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href="/about" className="text-accent underline decoration-line-strong hover:decoration-current">
          About
        </Link>
        <a href="https://disclosures-clerk.house.gov/PublicDisclosure/FinancialDisclosure" target="_blank" rel="noreferrer"
          className="text-ink-muted underline decoration-line hover:text-ink">
          House Clerk
        </a>
        <a href="https://efdsearch.senate.gov/search/home/" target="_blank" rel="noreferrer"
          className="text-ink-muted underline decoration-line hover:text-ink">
          Senate eFD
        </a>
      </div>
    </section>
  );
}
