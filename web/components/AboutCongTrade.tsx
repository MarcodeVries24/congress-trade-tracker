import Link from "next/link";
import { Logo } from "./Logo";

/**
 * Who is behind this, for a visitor who arrived from a search result.
 *
 * Written as an independent project rather than a company, because that is
 * what it is — claiming otherwise is the fastest way to lose the trust this
 * is here to earn. No methodology: how the filings are read belongs on
 * /about, one click away.
 *
 * Sized as a sidebar card rather than a full-width band. At full width the
 * three sentences stretch to a single 1,200px line that nobody reads.
 */
export function AboutCongTrade({ trades, members }: { trades?: number; members?: number }) {
  return (
    <section className="rounded-xl border border-line bg-panel px-5 py-5">
      <div className="flex items-center gap-2.5">
        <span className="text-ink">
          <Logo size={24} />
        </span>
        <span className="text-base font-bold tracking-tight">
          <span className="text-ink">Cong</span>
          <span className="text-accent">Trade</span>
        </span>
      </div>

      <h2 className="mt-3.5 text-sm font-semibold text-ink">Why CongTrade</h2>

      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        Members of Congress have to disclose what they trade. In practice that means a PDF, filed weeks later, on a
        government site almost nobody visits. The information is public and nearly unusable — so we made it usable.
      </p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
        CongTrade is an independent project, not a company and not funded by anyone with a position to talk up. It reads
        every filing the House Clerk and the Senate publish, every four hours
        {trades && members ? (
          <>
            {" "}
            — <span className="text-ink">{trades.toLocaleString("en-US")}</span> trades by{" "}
            <span className="text-ink">{members.toLocaleString("en-US")}</span> members so far
          </>
        ) : null}
        . Every row links back to the document it came from, so you never have to take our word for any of it.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <Link href="/about" className="text-accent underline decoration-line-strong hover:decoration-current">
          About the project
        </Link>
        <a href="mailto:contact@congtrade.com" className="text-ink-muted underline decoration-line hover:text-ink">
          contact@congtrade.com
        </a>
      </div>
    </section>
  );
}
