import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { Container, Eyebrow } from "@/components/landing/shared";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of ElStand AI.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-lg font-semibold tracking-tight text-ink">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-ink-muted">{children}</p>;
}

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <LandingHeader />

      <section className="py-20 sm:py-24">
        <Container className="max-w-2xl">
          <Eyebrow>Legal</Eyebrow>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">Terms of Service</h1>
          <p className="mt-2 text-xs text-ink-faint">Last updated: July 2026</p>

          <P>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of ElStand AI (the
            &ldquo;Service&rdquo;). By creating an account or using the Service, you agree to these Terms.
          </P>

          <H2>1. Not Financial Advice</H2>
          <P>
            ElStand AI provides analytical tools, market data, and AI-generated insights for informational and
            educational purposes only. Nothing on the Service constitutes financial, investment, legal, or tax
            advice, and no output — including AI Signals, scores, or risk labels — is a recommendation to buy or
            sell any asset. You are solely responsible for your own trading and investment decisions.
          </P>

          <H2>2. No Guarantee of Results</H2>
          <P>
            Cryptocurrency markets are volatile and unpredictable. We do not guarantee any level of accuracy,
            profit, or outcome from using the Service, and past patterns shown by the Service are not indicative of
            future results.
          </P>

          <H2>3. Eligibility &amp; Accounts</H2>
          <P>
            You must be at least 18 years old to use the Service. You&rsquo;re responsible for maintaining the
            security of your account and for all activity that occurs under it.
          </P>

          <H2>4. Plans &amp; Billing</H2>
          <P>
            The Free plan is available at no cost with usage limits described on the Pricing page. Pro plan
            subscriptions are billed on a recurring basis until cancelled; you can cancel at any time from your
            account settings, effective at the end of the current billing period.
          </P>

          <H2>5. Optional Exchange Connections</H2>
          <P>
            Some parts of the dashboard let you optionally connect your own cryptocurrency exchange account via API
            key to place or manage orders. This is entirely your choice and at your own risk — we are not a broker,
            exchange, or custodian, we never hold your funds, and we are not responsible for losses arising from
            trades placed through your own connected account, including those placed automatically under settings
            you configured.
          </P>

          <H2>6. Acceptable Use</H2>
          <P>
            You agree not to misuse the Service — including attempting to disrupt it, reverse-engineer it beyond
            what&rsquo;s permitted by law, or use it to violate any applicable law or third party&rsquo;s rights.
          </P>

          <H2>7. Limitation of Liability</H2>
          <P>
            To the maximum extent permitted by law, ElStand AI and its team are not liable for any indirect,
            incidental, or consequential damages, including trading losses, arising from your use of the Service.
          </P>

          <H2>8. Termination</H2>
          <P>
            We may suspend or terminate access to the Service for violations of these Terms. You may stop using the
            Service and request account deletion at any time.
          </P>

          <H2>9. Changes to These Terms</H2>
          <P>
            We may update these Terms from time to time. Continued use of the Service after changes take effect
            constitutes acceptance of the updated Terms.
          </P>

          <H2>10. Contact</H2>
          <P>
            Questions about these Terms can be sent to{" "}
            <a href="mailto:support@elstand.ai" className="underline decoration-line underline-offset-2 hover:text-ink">
              support@elstand.ai
            </a>
            .
          </P>

          <p className="mt-8 rounded-md border border-amber/30 bg-amber/5 p-3 text-xs leading-relaxed text-amber">
            Draft template — this page has not been reviewed by a lawyer. Confirm your governing jurisdiction, legal
            entity name, and any licensing requirements that apply to crypto-related tools in your market before
            publishing.
          </p>
        </Container>
      </section>

      <LandingFooter />
    </main>
  );
}
