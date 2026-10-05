import type { Metadata } from "next";
import Link from "@/components/Link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Delete your account | CongTrade",
  description: "How to delete your CongTrade account and its data, what is removed, and what is kept.",
};

const LAST_UPDATED = "September 30, 2026";

const MAIL = "underline decoration-line-strong hover:text-ink hover:decoration-ink-muted";

/**
 * The account deletion page the app stores link to.
 *
 * Google Play requires a URL that names the app, gives the steps, and says what
 * is deleted and what is kept and for how long. The privacy policy covers
 * deletion, but only as "contact us", and a store reviewer reads that as no
 * steps at all. So the same facts live here as instructions, and the privacy
 * policy stays the place that explains why.
 *
 * Everything promised on this page must stay true of the code: alerts and
 * their history are deleted outright, and billing records are the only thing
 * kept, for the period Dutch tax law sets.
 */
export default function DeleteAccountPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Delete your CongTrade account" lastUpdated={LAST_UPDATED}>
        <LegalSection title="How to request deletion">
          <p>
            This applies to CongTrade on the web, on iPhone and on Android. It is one account wherever you signed up.
          </p>
          <p>
            <strong>In the app:</strong> tap <strong>Account</strong> at the top of the Trades screen, then{" "}
            <strong>Delete account</strong>. The account is deleted straight away.
          </p>
          <p>
            <strong>By email</strong>, if you don&rsquo;t have the app:
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Email{" "}
              <a href="mailto:contact@congtrade.com?subject=Delete%20my%20account" className={MAIL}>
                contact@congtrade.com
              </a>{" "}
              from the email address on your CongTrade account, with the subject <strong>Delete my account</strong>.
            </li>
            <li>
              If you signed in with Apple and chose to hide your email address, say so, and send the request from the
              address Apple forwards to. We will confirm the account with you before deleting anything.
            </li>
            <li>We confirm when it is done. Deletion is completed within one month of your request.</li>
          </ol>
          <p>
            <strong>Cancel any paid subscription first.</strong> Deleting your account does not stop a subscription you
            bought through the App Store or Google Play, because those are billed by Apple and Google. Cancel it in your
            device&rsquo;s subscription settings. A subscription bought on the website can be cancelled from your{" "}
            <Link href="/account" className={MAIL}>
              account page
            </Link>
            .
          </p>
        </LegalSection>

        <LegalSection title="What is deleted">
          <ul>
            <li>Your account, email address and sign-in details</li>
            <li>Every saved alert, including its criteria and the record of which filings it has already sent</li>
            <li>The identifier that links App Store and Google Play purchases to your account</li>
          </ul>
        </LegalSection>

        <LegalSection title="What is kept, and for how long">
          <p>
            Billing and tax records: the subscription, its dates, the plan and the amounts charged. Dutch law requires us
            to keep these for <strong>seven years</strong>, after which they are deleted. They are not used for anything
            else in the meantime.
          </p>
          <p>
            The answers you give in the app&rsquo;s setup questions are stored only on your phone and never reach us.
            Deleting the app removes them.
          </p>
          <p>
            Payment card details are never stored by us at all. Stripe, Apple and Google hold those under their own
            policies.
          </p>
        </LegalSection>

        <LegalSection title="Deleting some data without deleting your account">
          <p>
            You can delete any saved alert yourself, at any time, from your{" "}
            <Link href="/account" className={MAIL}>
              account page
            </Link>{" "}
            on the website. Deleting an alert removes its criteria and its sending history immediately. For anything
            else, email us as above and say what you want removed.
          </p>
        </LegalSection>

        <LegalSection title="More">
          <p>
            Why we hold this data and on what legal basis is set out in the{" "}
            <Link href="/privacy" className={MAIL}>
              Privacy Policy
            </Link>
            . CongTrade is a service of MV Digital.
          </p>
        </LegalSection>
      </LegalDocument>
      <Footer />
    </>
  );
}
