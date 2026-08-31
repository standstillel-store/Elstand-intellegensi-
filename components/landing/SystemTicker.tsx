// ---------------------------------------------------------------------------
// Phase B — Landing Redesign. A persistent bottom marquee, matching the
// template's #ticker. These are pipeline-stage labels, not live market
// data — no claim of "live" is made anywhere here, so no data source is
// needed. Pure CSS animation (see .elv-ticker-track in globals.css),
// covered by the app's existing reduced-motion rule. Hidden under 901px,
// same breakpoint the template uses (the fixed rail also disappears there,
// so the bottom-of-screen chrome stays uncluttered on mobile).
// ---------------------------------------------------------------------------

const TICKER_ITEMS = [
  "ELVOID://CONTEXT ENGINE",
  "ELVOID://STRUCTURE ENGINE",
  "ELVOID://ORDER FLOW",
  "ELVOID://ORACLE",
  "ELVOID://EVIDENCE LEDGER",
  "ELVOID://ACCESS LAYER",
];

export function SystemTicker() {
  // Rendered twice back-to-back so the CSS animation can translate exactly
  // -50% and loop seamlessly.
  const items = [...TICKER_ITEMS, "DECISION SUPPORT, NOT GUARANTEED OUTCOME", ...TICKER_ITEMS, "DECISION SUPPORT, NOT GUARANTEED OUTCOME"];

  return (
    <div className="elv-ticker" aria-hidden="true">
      <div className="elv-ticker-track mono">
        {items.map((item, i) => (
          <span key={i} className={item.startsWith("DECISION") ? "elv-ticker-hl" : undefined}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
