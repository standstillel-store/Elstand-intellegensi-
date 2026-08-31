// Phase B — Landing Redesign. Simplified from the previous version:
// - FAQPage schema removed along with the FAQ section itself (not part of
//   the new template's structure).
// - The previous "Pro $29" Offer entry is removed — that price was not
//   something the Phase A/B audits verified against the repository (the
//   membership pricing lives in lib/payments/config.ts, a protected file
//   this phase doesn't read into marketing copy), so it's dropped rather
//   than repeated unverified.
const SITE_URL = "https://elstand.ai";

export function JsonLd() {
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ElStand AI",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description:
      "ElStand AI is a crypto market intelligence platform: macro and micro context, order flow, a deterministic AI Oracle decision-support pipeline, paper trading, and an on-chain (BSC Testnet) membership and rewards layer.",
    url: SITE_URL,
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ElStand AI",
    url: SITE_URL,
    sameAs: ["https://x.com/elstandai", "https://t.me/elstandai"],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
    </>
  );
}
