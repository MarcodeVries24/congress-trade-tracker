import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Disclaimer | CongTrade",
  description:
    "CongTrade reports what members of Congress have disclosed. It is not investment advice, it is not affiliated with any government body, and the figures are ranges rather than amounts.",
};

const LAST_UPDATED = "September 27, 2026";

/**
 * The plain-language version of what the Terms say in sections 4, 5 and 10.
 *
 * Written to be read rather than to be enforceable — the Terms remain the
 * binding document, and this page says so. It exists because a disclaimer
 * that only appears as eleven-point grey text under a footer, or as clause
 * four of a contract, is one that has technically been given and practically
 * not been read.
 */
export default function DisclaimerPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Disclaimer" lastUpdated={LAST_UPDATED}>
        <LegalSection title="This is not investment advice">
          <p>
            CongTrade reports what members of Congress have disclosed. That is the whole of it. Nothing here is
            financial, investment, legal or tax advice, and nothing here is a recommendation to buy, sell or hold
            anything.
          </p>
          <p>
            A member of Congress buying a stock is not an endorsement of that stock, by them or by us. They may know
            something; they may know nothing; they may have delegated the decision to an adviser and never seen it.
            The filing does not say which, and neither can we. If you are making financial decisions, talk to someone
            licensed to advise you.
          </p>
        </LegalSection>

        <LegalSection title="We are not the government, and not connected to it">
          <p>
            CongTrade is an independent project. It is not affiliated with, endorsed by, sponsored by or operated on
            behalf of the U.S. Congress, the House Clerk, the Senate or any government agency. The underlying filings
            are public records those bodies publish; what we add is a way to read them.
          </p>
        </LegalSection>

        <LegalSection title="The amounts are ranges, not figures">
          <p>
            The law requires a member to disclose which bracket a trade falls into, never the exact sum. A filing says
            &ldquo;$15,001&ndash;$50,000&rdquo;; it does not say $31,240. Where this site shows a single total, such as
            an estimated volume, it is the sum of the midpoint of each bracket and is labelled as an estimate. Treat it
            as a rough order of magnitude and nothing finer.
          </p>
        </LegalSection>

        <LegalSection title="A trade you see today may be weeks old">
          <p>
            Members have up to 45 days after a trade to file it, and some file later than that. The date a trade
            happened and the date it was disclosed are both shown on every row, and they are often far apart. Nothing
            on this site is a live feed of anybody&rsquo;s portfolio.
          </p>
        </LegalSection>

        <LegalSection title="The data can be wrong">
          <p>
            Filings are read automatically from the documents the House and Senate publish. Most are parsed from the
            document&rsquo;s own text; scans of paper forms are transcribed and checked by hand. Names, tickers and
            company details are matched programmatically and can be wrong or missing. A filing can also be amended,
            withdrawn or refiled after we have read it.
          </p>
          <p>
            Every trade links to the document it came from.{" "}
            <strong className="text-ink">Check the filing before relying on any figure here</strong>, particularly if
            you intend to publish it or act on it.
          </p>
        </LegalSection>

        <LegalSection title="No warranty">
          <p>
            The site is provided as is, without warranty of any kind, and is used at your own risk. The{" "}
            <Link href="/terms" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Terms of Service
            </Link>{" "}
            are the binding document, and this page is a summary of what sections 4, 5 and 10 of it say. Where the two
            differ, the Terms govern. How we handle your data is in the{" "}
            <Link href="/privacy" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Privacy Policy
            </Link>
            .
          </p>
        </LegalSection>

        <LegalSection title="Found something wrong?">
          <p>
            Tell us, and include the trade or the filing if you can:{" "}
            <a
              href="mailto:contact@congtrade.com"
              className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted"
            >
              contact@congtrade.com
            </a>
            . Corrections are the most useful mail we get.
          </p>
        </LegalSection>
      </LegalDocument>
      <Footer />
    </>
  );
}
