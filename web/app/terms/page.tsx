import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service | CongTrade",
  description: "The terms that govern use of CongTrade, including Dutch governing law and how complaints are handled.",
};

const LAST_UPDATED = "October 4, 2026";

// Section 2 names the trader but not its street address, deliberately: the
// address is published once, in the Privacy Policy, which the footer links from
// every page and which section 12 makes part of these terms. Don't add it here
// as a tidying-up; that placement is a decision, not an omission.

export default function TermsPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Terms of Service" lastUpdated={LAST_UPDATED}>
        <LegalSection title="1. Acceptance of these terms">
          <p>
            By accessing or using CongTrade (the &ldquo;Site&rdquo;), you agree to be bound by these Terms of
            Service. They form a binding agreement between you and us. If you don&rsquo;t agree with any part of
            them, please don&rsquo;t use the Site.
          </p>
          <p>
            You must be at least 16 years old to create an account. If you accept these terms on behalf of a company
            or other organisation, you confirm that you are authorised to bind it, and &ldquo;you&rdquo; in these
            terms means that organisation.
          </p>
        </LegalSection>

        <LegalSection title="2. Who you are contracting with">
          <p>
            CongTrade is a service of MV Digital, established in the Netherlands, registered with the Dutch Chamber
            of Commerce (Kamer van Koophandel) under number 42025400, VAT identification number NL005440118B52.
          </p>
          <p>
            You can reach us at{" "}
            <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              contact@congtrade.com
            </a>
            , which is the address to use for questions, complaints, notices of withdrawal, and requests about your
            personal data.
          </p>
        </LegalSection>

        <LegalSection title="3. What CongTrade is">
          <p>
            CongTrade is an independent, unofficial tool that aggregates and presents publicly available financial
            disclosure data: specifically, the Periodic Transaction Reports (PTRs) that members of the U.S. House of
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

        <LegalSection title="4. Accounts and paid plans">
          <p>
            Some features, namely filters, email alerts, and an ad-free view, require a free account and a paid
            CongTrade Pro subscription. Accounts are handled by our authentication provider, Clerk; you can sign up
            with an email address, a Google account, or an Apple account. Subscriptions are billed by Stripe, which
            handles the payment and the card details directly. We never see or store your card details ourselves.
          </p>
          <p>
            The price shown on the pricing page is the total you pay. Nothing is added at checkout. Prices are quoted
            in euros or in US dollars depending on the country you are visiting from.
          </p>
          <p>
            Email alerts send to the address on your account. Each alert email carries a one-click unsubscribe link
            that switches that alert off; you can also pause or delete any alert from your account screen, with or
            without an active subscription. Alerts run on the same schedule as our data collection, so &ldquo;as it
            happens&rdquo; means on the next collection run. We don&rsquo;t promise any particular delivery time,
            and an alert is a convenience rather than a guarantee that you&rsquo;ll be told about every filing.
          </p>
          <p>
            Subscriptions renew automatically until cancelled. You can cancel at any time from your account
            settings, effective at the end of the current billing period, and you keep access until then. Beyond the
            withdrawal right in section 5 and anything else the law requires, fees already paid are not refunded.
          </p>
        </LegalSection>

        <LegalSection title="5. Right of withdrawal">
          <p>
            If you are a consumer in the EU or EEA, you have 14 days from the day your subscription starts to
            withdraw from it, without giving a reason. Tell us within that period at{" "}
            <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              contact@congtrade.com
            </a>
            , in any clear statement, or by using the model form below.
          </p>
          <p>
            A subscription unlocks the paid features straight away, so by subscribing you expressly ask us to begin
            performance during the withdrawal period. If you then withdraw within those 14 days, you owe a
            proportionate amount for the part of the period you already had access to, and we refund the rest within
            14 days of being told, using the same payment method you paid with.
          </p>
          <p>Model withdrawal form, to be copied and sent to us:</p>
          <ul>
            <li>To CongTrade, contact@congtrade.com</li>
            <li>I hereby give notice that I withdraw from my contract for the supply of the following service: CongTrade Pro</li>
            <li>Ordered on: [date]</li>
            <li>Name of consumer: [your name]</li>
            <li>Address of consumer: [your address]</li>
            <li>Account email: [the address on your CongTrade account]</li>
            <li>Date: [today&rsquo;s date]</li>
          </ul>
        </LegalSection>

        <LegalSection title="6. Not financial, legal, or investment advice">
          <p>
            Nothing on the Site constitutes financial, investment, legal, or tax advice, or a recommendation to buy,
            sell, or hold any security or other asset. The fact that a member of Congress reported a given trade is
            not an endorsement of that trade, and past disclosed activity is not indicative of future performance of
            any security. You should not make investment decisions based solely on information presented on this
            Site, and you should consult a licensed financial, legal, or tax professional before making financial
            decisions.
          </p>
        </LegalSection>

        <LegalSection title="7. Accuracy of data">
          <p>
            We do our best to faithfully reproduce what appears in the underlying government filings, but the data on
            this Site is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without warranties of
            any kind, express or implied, including accuracy, completeness, or timeliness. In particular:
          </p>
          <ul>
            <li>
              Some filings (notably paper House filings) are scans with no machine-readable text. Those are
              transcribed and checked against the scan by hand before they appear here, but a transcription can
              still contain a mistake.
            </li>
            <li>The site is updated daily, not in real time, so there can be a delay of a day or more before a new filing appears.</li>
            <li>Reported trade amounts are disclosed as ranges (e.g. &ldquo;$1,001&ndash;$15,000&rdquo;), not exact figures, because that&rsquo;s how the underlying law requires them to be reported.</li>
            <li>Company names, tickers, and market capitalization figures are matched and enriched programmatically and may occasionally be wrong or missing.</li>
          </ul>
          <p>
            Fact-checking and verifying any information against the original source filing before relying on it is
            your own responsibility. Where we can, we link directly to the source filing so you can check it yourself.
          </p>
        </LegalSection>

        <LegalSection title="8. Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <li>Use automated means (scraping, bots, crawlers) to extract data from the Site at a volume or frequency that degrades the Site for other users;</li>
            <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Site or its underlying systems;</li>
            <li>Share your account credentials, or let other people use your subscription as if it were their own;</li>
            <li>Misrepresent data from the Site as official government data, or as investment advice from a licensed professional;</li>
            <li>Use the Site for any unlawful purpose.</li>
          </ul>
          <p>
            If you break these rules we may suspend or close your account. Where that happens because of something
            you did, we are not obliged to refund the remainder of a paid period.
          </p>
        </LegalSection>

        <LegalSection title="9. Intellectual property">
          <p>
            The underlying filing data is public information produced by the U.S. government and is not owned by us.
            The Site&rsquo;s design, branding, code, and the specific way data is organized and presented are owned by
            CongTrade and may not be copied or reproduced without permission, except for normal use of the Site
            (viewing, searching, and sharing links to pages).
          </p>
        </LegalSection>

        <LegalSection title="10. Third-party services and links">
          <p>
            The Site links to third-party sites that we don&rsquo;t control, including the House Clerk, the Senate
            eFD system, and individual source filings. We&rsquo;re not responsible for the content, accuracy, or
            practices of those sites. The Site also relies on third-party services to operate: Clerk (accounts),
            Stripe (payments), Resend (alert email delivery), Vercel (hosting), Neon (database), and Google AdSense
            (advertising). Each is governed by its own terms and privacy policy.
          </p>
        </LegalSection>

        <LegalSection title="11. Advertising">
          <p>
            The free tier of the Site may display ads served by Google AdSense. Google and its partners may use
            cookies or similar technology to serve ads based on your visits to this and other sites; see Google&rsquo;s
            own policies for how that data is used, and how to opt out of personalized advertising. CongTrade Pro
            subscribers don&rsquo;t see ads.
          </p>
        </LegalSection>

        <LegalSection title="12. Your details and how we use them">
          <p>
            By creating an account, saving an alert, or subscribing, you accept that we process personal data about
            you in the ways set out in our{" "}
            <Link href="/privacy" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Privacy Policy
            </Link>
            , which forms part of these terms. In practice that means your email address, your account identifier and
            sign-in method, the criteria of any alerts you save, a record of which filings each alert has already
            told you about, whether your account has an active subscription, and the ordinary technical logs any
            website produces.
          </p>
          <p>We use that data on these grounds, and no others:</p>
          <ul>
            <li>To run your account, your subscription and your alerts, because performing our agreement with you requires it;</li>
            <li>To keep the Site secure, prevent abuse, and keep it working, because we have a legitimate interest in doing so;</li>
            <li>To keep billing and tax records, because the law obliges us to;</li>
            <li>Where something genuinely needs your consent, most obviously non-essential advertising cookies, we ask you for it separately, and you can withdraw it at any time.</li>
          </ul>
          <p>
            Accepting these terms is not how we obtain that consent. Consent has to be a specific, informed and
            freely given choice, so we ask for it on its own and never treat your use of the Site as a substitute
            for it. Nothing in this section gives us permission to use your details for anything not described in
            the Privacy Policy.
          </p>
          <p>
            You can ask us at any time to give you a copy of your data, correct it, delete it, restrict or object to
            how we use it, or transfer it elsewhere. Write to{" "}
            <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              contact@congtrade.com
            </a>
            . Deleting an alert deletes its criteria and its sending history with it. Closing your account removes
            your account data, apart from records we are required to keep for tax and accounting purposes.
          </p>
        </LegalSection>

        <LegalSection title="13. Limitation of liability">
          <p>
            Nothing in these terms excludes or limits our liability for death or personal injury caused by our
            negligence, for fraud, for intent or deliberate recklessness on our part, or for anything else that
            cannot lawfully be excluded or limited. Consumers keep every right the law gives them, and nothing here
            is meant to take those away.
          </p>
          <p>
            Subject to that, and to the fullest extent permitted by law, CongTrade and its operators won&rsquo;t be
            liable for any indirect, incidental, special, or consequential damages, or any loss of profits or data,
            arising from your use of, or inability to use, the Site or the data it presents, including any financial
            decision made in reliance on it. Where we are liable despite the above, our total liability is limited to
            the amount you paid us in the 12 months before the event that caused it.
          </p>
        </LegalSection>

        <LegalSection title="14. Governing law, complaints, and disputes">
          <p>
            These terms, and any dispute or claim arising out of or in connection with them, their subject matter or
            their formation, including non-contractual disputes, are governed by the law of the Netherlands. The
            United Nations Convention on Contracts for the International Sale of Goods does not apply.
          </p>
          <p>
            If you are a consumer living in another country in the EU or EEA, this choice of law does not take away
            the protection given to you by rules of your own country&rsquo;s law that cannot be set aside by
            agreement. You keep those protections in full.
          </p>
          <p>
            <strong>Complaints.</strong> If something goes wrong, tell us first. Write to{" "}
            <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              contact@congtrade.com
            </a>{" "}
            with the email address on your account and a description of the problem. We aim to acknowledge every
            complaint within 5 working days and to give a substantive answer within 14 days. If we need longer, we
            will say so and tell you when to expect an answer.
          </p>
          <p>
            If we can&rsquo;t settle it between us, the courts of the Netherlands are competent to hear the dispute.
            If you are a consumer, that does not stop you from bringing a claim in the courts of the country where
            you live, and where EU rules require it, we will bring any claim against you in those courts. If you are
            not a consumer, the District Court of Amsterdam has exclusive jurisdiction.
          </p>
          <p>
            A complaint about how we handle personal data can also be made to the Dutch data protection authority,
            the{" "}
            <a href="https://autoriteitpersoonsgegevens.nl" target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Autoriteit Persoonsgegevens
            </a>
            , or to the supervisory authority in the country where you live.
          </p>
        </LegalSection>

        <LegalSection title="15. Changes to the Site or these terms">
          <p>
            We may modify, suspend, or discontinue the Site, or any part of it, at any time. We may also update these
            terms from time to time; the &ldquo;last updated&rdquo; date at the top of this page reflects the most
            recent revision. Where a change materially affects a paid subscription, we will tell subscribers by email
            before it takes effect, and you may cancel if you don&rsquo;t accept it. For any other change, continued
            use of the Site means you accept the updated terms.
          </p>
        </LegalSection>

        <LegalSection title="16. Severability">
          <p>
            If any part of these terms turns out to be invalid or unenforceable, the rest stays in force, and the
            invalid part is read down to whatever the law does allow, as close to the original intention as possible.
          </p>
        </LegalSection>

        <LegalSection title="17. Contact">
          <p>
            Questions about these terms can be sent to{" "}
            <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              contact@congtrade.com
            </a>
            .
          </p>
        </LegalSection>
      </LegalDocument>
      <Footer />
    </>
  );
}
