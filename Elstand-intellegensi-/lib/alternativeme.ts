import { cached } from "./cache";
import type { FearGreedPoint } from "./types";

export async function getFearGreed(): Promise<{ now: FearGreedPoint; yesterday?: FearGreedPoint }> {
  return cached("altme:fng", 300_000, async () => {
    const res = await fetch("https://api.alternative.me/fng/?limit=2", { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Fear & Greed failed: ${res.status}`);
    const json = await res.json();
    const [today, yest] = json.data as Array<{
      value: string;
      value_classification: string;
      timestamp: string;
    }>;
    return {
      now: {
        value: parseInt(today.value, 10),
        classification: today.value_classification,
        timestamp: today.timestamp,
      },
      yesterday: yest
        ? {
            value: parseInt(yest.value, 10),
            classification: yest.value_classification,
            timestamp: yest.timestamp,
          }
        : undefined,
    };
  });
}
