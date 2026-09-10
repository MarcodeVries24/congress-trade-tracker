import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — CongTrade",
  description: "How CongTrade handles data.",
};

const LAST_UPDATED = "September 11, 2026";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Privacy Policy" lastUpdated={LAST_UPDATED}>
        <LegalSection title="1. The short version">
          <p>
            All of the trading data shown on the Site is public government filing data, not personal data about
            visitors. Browsing and searching the Site doesn&rsquo;t require an account. If you create an account to
            use paid features, we collect the minimum needed to run that account and subscription — handled by our
            providers (Clerk for accounts, Stripe for payment) rather than stored by us directly. The sections below
            cover what that involves, plus the ordinary technical data inherent to running a website with ads.
          </p>
        </LegalSection>

        <LegalSection title="2. Accounts">
          <p>
            Creating an account is optional and only needed for paid features (filters, alerts, an ad-free view).
            Accounts are handled by our authentication provider, Clerk — you can sign up with an email address or a
            Google account. Clerk stores your email address, authentication method, and account metadata, and sets
            cookies needed to keep you signed in. See{" "}
            <a href="https://clerk.com/privacy" target="_blank" rel="noreferrer" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              Clerk&rsquo;s privacy policy
            </a>{" "}
            for details on how it handles that data.
          </p>
        </LegalSection>

        <LegalSection title="3. Payments">
          <p>
            Subscription payments are processed by Stripe through Clerk&rsquo;s billing integration. We never see or
            store your full card details — Stripe handles that directly. We do retain a record that your account has
            an active (or past) subscription, needed to grant access to paid features.
          </p>
        </LegalSection>

        <LegalSection title="4. Cookies and local storage">
          <p>Depending on how you use the Site, it can set:</p>
          <ul>
            <li>An authentication session cookie (Clerk), if you create an account — keeps you signed in.</li>
            <li>A theme preference (light/dark) in your browser&rsquo;s local storage — stays on your device, never sent to us.</li>
            <li>Advertising cookies (Google AdSense), for visitors on the free tier — see the next section. CongTrade Pro subscribers don&rsquo;t see ads and shouldn&rsquo;t get these cookies.</li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Advertising">
          <p>
            The free tier of the Site may show ads served by Google AdSense. Google and its advertising partners may
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

        <LegalSection title="6. Hosting and technical logs">
          <p>
            The Site is hosted on Vercel, with its data stored in a Neon Postgres database. Like virtually every
            website, our hosting provider automatically logs standard technical information for security and
            reliability purposes — things like IP address, browser type, and request timestamps. We don&rsquo;t
            personally review this data; it&rsquo;s processed under our infrastructure providers&rsquo; own privacy
            and security practices.
          </p>
        </LegalSection>

        <LegalSection title="7. Third-party services and sites">
          <p>
            The Site links out to third-party sites — the House Clerk&rsquo;s disclosure portal, the Senate eFD
            system, and individual source filings — to let you verify data at the source. It also relies on Clerk,
            Stripe, and Google AdSense to operate, as described above. None of these are under our control, and each
            has its own privacy practices.
          </p>
        </LegalSection>

        <LegalSection title="8. Children's privacy">
          <p>The Site is not directed at children under 13, and we don&rsquo;t knowingly collect information from them.</p>
        </LegalSection>

        <LegalSection title="9. Your rights">
          <p>
            You can access or update your account details (email, sign-in method) directly through your account
            settings, and cancel a subscription at any time. To request deletion of your account and associated
            data, contact us using the details below. Visitors who never create an account have no account data with
            us to access or delete in the first place.
          </p>
        </LegalSection>

        <LegalSection title="10. Changes to this policy">
          <p>
            We may update this policy from time to time; the &ldquo;last updated&rdquo; date at the top reflects the
            most recent revision.
          </p>
        </LegalSection>

        <LegalSection title="11. Contact">
          <p>
            Questions about this policy can be sent to{" "}
            <a href="mailto:privacy@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              privacy@congtrade.com
            </a>
            .
          </p>
        </LegalSection>
      </LegalDocument>
      <Footer />
    </>
  );
}
