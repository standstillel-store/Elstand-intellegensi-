import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Container, Eyebrow } from "@/components/landing/shared";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How ElStand AI collects, uses, and protects your data.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight text-ink">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-ink-muted">{children}</p>;
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</li>;
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen">
      <LandingHeader />

      <section className="py-20 sm:py-24">
        <Container className="max-w-2xl">
          <Eyebrow>Legal</Eyebrow>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Privacy Policy</h1>
          <p className="mt-2 text-xs text-ink-faint">Last updated: July 2026</p>

          <P>
            This Privacy Policy explains how ElStand AI (&ldquo;we,&rdquo; &ldquo;us&rdquo;) collects, uses, and
            protects information when you use our website and dashboard (together, the &ldquo;Service&rdquo;).
          </P>

          <H2>1. Information We Collect</H2>
          <ul className="mt-3 list-disc pl-5">
            <Li>
              <span className="text-ink">Account information</span> — when you sign in with Google, we receive your
              name, email address, and profile picture from Google.
            </Li>
            <Li>
              <span className="text-ink">Usage data</span> — pages visited, features used, and general device/browser
              information, used to keep the Service reliable and to understand which tools are useful.
            </Li>
            <Li>
              <span className="text-ink">Cookies</span> — used to keep you signed in and to remember basic
              preferences. You can block cookies in your browser, though parts of the Service may stop working.
            </Li>
            <Li>
              <span className="text-ink">Exchange API credentials (optional)</span> — if you choose to connect a
              third-party exchange account for optional trading features inside the dashboard, your API key and
              secret are encrypted before storage and used solely to place and manage orders on your behalf, per your
              own configuration. We never request or store your exchange account password.
            </Li>
          </ul>

          <H2>2. How We Use Information</H2>
          <ul className="mt-3 list-disc pl-5">
            <Li>To provide, maintain, and improve the Service.</Li>
            <Li>To authenticate you and keep your account secure.</Li>
            <Li>To communicate with you about your account or changes to the Service.</Li>
            <Li>To understand aggregate usage patterns — we do not sell your personal data to advertisers.</Li>
          </ul>

          <H2>3. Third-Party Services</H2>
          <P>
            We rely on a small number of infrastructure providers to run the Service: Google (sign-in), Supabase
            (account and application data storage), and, only if you choose to connect one, your cryptocurrency
            exchange&rsquo;s own API. Each provider processes data under its own privacy terms.
          </P>

          <H2>4. Data Security</H2>
          <P>
            Sensitive credentials, including any exchange API secret you provide, are encrypted at rest. No method of
            storage or transmission is 100% secure, and we can&rsquo;t guarantee absolute security — if you ever
            suspect a credential has been exposed, rotate it from your exchange&rsquo;s dashboard immediately.
          </P>

          <H2>5. Data Retention</H2>
          <P>
            We retain account and usage data for as long as your account is active. You can request deletion of your
            account and associated data at any time (see &ldquo;Your Rights&rdquo; below).
          </P>

          <H2>6. Your Rights</H2>
          <P>
            Depending on where you live, you may have the right to access, correct, export, or delete your personal
            data, and to withdraw consent for optional features (like an exchange connection) at any time. Contact us
            to exercise any of these rights.
          </P>

          <H2>7. Children&rsquo;s Privacy</H2>
          <P>
            The Service is not directed to anyone under 18, and we do not knowingly collect data from children.
          </P>

          <H2>8. Changes to This Policy</H2>
          <P>
            We may update this Privacy Policy from time to time. Material changes will be reflected by updating the
            &ldquo;Last updated&rdquo; date above.
          </P>

          <H2>9. Contact Us</H2>
          <P>
            Questions about this policy or your data can be sent to{" "}
            <a href="mailto:support@elstand.ai" className="underline decoration-line underline-offset-2 hover:text-ink">
              support@elstand.ai
            </a>
            .
          </P>

          <p className="mt-8 rounded-md border border-amber/30 bg-amber/5 p-3 text-xs leading-relaxed text-amber">
            Draft template — this page has not been reviewed by a lawyer. Confirm your governing jurisdiction, legal
            entity name, and any local data-protection requirements (e.g. Indonesia&rsquo;s UU PDP) before publishing.
          </p>
        </Container>
      </section>

      <LandingFooter />
    </main>
  );
}
