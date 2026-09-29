import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy | CongTrade",
  description: "How CongTrade handles data.",
};

const LAST_UPDATED = "September 30, 2026";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Privacy Policy" lastUpdated={LAST_UPDATED}>
        <LegalSection title="1. Who is responsible for your data">
          <p>
            CongTrade is a service of MV Digital, Paterswoldseweg 102, 9727 BH Groningen, Netherlands, registered
            with the Dutch Chamber of Commerce under number 42025400, VAT identification number NL005440118B52. MV
            Digital is the controller of the personal data described below, and can be reached at{" "}
            <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              contact@congtrade.com
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection title="2. What this policy covers">
          <p>
            This policy covers the CongTrade website at congtrade.com and the CongTrade apps for iPhone and Android.
            They share one account system and one set of data, so everything below applies whichever you use, and
            where the apps differ from the website, section 8 says so.
          </p>
        </LegalSection>

        <LegalSection title="3. The short version">
          <p>
            All of the trading data shown in CongTrade is public government filing data, not personal data about
            you. Browsing the website doesn&rsquo;t require an account. If you create an account, we collect the
            minimum needed to run that account and subscription, mostly handled by our providers (Clerk for
            accounts; Stripe, Apple or Google for payment) rather than stored by us directly. The one
            exception is email alerts, which need your address and your saved criteria in our own database in order
            to send anything. The apps collect nothing beyond that: no location, no contacts, no photos, no
            analytics and no advertising identifiers.
          </p>
        </LegalSection>

        <LegalSection title="4. Accounts">
          <p>
            Creating an account is optional and only needed for paid features (filters, alerts, an ad-free view).
            Accounts are handled by our authentication provider, Clerk. You can sign up with an email address, a
            Google account, or an Apple account. If you sign in with Apple and choose to hide your email address,
            we receive Apple&rsquo;s relay address instead of your real one, and alerts are delivered through it.
            If you sign in with Google or Apple, that provider also shares the name on your account, and Google
            shares your profile picture; Clerk stores them with your account, and neither is used for anything else.
            Clerk stores your email address, authentication method, and account metadata, and keeps you signed in
            with a cookie on the website and a securely stored token in the apps. See{" "}
            <a href="https://clerk.com/privacy" target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Clerk&rsquo;s privacy policy
            </a>{" "}
            for details on how it handles that data.
          </p>
        </LegalSection>

        <LegalSection title="5. Email alerts">
          <p>
            CongTrade Pro subscribers can save alerts, each one a set of filter criteria, and be emailed
            when a new public filing matches. To send those emails we store, in our own database: the criteria you
            chose, your Clerk account ID, and a copy of your account&rsquo;s email address (kept in step with
            whatever address Clerk holds, so that the sending job, which runs outside Clerk, has somewhere to
            deliver to). We also record which filings each alert has already told you about, so the same trade
            isn&rsquo;t emailed twice.
          </p>
          <p>
            Every alert email includes a one-click unsubscribe link that switches that alert off without signing in.
            Deleting an alert deletes its criteria and its sent-history with it. Alerts are the only thing we use
            your email address for. We don&rsquo;t send marketing, and we don&rsquo;t share the address with
            anyone beyond our email delivery provider, Resend, which transmits the message.
          </p>
        </LegalSection>

        <LegalSection title="6. Payments">
          <p>
            Subscription payments are processed by Stripe. We never see or store your card details; Stripe handles
            those directly. In our own database we keep a record of your subscription, namely your Clerk account ID,
            the Stripe customer and subscription identifiers, its status, the plan, and when the paid period ends.
            That record is what grants access to paid features, and we are required to keep billing and tax records
            for seven years.
          </p>
          <p>
            In the apps, subscriptions are sold and charged by Apple through the App Store, or by Google through
            Google Play, under their own terms and privacy policies. We never see your payment details there either.
            What we receive from them is the same kind of record: the product, the transaction identifiers, the
            status and the renewal date. To connect a store purchase to your CongTrade account, we give your account
            a random identifier that the store carries with the purchase; it contains nothing about you and is used
            for nothing else.
          </p>
        </LegalSection>

        <LegalSection title="7. Cookies and local storage">
          <p>Depending on how you use the Site, it can set:</p>
          <ul>
            <li>An authentication session cookie (Clerk), if you create an account. It keeps you signed in.</li>
            <li>A theme preference (light/dark) in your browser&rsquo;s local storage. It stays on your device, never sent to us.</li>
            <li>Advertising cookies (Google AdSense), for visitors on the free tier. See the next section. CongTrade Pro subscribers don&rsquo;t see ads and shouldn&rsquo;t get these cookies.</li>
          </ul>
        </LegalSection>

        <LegalSection title="8. In the iPhone and Android apps">
          <p>The apps handle data the same way as the website, with these differences:</p>
          <ul>
            <li>
              Instead of cookies, your sign-in token is kept in the device&rsquo;s secure storage (the iOS Keychain or
              the Android Keystore).
            </li>
            <li>
              The answers you give to the setup questions when you first open the app are stored on your device only.
              They are never sent to us, and deleting the app removes them.
            </li>
            <li>
              The apps request no device permissions. They do not access your location, contacts, photos, camera,
              microphone or files.
            </li>
            <li>
              The apps contain no analytics, crash reporting or advertising software, do not read your device&rsquo;s
              advertising identifier, and do not track you across other apps or websites.
            </li>
            <li>The apps show no advertising.</li>
          </ul>
          <p>
            Like any app that loads data, they talk to our servers, which log the technical details described in
            section 10.
          </p>
        </LegalSection>

        <LegalSection title="9. Advertising">
          <p>
            The free tier of the website may show ads served by Google AdSense. The apps show none. Google and its advertising partners may
            use cookies or device identifiers to serve ads, including personalized ones based on your activity
            across sites. We don&rsquo;t control this data or receive it ourselves. You can review or opt out of
            personalized advertising via{" "}
            <a href="https://myadcenter.google.com" target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Google&rsquo;s Ad Center
            </a>
            , and read more in{" "}
            <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Google&rsquo;s advertising policy
            </a>
            . If you&rsquo;re in the EEA or UK, we ask for your consent to non-essential advertising cookies before
            they&rsquo;re set.
          </p>
        </LegalSection>

        <LegalSection title="10. Hosting and technical logs">
          <p>
            CongTrade is hosted on Vercel, with its data stored in a Neon Postgres database. The website and the apps
            use the same servers, and like virtually every online service, our hosting provider automatically logs standard technical information for security and
            reliability purposes: things like IP address, browser or app version, and request timestamps. We don&rsquo;t
            personally review this data; it&rsquo;s processed under our infrastructure providers&rsquo; own privacy
            and security practices.
          </p>
        </LegalSection>

        <LegalSection title="11. Third-party services and sites">
          <p>
            The Site links out to third-party sites, such as the House Clerk&rsquo;s disclosure portal, the Senate
            eFD system, and individual source filings, to let you verify data at the source. It also relies on Clerk,
            Stripe, Apple (the App Store), Google (Google Play and AdSense), Resend (which delivers alert emails),
            Vercel and Neon to operate, as described above. None of
            these are under our control, and each has its own privacy practices.
          </p>
        </LegalSection>

        <LegalSection title="12. Children&rsquo;s privacy">
          <p>
            CongTrade is not directed at children, and an account requires you to be at least 16. We don&rsquo;t
            knowingly collect information from anyone younger; if you believe we have, tell us and we will delete it.
          </p>
        </LegalSection>

        <LegalSection title="13. Why we are allowed to use this data">
          <p>
            Under the GDPR we need a legal ground for each use. Ours are: performing our agreement with you, which
            covers your account, your subscription and your alerts; our legitimate interest in keeping the Site
            secure, preventing abuse and keeping it working, which covers technical logs; a legal obligation, which
            covers billing and tax records; and your consent, which we ask for separately and which covers
            non-essential advertising cookies. Accepting our Terms of Service is not itself consent, and we never
            treat it as though it were.
          </p>
        </LegalSection>

        <LegalSection title="14. Your rights">
          <p>
            You can access or update your account details (email, sign-in method) directly through your account
            settings, and cancel a subscription at any time. You can also ask us for a copy of your data, to correct
            it, to delete it, to restrict or object to how we use it, or to transfer it to another provider, and you
            can withdraw any consent you have given without that affecting what we did before you withdrew it.
            Contact us using the details below. Visitors who never create an account have no account data with us to
            access or delete in the first place.
          </p>
          <p>
            Deleting an alert deletes its criteria and its sending history. Closing your account removes your
            account data, apart from the billing records we are required to keep. The steps are on the{" "}
            <Link href="/delete-account" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              account deletion page
            </Link>
            .
          </p>
          <p>
            If you think we have handled your data wrongly, please tell us first so we can put it right. You also
            have the right to complain to the Dutch data protection authority, the{" "}
            <a href="https://autoriteitpersoonsgegevens.nl" target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Autoriteit Persoonsgegevens
            </a>
            , or to the supervisory authority in the country where you live.
          </p>
        </LegalSection>

        <LegalSection title="15. Changes to this policy">
          <p>
            We may update this policy from time to time; the &ldquo;last updated&rdquo; date at the top reflects the
            most recent revision.
          </p>
        </LegalSection>

        <LegalSection title="16. Contact">
          <p>
            Questions about this policy, or a request to access or delete your data, can be sent to{" "}
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
