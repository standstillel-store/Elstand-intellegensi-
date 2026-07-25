"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Container, SectionIntro } from "./shared";
import { FAQS } from "./faqData";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-line/70 py-20 sm:py-24">
      <Container>
        <SectionIntro eyebrow="FAQ" title="Frequently asked questions" align="center" />

        <div className="mx-auto mt-10 max-w-2xl divide-y divide-line">
          {FAQS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div key={item.question}>
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="text-sm font-medium text-ink">{item.question}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && <p className="pb-4 text-sm leading-relaxed text-ink-muted">{item.answer}</p>}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
