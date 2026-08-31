import Link from "next/link";
import { SectionShell, Eyebrow } from "./shared";
import { Reveal } from "./Reveal";
import { AuthAwareCta } from "./AuthAwareCta";

export function FinalCta() {
  return (
    <SectionShell id="final" layer="00" env="dark">
      <Reveal>
        <Eyebrow>ELSTAND INTELLIGENCE // ALL LAYERS CONVERGED</Eyebrow>
      </Reveal>
      <Reveal delay={0.05}>
        <h2 className="elv-h1 elv-h1-final">
          One Intelligence
          <br />
          Layer. Multiple
          <br />
          Market Dimensions.
        </h2>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="elv-cta-row">
          <AuthAwareCta guestLabel="Enter ELSTAND Intelligence" authLabel="Continue Intelligence" />
          <Link href="/methodology" className="elv-btn elv-btn-secondary">
            Read the Methodology
          </Link>
        </div>
      </Reveal>
    </SectionShell>
  );
}
