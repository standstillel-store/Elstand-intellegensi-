import Link from "next/link";

// Legal links point to existing public pages (app/terms, app/privacy-policy,
// app/contact) — none of those routes are in middleware.ts's protected-path
// list, so linking to them is presentation-layer only, no backend touched.
export function LandingFooter() {
  return (
    <footer className="elv-footer">
      <div className="elv-footer-grid">
        <div>
          <div className="elv-footer-brand mono">
            <span className="elv-footer-brand-mark" />
            ELSTAND INTELLIGENCE
          </div>
          <p className="elv-footer-desc">
            A market-intelligence layer built from macro context, structure, order flow and an evidence-based AI
            reasoning core — with a Web3 access layer on top.
          </p>
          <div className="elv-footer-status mono">
            <span className="elv-footer-status-dot" />
            ELVOID CORE — OPERATIONAL
          </div>
        </div>

        <div className="elv-footer-col">
          <h4>Intelligence</h4>
          <a href="#macro">Macro Context</a>
          <a href="#map">Intelligence Map</a>
          <a href="#quant">ELVOID Quant</a>
          <a href="#orderflow">Order Flow</a>
        </div>

        <div className="elv-footer-col">
          <h4>Decision Layer</h4>
          <a href="#oracle">ELVOID PRO Oracle</a>
          <a href="#performance">Evidence Ledger</a>
          <Link href="/methodology">Methodology</Link>
        </div>

        <div className="elv-footer-col">
          <h4>Ecosystem</h4>
          <a href="#web3">Web3 Utility</a>
          <a href="#membership">ELVOID Pro</a>
          <Link href="/contact">Contact</Link>
        </div>
      </div>

      <div className="elv-footer-bottom mono">
        <span>© ELSTAND INTELLIGENCE</span>
        <span className="elv-footer-legal">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy-policy">Privacy</Link>
        </span>
        <span>ELVOID PROVIDES DECISION SUPPORT, NOT GUARANTEED OUTCOMES. NOT FINANCIAL ADVICE.</span>
      </div>
    </footer>
  );
}
