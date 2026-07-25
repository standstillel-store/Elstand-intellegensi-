import { FAQS } from "./faqData";

// Update SITE_URL once the real domain is live — placeholder for now.
const SITE_URL = "https://elstand.ai";

export function JsonLd() {
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ElStand AI",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description:
      "AI-powered crypto market intelligence platform: AI market analysis, technical indicators, a crypto scanner, news sentiment, risk management tools, and paper trading.",
    url: SITE_URL,
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro", price: "29", priceCurrency: "USD" },
    ],
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ElStand AI",
    url: SITE_URL,
    sameAs: ["https://x.com/elstandai", "https://t.me/elstandai"],
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
    </>
  );
}
