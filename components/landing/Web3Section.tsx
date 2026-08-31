import { SectionShell, Eyebrow, Lede, Split, TileGrid, Note, IllustrativePanel } from "./shared";
import { Reveal } from "./Reveal";

// Layer 04 — On-Chain Utility. Per the Phase A audit (CONTRACTS.md), every
// contract here is deployed on BSC Testnet (chainId 97) — ELS Token,
// TestnetFaucet, Reward Distributor, ELSTestnetSwap, ELSTestnetPayment.
// This section states "BSC Testnet" explicitly, twice, by design: the
// audit's Risk Assessment flagged mainnet-value implication as the one
// thing this section must not do.
export function Web3Section() {
  return (
    <SectionShell id="web3" layer="04" env="light">
      <Eyebrow>LAYER 04 — ON-CHAIN UTILITY (BSC TESTNET)</Eyebrow>
      <Split>
        <div>
          <Reveal>
            <h2 className="elv-h2">
              Utility,
              <br />
              Verified On-Chain.
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <Lede>
              The intelligence layer connects to a Web3 layer for membership and utility on BSC Testnet. Users
              interact through on-chain transactions to access services such as ELVOID Pro and AI Energy — real
              contracts, test-network funds.
            </Lede>
          </Reveal>
        </div>
        <div>
          <Reveal delay={0.1}>
            <IllustrativePanel label="ON-CHAIN SETTLEMENT — BSC TESTNET" />
            <TileGrid
              tiles={[
                { label: "WALLET", value: "Connect" },
                { label: "PAYMENT", value: "On-chain" },
                { label: "AI ENERGY", value: "Prepaid" },
                { label: "FAUCET", value: "Testnet" },
                { label: "SWAP", value: "Testnet" },
                { label: "REWARDS", value: "Testnet" },
              ]}
            />
            <Note>Illustrative settlement view. All contracts above are deployed on BSC Testnet, not mainnet.</Note>
          </Reveal>
        </div>
      </Split>
    </SectionShell>
  );
}
