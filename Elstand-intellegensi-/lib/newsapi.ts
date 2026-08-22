import { cached } from "./cache";
import type { NewsItem } from "./types";

// ---------------------------------------------------------------------------
// General crypto/macro news feed (base.news). Two providers, tried in order:
//
// 1. NewsAPI.org — free tier: 100 req/day, headlines only. Register free at
//    https://newsapi.org/register. IMPORTANT: NewsAPI's free tier only
//    accepts requests whose origin is localhost — it will reject requests
//    from ANY deployed server (Vercel, Replit, etc.) regardless of how
//    valid the key is. This is a restriction on NewsAPI's side, not
//    something fixable in this code. See the [newsapi] log line below if
//    this is happening to you.
// 2. GNews.io — free tier: 100 req/day, no localhost restriction, works
//    fine once deployed. Register free at https://gnews.io. Set
//    GNEWS_API_KEY to use this as the production-friendly path.
//
// Both are optional/independent — set either, both, or neither (in which
// case base.news is simply empty and callers already handle that).
// ---------------------------------------------------------------------------

function classifySentiment(title: string, description?: string): NewsItem["sentiment"] {
  const text = title + " " + (description ?? "");
  if (/rug|scam|hack|exploit|crash|ban|fraud|ponzi/i.test(text)) return "negative";
  if (/surge|pump|moon|rally|breakout|bullish|ath/i.test(title)) return "positive";
  return "neutral";
}

async function fetchFromNewsApi(key: string): Promise<NewsItem[] | undefined> {
  try {
    const res = await fetch(
      `https://newsapi.org/v2/everything?q=crypto+bitcoin+altcoin&language=en&sortBy=publishedAt&pageSize=30&apiKey=${key}`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) {
      const hint = res.status === 426 || res.status === 401 ? " — likely the free-tier localhost-only restriction if this is a deployed server, see comment above" : "";
      console.error(`[newsapi] HTTP ${res.status} ${res.statusText}${hint}`);
      return undefined;
    }
    const json = await res.json();
    if (json.status !== "ok") {
      console.error(`[newsapi] ${json.message ?? "status !== ok"}`);
      return undefined;
    }
    const articles = (json.articles ?? []) as Array<{
      title: string;
      url: string;
      publishedAt: string;
      source?: { name?: string };
      description?: string;
    }>;
    if (!articles.length) return undefined;
    return articles.map(
      (a, i): NewsItem => ({
        id: i,
        title: a.title,
        url: a.url,
        source: a.source?.name ?? "NewsAPI",
        publishedAt: a.publishedAt,
        sentiment: classifySentiment(a.title, a.description),
      })
    );
  } catch (err) {
    console.error(`[newsapi] ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

async function fetchFromGNews(key: string): Promise<NewsItem[] | undefined> {
  try {
    const res = await fetch(
      `https://gnews.io/api/v4/search?q=crypto%20OR%20bitcoin%20OR%20ethereum&lang=en&max=30&apikey=${key}`,
      { next: { revalidate: 120 } }
    );
    if (!res.ok) {
      console.error(`[gnews] HTTP ${res.status} ${res.statusText}`);
      return undefined;
    }
    const json = await res.json();
    const articles = (json.articles ?? []) as Array<{
      title: string;
      url: string;
      publishedAt: string;
      source?: { name?: string };
      description?: string;
    }>;
    if (!articles.length) {
      console.error(`[gnews] ${json.errors ? JSON.stringify(json.errors) : "empty articles list"}`);
      return undefined;
    }
    return articles.map(
      (a, i): NewsItem => ({
        id: i,
        title: a.title,
        url: a.url,
        source: a.source?.name ?? "GNews",
        publishedAt: a.publishedAt,
        sentiment: classifySentiment(a.title, a.description),
      })
    );
  } catch (err) {
    console.error(`[gnews] ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

export async function getNews(): Promise<NewsItem[]> {
  const newsApiKey = process.env.NEWSAPI_KEY;
  const gnewsKey = process.env.GNEWS_API_KEY;
  if (!newsApiKey && !gnewsKey) return [];

  const result = await cached("newsapi:crypto", 120_000, async () => {
    if (newsApiKey) {
      const primary = await fetchFromNewsApi(newsApiKey);
      if (primary) return primary;
    }
    if (gnewsKey) {
      const fallback = await fetchFromGNews(gnewsKey);
      if (fallback) return fallback;
    }
    return undefined;
  });

  return result ?? [];
}
