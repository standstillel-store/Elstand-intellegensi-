"use client";
import { VolumeProfileMode } from "./VolumeProfileMode";

export function TPOMode({ symbol, height }: { symbol: string; height: number }) {
  // TPO is a session profile — fixed 30m interval regardless of the main
  // chart's timeframe, matching how Market Profile tools build sessions.
  return <VolumeProfileMode symbol={symbol} interval="30m" height={height} endpoint="/api/tpo" label="TPO / Market Profile" />;
}
