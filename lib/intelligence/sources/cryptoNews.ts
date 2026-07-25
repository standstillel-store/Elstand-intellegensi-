import { cached } from "@/lib/cache";
import type { NewsItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Crypto news for the News & Macro Event node. Provider: CryptoPanic
// (https://cryptopanic.com/developers/api/), free tier available. Needs
// CRYPTOPANIC_API_KEY in .env.local.
//
// Without a key, the News & Macro node falls back to the app's existing
// NewsAPI-based feed (base.news, already wired, see lib/newsapi.ts) rather
// than showing nothing — CryptoPanic adds crypto-specific signal on top of
// that general feed when configured, it doesn't replace it as the only path.
// ---------------------------------------------------------------------------

const CRYPTOPANIC_BASE = "https://cryptopanic.com/api/v1/posts/";

interface CryptoPanicPost {
  id: number;
  title: string;
  url: string;
  published_at: string;
  source?: { title?: string; domain?: string };
  votes?: { positive?: number; negative?: number; important?: number };
}

function sentimentFromVotes(votes?: CryptoPanicPost["votes"]): NewsItem["sentiment"] {
  const pos = votes?.positive ?? 0;
  const neg = votes?.negative ?? 0;
  if (pos > neg + 1) return "positive";
  if (neg > pos + 1) return "negative";
  return "neutral";
}

export async function getCryptoPanicNews(limit = 10): Promise<NewsItem[] | undefined> {
  return cached("intel:cryptoNews", 60_000, async () => {
    const apiKey = process.env.CRYPTOPANIC_API_KEY;
    if (!apiKey) return undefined;
    try {
      const url = `${CRYPTOPANIC_BASE}?auth_token=${apiKey}&public=true&filter=hot`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) {
        console.error(`[cryptopanic] HTTP ${res.status} ${res.statusText}`);
        return undefined;
      }
      const json = (await res.json()) as { results?: CryptoPanicPost[] };
      if (!json.results?.length) {
        console.error("[cryptopanic] empty results — check auth_token / plan");
        return undefined;
      }

      return json.results.slice(0, limit).map(
        (p): NewsItem => ({
          id: p.id,
          title: p.title,
          url: p.url,
          source: p.source?.title ?? p.source?.domain ?? "CryptoPanic",
          publishedAt: p.published_at,
          sentiment: sentimentFromVotes(p.votes),
        })
      );
    } catch (err) {
      console.error(`[cryptopanic] ${err instanceof Error ? err.message : err}`);
      return undefined;
    }
  });
}
