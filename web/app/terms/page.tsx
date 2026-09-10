import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service — CongTrade",
  description: "The terms that govern use of CongTrade.",
};

const LAST_UPDATED = "September 11, 2026";

export default function TermsPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Terms of Service" lastUpdated={LAST_UPDATED}>
        <LegalSection title="1. Acceptance of these terms">
          <p>
            By accessing or using CongTrade (the &ldquo;Site&rdquo;), you agree to be bound by these Terms of
            Service. If you don&rsquo;t agree with any part of these terms, please don&rsquo;t use the Site.
          </p>
        </LegalSection>

        <LegalSection title="2. What CongTrade is">
          <p>
            CongTrade is an independent, unofficial tool that aggregates and presents publicly available financial
            disclosure data — specifically, Periodic Transaction Reports (PTRs) that members of the U.S. House of
            Representatives and Senate are required to file. We collect this data directly from the House Clerk&rsquo;s
            public disclosure site and the Senate&rsquo;s eFD system, and present it in a searchable, filterable
            format.
          </p>
          <p>
            CongTrade is not affiliated with, endorsed by, sponsored by, or operated on behalf of the U.S. Congress,
            the House Clerk, the Senate, or any other government body or agency. All underlying filing data referenced
            by the Site is a matter of public record, produced by the U.S. government.
          </p>
        </LegalSection>

        <LegalSection title="3. Accounts and paid plans">
          <p>
            Some features — filters, saved search alerts, and an ad-free view — require a free account and a paid
            CongTrade Pro subscription. Accounts are handled by our authentication provider, Clerk; you can sign up
            with an email address or a Google account. Subscriptions are billed by Stripe through Clerk&rsquo;s
            billing integration — we never see or store your card details ourselves.
          </p>
          <p>
            Subscriptions renew automatically until cancelled. You can cancel at any time from your account
            settings, effective at the end of the current billing period. Fees already paid are non-refundable
            except where required by law.
          </p>
        </LegalSection>

        <LegalSection title="4. Not financial, legal, or investment advice">
          <p>
            Nothing on the Site constitutes financial, investment, legal, or tax advice, or a recommendation to buy,
            sell, or hold any security or other asset. The fact that a member of Congress reported a given trade is
            not an endorsement of that trade, and past disclosed activity is not indicative of future performance of
            any security. You should not make investment decisions based solely on information presented on this
            Site, and you should consult a licensed financial, legal, or tax professional before making financial
            decisions.
          </p>
        </LegalSection>

        <LegalSection title="5. Accuracy of data">
          <p>
            We do our best to faithfully reproduce what appears in the underlying government filings, but the data on
            this Site is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without warranties of
            any kind, express or implied, including accuracy, completeness, or timeliness. In particular:
          </p>
          <ul>
            <li>
              Some filings (notably paper House filings) are scanned documents processed with optical character
              recognition (OCR), which can misread names, tickers, amounts, or dates.
            </li>
            <li>Filings are refreshed on a periodic schedule, not in real time, so there can be a delay before a new filing appears.</li>
            <li>Reported trade amounts are disclosed as ranges (e.g. &ldquo;$1,001–$15,000&rdquo;), not exact figures, because that&rsquo;s how the underlying law requires them to be reported.</li>
            <li>Company names, tickers, and market capitalization figures are matched and enriched programmatically and may occasionally be wrong or missing.</li>
          </ul>
          <p>
            Fact-checking and verifying any information against the original source filing before relying on it is
            your own responsibility. Where we can, we link directly to the source filing so you can check it yourself.
          </p>
        </LegalSection>

        <LegalSection title="6. Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <li>Use automated means (scraping, bots, crawlers) to extract data from the Site at a volume or frequency that degrades the Site for other users;</li>
            <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Site or its underlying systems;</li>
            <li>Misrepresent data from the Site as official government data, or as investment advice from a licensed professional;</li>
            <li>Use the Site for any unlawful purpose.</li>
          </ul>
        </LegalSection>

        <LegalSection title="7. Intellectual property">
          <p>
            The underlying filing data is public information produced by the U.S. government and is not owned by us.
            The Site&rsquo;s design, branding, code, and the specific way data is organized and presented are owned by
            CongTrade and may not be copied or reproduced without permission, except for normal use of the Site
            (viewing, searching, and sharing links to pages).
          </p>
        </LegalSection>

        <LegalSection title="8. Third-party services and links">
          <p>
            The Site links to third-party sites — including the House Clerk, the Senate eFD system, and individual
            source filings — that we don&rsquo;t control. We&rsquo;re not responsible for the content, accuracy, or
            practices of those sites. The Site also relies on third-party services to operate — Clerk (accounts),
            Stripe (payment processing), and Google AdSense (advertising) — each governed by its own terms and
            privacy policy.
          </p>
        </LegalSection>

        <LegalSection title="9. Advertising">
          <p>
            The free tier of the Site may display ads served by Google AdSense. Google and its partners may use
            cookies or similar technology to serve ads based on your visits to this and other sites; see Google&rsquo;s
            own policies for how that data is used, and how to opt out of personalized advertising. CongTrade Pro
            subscribers don&rsquo;t see ads.
          </p>
        </LegalSection>

        <LegalSection title="10. Limitation of liability">
          <p>
            To the fullest extent permitted by law, CongTrade and its operators won&rsquo;t be liable for any
            indirect, incidental, special, or consequential damages, or any loss of profits or data, arising from
            your use of, or inability to use, the Site or the data it presents — including any financial decision
            made in reliance on it.
          </p>
        </LegalSection>

        <LegalSection title="11. Changes to the Site or these terms">
          <p>
            We may modify, suspend, or discontinue the Site, or any part of it, at any time. We may also update these
            terms from time to time; the &ldquo;last updated&rdquo; date at the top of this page reflects the most
            recent revision. Continued use of the Site after a change means you accept the updated terms.
          </p>
        </LegalSection>

        <LegalSection title="12. Contact">
          <p>
            Questions about these terms can be sent to{" "}
            <a href="mailto:legal@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              legal@congtrade.com
            </a>
            .
          </p>
        </LegalSection>
      </LegalDocument>
      <Footer />
    </>
  );
}
