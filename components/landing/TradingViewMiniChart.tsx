"use client";

import { useEffect, useRef } from "react";

// Real TradingView data via their own public embed script — not a screenshot,
// not a canvas we're faking. No npm dependency: this is the same widget
// script TradingView itself hands out for free embeds on any site, loaded
// once into this card's container.
export function TradingViewMiniChart({ symbol = "BINANCE:BTCUSDT" }: { symbol?: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    node.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      height: "100%",
      locale: "en",
      dateRange: "1D",
      colorTheme: "dark",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
    });
    node.appendChild(script);

    return () => {
      node.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="tradingview-widget-container h-full min-h-[180px] w-full" ref={container}>
      <div className="tradingview-widget-container__widget h-full w-full" />
    </div>
  );
}
