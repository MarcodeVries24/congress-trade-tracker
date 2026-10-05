import type { Metadata } from "next";
import Link from "@/components/Link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";
import { TERMS_VERSION as LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service | CongTrade",
  description: "The terms that govern use of CongTrade, including Dutch governing law and how complaints are handled.",
};


// Section 2 names the trader but not its street address, deliberately: the
// address is published once, in the Privacy Policy, which the footer links from
// every page and which section 15 makes part of these terms. Don't add it here
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
            CongTrade publishes these disclosures as a news and information service for the general public. Every
            disclosed trade is free to read on the website, without an account or a subscription, together with a
            link to the original filing. CongTrade Pro does not sell access to the reports: it pays for tools built
            around them, namely filters, alerts by email and push notification, an ad-free view, and the apps.
          </p>
          <p>
            CongTrade is not affiliated with, endorsed by, sponsored by, or operated on behalf of the U.S. Congress,
            the House Clerk, the Senate, or any other government body or agency. All underlying filing data referenced
            by the Site is a matter of public record, produced by the U.S. government.
          </p>
        </LegalSection>

        <LegalSection title="4. Accounts, CongTrade Pro and alerts">
          <p>
            Every disclosed trade on the website is free to read, without an account. Some features, namely filters,
            alerts and an ad-free view, require a free account and a paid CongTrade Pro subscription. In the
            CongTrade apps for iPhone and Android, using the app requires CongTrade Pro. Accounts are handled by our
            authentication provider, Clerk; you can sign up with an email address, a Google account, or an Apple
            account. The same account works on the website and in the apps.
          </p>
          <p>
            Alerts are sent by email to the address on your account and, if you turn notifications on in an app, as
            push notifications to that device. Each alert email carries a one-click unsubscribe link that switches
            that alert off, and push notifications can be turned off in the app or in your device&rsquo;s settings;
            you can also pause or delete any alert, with or without an active subscription. The Site is updated
            daily, and an alert is sent once a matching filing has been published. We don&rsquo;t promise any
            particular delivery time, and an alert is a convenience rather than a guarantee that you&rsquo;ll be
            told about every filing.
          </p>
        </LegalSection>

        <LegalSection title="5. Paying, renewal and cancelling">
          <p>
            <strong>On the website,</strong> subscriptions are billed by Stripe, which handles the payment and your
            card details directly; we never see or store them. The price shown on the pricing page is the total you
            pay, and nothing is added at checkout. Prices are quoted in euros or in US dollars depending on the
            country you are visiting from. You can cancel at any time from your account, which takes you to
            Stripe&rsquo;s billing page.
          </p>
          <p>
            <strong>In the apps,</strong> subscriptions are sold and billed by Apple through the App Store, or by
            Google through Google Play, at the price the store shows you, under the store&rsquo;s own terms. You
            cancel them in your App Store or Google Play subscription settings (the app&rsquo;s account screen links
            there), at least 24 hours before the renewal date to avoid the next charge. Refunds for store purchases
            are handled by Apple or Google under their own policies; we cannot issue them ourselves.
          </p>
          <p>
            Wherever you subscribed, a subscription renews automatically for the same period until you cancel it.
            Cancelling takes effect at the end of the current billing period, and you keep access until then. Beyond
            the withdrawal right in section 6 and anything else the law requires, fees already paid are not refunded.
          </p>
        </LegalSection>

        <LegalSection title="6. Right of withdrawal">
          <p>
            If you are a consumer in the EU or EEA, you have 14 days from the day your subscription starts to
            withdraw from it, without giving a reason.
          </p>
          <p>
            <strong>For a subscription bought on the website,</strong> tell us within that period at <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">contact@congtrade.com</a>, in any
            clear statement, or by using the model form below. When you subscribe you expressly ask us to start
            straight away, by ticking the box for it before checkout. If you then withdraw within those 14 days, you
            owe a proportionate amount for the part of the period you already had access to, and we refund the rest
            within 14 days of being told, using the same payment method you paid with.
          </p>
          <p>
            <strong>For a subscription bought in an app,</strong> the contract of sale is with Apple or Google, so
            you withdraw through them: Apple via reportaproblem.apple.com, Google via your Google Play order
            history. We will help if you contact us.
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

        <LegalSection title="7. Not financial, legal, or investment advice">
          <p>
            Nothing on the Site constitutes financial, investment, legal, or tax advice, or a recommendation to buy,
            sell, or hold any security or other asset. The fact that a member of Congress reported a given trade is
            not an endorsement of that trade, and past disclosed activity is not indicative of future performance of
            any security. You should not make investment decisions based solely on information presented on this
            Site, and you should consult a licensed financial, legal, or tax professional before making financial
            decisions.
          </p>
        </LegalSection>

        <LegalSection title="8. Accuracy of data">
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

        <LegalSection title="9. Acceptable use">
          <p>You agree not to:</p>
          <ul>
            <li>Use automated means (scraping, bots, crawlers) to extract data from the Site at a volume or frequency that degrades the Site for other users;</li>
            <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Site or its underlying systems;</li>
            <li>Share your account credentials, or let other people use your subscription as if it were their own;</li>
            <li>Misrepresent data from the Site as official government data, or as investment advice from a licensed professional;</li>
            <li>
              Use the disclosure data for a purpose U.S. law prohibits: under 5 U.S.C. &sect; 13107, a financial
              disclosure report may not be obtained or used for any unlawful purpose, for any commercial purpose other
              than by news and communications media for dissemination to the general public, to determine or
              establish anyone&rsquo;s credit rating, or to solicit money for any political, charitable or other
              purpose;
            </li>
            <li>Use the Site for any unlawful purpose.</li>
          </ul>
          <p>
            If you break these rules we may suspend or close your account. Where that happens because of something
            you did, we are not obliged to refund the remainder of a paid period.
          </p>
        </LegalSection>

        <LegalSection title="10. Ending your account or the service">
          <p>
            You can stop using CongTrade and close your account at any time, in the app&rsquo;s account screen or on
            the <Link href="/delete-account" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">account deletion page</Link>. Closing your account does not cancel an
            App Store or Google Play subscription; cancel that in the store first.
          </p>
          <p>
            We may suspend or close an account that breaks these terms, as section 9 describes. We may also stop
            offering CongTrade, or a paid plan, altogether; we will then tell subscribers by email at least 30 days
            beforehand, stop all renewals, and refund the unused part of any period paid on the website. For store
            subscriptions, we stop renewals and you can ask Apple or Google for a refund of the unused part.
          </p>
        </LegalSection>

        <LegalSection title="11. Intellectual property">
          <p>
            The underlying filing data is public information produced by the U.S. government and is not owned by us.
            The Site&rsquo;s design, branding, code, and the specific way data is organized and presented are owned by
            CongTrade and may not be copied or reproduced without permission, except for normal use of the Site
            (viewing, searching, and sharing links to pages).
          </p>
        </LegalSection>

        <LegalSection title="12. Third-party services and links">
          <p>
            The Site links to third-party sites that we don&rsquo;t control, including the House Clerk, the Senate
            eFD system, and individual source filings. We&rsquo;re not responsible for the content, accuracy, or
            practices of those sites. The Site also relies on third-party services to operate: Clerk (accounts),
            Stripe (payments on the website), Apple and Google (app stores, and push notification delivery), Expo
            (push notifications), Resend (alert email delivery), Vercel (hosting) and Neon (database). Each is
            governed by its own terms and privacy policy.
          </p>
        </LegalSection>

        <LegalSection title="13. Advertising">
          <p>
            The Site does not currently show advertising. If the free tier of the website shows ads in future, they
            will be served by an advertising partner such as Google AdSense, only with your consent where the law
            requires it (in the EU, EEA and UK, before any advertising cookie is set), and the Privacy Policy will
            say so first. CongTrade Pro subscribers don&rsquo;t see ads, and the apps show none.
          </p>
        </LegalSection>

        <LegalSection title="14. Apps from the App Store and Google Play">
          <p>
            These terms are the licence agreement for the CongTrade apps. If you use the iPhone app, you also agree
            that:
          </p>
          <ul>
            <li>
              These terms are between you and MV Digital only, not Apple. MV Digital, not Apple, is solely responsible
              for the app and its content, and for any maintenance and support of it; Apple has no obligation to
              provide any.
            </li>
            <li>
              You may use the app on Apple-branded devices you own or control, as the App Store&rsquo;s Usage Rules
              allow. This licence is personal and not transferable.
            </li>
            <li>
              If the app fails to conform to any warranty that applies, you may notify Apple, and Apple will refund
              the price you paid for it, if any. To the extent the law permits, Apple has no other warranty
              obligation for the app.
            </li>
            <li>
              MV Digital, not Apple, is responsible for any claim relating to the app or your use of it, including
              product liability, failure to meet a legal or regulatory requirement, consumer protection or privacy
              claims, and for investigating and defending any claim that the app infringes someone&rsquo;s
              intellectual property.
            </li>
            <li>
              You confirm that you are not in a country subject to a U.S. Government embargo or designated as
              &ldquo;terrorist supporting&rdquo;, and that you are not on any U.S. Government list of prohibited or
              restricted parties.
            </li>
            <li>You must also comply with any third-party terms that apply when using the app, such as your mobile data plan.</li>
            <li>
              Apple and its subsidiaries are third-party beneficiaries of these terms, and once you accept them,
              Apple may enforce them against you as a third-party beneficiary.
            </li>
          </ul>
          <p>
            Questions and complaints about the apps go to MV Digital at the address in section 2. If you use the
            Android app, Google Play&rsquo;s terms also apply to your purchase.
          </p>
        </LegalSection>

        <LegalSection title="15. Your details and how we use them">
          <p>
            By creating an account, saving an alert, or subscribing, you accept that we process personal data about
            you in the ways set out in our{" "}
            <Link href="/privacy" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Privacy Policy
            </Link>
            , which forms part of these terms. In practice that means your email address, your account identifier and
            sign-in method, the name and profile photo on your account if you add them, the criteria of any alerts
            you save, a record of which filings each alert has already told you about, the push notification token of
            any device you turn notifications on for, whether your account has an active subscription, and the
            ordinary technical logs any website produces.
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

        <LegalSection title="16. Limitation of liability">
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

        <LegalSection title="17. Governing law, complaints, and disputes">
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

        <LegalSection title="18. Changes to the Site or these terms">
          <p>
            We may modify, suspend, or discontinue the Site, or any part of it, at any time. We may also update these
            terms from time to time; the &ldquo;last updated&rdquo; date at the top of this page reflects the most
            recent revision. Where a change materially affects a paid subscription, we will tell subscribers by email
            before it takes effect, and you may cancel if you don&rsquo;t accept it. For any other change, continued
            use of the Site means you accept the updated terms.
          </p>
        </LegalSection>

        <LegalSection title="19. Severability">
          <p>
            If any part of these terms turns out to be invalid or unenforceable, the rest stays in force, and the
            invalid part is read down to whatever the law does allow, as close to the original intention as possible.
          </p>
        </LegalSection>

        <LegalSection title="20. Contact">
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
