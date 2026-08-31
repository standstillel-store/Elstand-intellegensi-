import { SectionShell, Eyebrow, Lede, Split, FlowDiagram, Note } from "./shared";
import { Reveal } from "./Reveal";

// Layer 04 — Access. Maps to lib/payments/config.ts (ELVOID_PRO_WEEK/
// MONTH products), contracts/ELSTestnetPayment.sol, components/membership/
// MembershipLocked.tsx — IMPLEMENTED, on BSC Testnet.
export function MembershipSection() {
  return (
    <SectionShell id="membership" layer="04" env="dark">
      <Eyebrow>LAYER 04 — ACCESS</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              Access Built
              <br />
              On Ownership.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              Membership is a verified on-chain state, not a login flag. A wallet transaction on BSC Testnet is
              checked and confirmed before ELVOID Pro unlocks.
            </Lede>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <FlowDiagram nodes={["WALLET", "ON-CHAIN PAYMENT (TESTNET)", "VERIFICATION", "ELVOID PRO"]} />
        </Reveal>
      </Split>
      <Reveal delay={0.15}>
        <Note>ELVOID Pro membership and AI Energy purchases settle on BSC Testnet today.</Note>
      </Reveal>
    </SectionShell>
  );
}
