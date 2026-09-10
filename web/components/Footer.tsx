import Link from "next/link";

const YEAR = new Date().getFullYear();

const RESOURCE_LINKS = [
  { label: "House Clerk filings", href: "https://disclosures-clerk.house.gov/FinancialDisclosure" },
  { label: "Senate eFD filings", href: "https://efdsearch.senate.gov/search/home/" },
];

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <span className="text-sm font-bold tracking-tight">
              <span className="text-ink">Cong</span>
              <span className="text-accent">Trade</span>
            </span>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
              An independent, searchable archive of U.S. Congress stock and asset trade disclosures — built directly
              from official Periodic Transaction Reports.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-4 text-xs">
            <div>
              <div className="font-semibold uppercase tracking-wider text-ink-faint">Data sources</div>
              <ul className="mt-2 space-y-1.5">
                {RESOURCE_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-muted underline decoration-line-strong hover:text-ink hover:decoration-ink-muted"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-semibold uppercase tracking-wider text-ink-faint">Legal</div>
              <ul className="mt-2 space-y-1.5">
                {LEGAL_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-ink-muted underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
          <strong className="text-ink-muted">Not financial advice.</strong> CongTrade is an independent, unofficial
          project and is not affiliated with, endorsed by, or operated on behalf of the U.S. Congress, the House
          Clerk, the Senate, or any government agency. Trade data is parsed automatically from public filings
          (including OCR of scanned PDFs) and may contain errors, omissions, or delays — always verify against the
          original filing before relying on it. Nothing on this site is investment, legal, or tax advice, and a
          member of Congress trading a security is not a recommendation or endorsement of it. Fact-checking and due
          diligence remain the visitor's own responsibility.
        </p>

        <div className="mt-4 flex flex-col gap-1 text-[11px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <span>© {YEAR} CongTrade. All data sourced from public government filings.</span>
        </div>
      </div>
    </footer>
  );
}
