import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LegalDocument, LegalSection } from "@/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy — CongTrade",
  description: "How CongTrade handles data.",
};

const LAST_UPDATED = "September 10, 2026";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <LegalDocument title="Privacy Policy" lastUpdated={LAST_UPDATED}>
        <LegalSection title="1. The short version">
          <p>
            CongTrade doesn&rsquo;t have user accounts, doesn&rsquo;t ask you to enter personal information, and
            doesn&rsquo;t sell your data — because we don&rsquo;t collect any to sell. All of the trading data shown
            on the Site is public government filing data, not personal data about visitors. The sections below cover
            the small amount of technical data that&rsquo;s inherent to running a website.
          </p>
        </LegalSection>

        <LegalSection title="2. Information we don't collect">
          <p>
            We don&rsquo;t require you to create an account, and we don&rsquo;t collect names, email addresses,
            payment details, or other personal information to use the Site.
          </p>
        </LegalSection>

        <LegalSection title="3. Local storage">
          <p>
            The Site saves one small preference — light or dark theme — in your browser&rsquo;s local storage, so it
            persists across visits. This stays on your device; it&rsquo;s never sent to us.
          </p>
        </LegalSection>

        <LegalSection title="4. Hosting and technical logs">
          <p>
            The Site is hosted on Vercel, with its data stored in a Neon Postgres database. Like virtually every
            website, our hosting provider automatically logs standard technical information for security and
            reliability purposes — things like IP address, browser type, and request timestamps. We don&rsquo;t
            personally review this data; it&rsquo;s processed under our infrastructure providers&rsquo; own privacy
            and security practices.
          </p>
        </LegalSection>

        <LegalSection title="5. Cookies and analytics">
          <p>
            The Site does not currently use advertising cookies or third-party analytics/tracking scripts. If that
            changes in the future (for example, to add basic, privacy-respecting usage analytics), this policy will
            be updated first to reflect it.
          </p>
        </LegalSection>

        <LegalSection title="6. Third-party sites">
          <p>
            The Site links out to third-party sites — the House Clerk&rsquo;s disclosure portal, the Senate eFD
            system, and individual source filings — to let you verify data at the source. Those sites have their own
            privacy practices, which we don&rsquo;t control.
          </p>
        </LegalSection>

        <LegalSection title="7. Children's privacy">
          <p>The Site is not directed at children under 13, and we don&rsquo;t knowingly collect information from them.</p>
        </LegalSection>

        <LegalSection title="8. Your rights">
          <p>
            Because we don&rsquo;t collect personal data through the Site itself, there&rsquo;s generally nothing of
            yours for us to access, correct, or delete on request. If you believe that&rsquo;s not the case for some
            reason, contact us using the details below and we&rsquo;ll look into it.
          </p>
        </LegalSection>

        <LegalSection title="9. Changes to this policy">
          <p>
            We may update this policy from time to time; the &ldquo;last updated&rdquo; date at the top reflects the
            most recent revision.
          </p>
        </LegalSection>

        <LegalSection title="10. Contact">
          <p>
            Questions about this policy can be sent to{" "}
            <a href="mailto:privacy@congtrade.app" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
              privacy@congtrade.app
            </a>
            .
          </p>
        </LegalSection>
      </LegalDocument>
      <Footer />
    </>
  );
}
