import { AppShell } from "@/components/AppShell";
import { NewsFeedView } from "@/components/news/NewsFeedView";
import { getNews } from "@/lib/newsapi";
import { categorize, heatScore } from "@/lib/newsPresentation";

export const metadata = {
  title: "News | ELSTAND INTELLIGENCE",
};

export default async function NewsPage() {
  const news = await getNews().catch(() => []);

  const breakingCount = news.filter((n) => heatScore(n) >= 65).length;
  const positiveCount = news.filter((n) => n.sentiment === "positive").length;
  const negativeCount = news.filter((n) => n.sentiment === "negative").length;
  const categoryCounts = news.reduce<Record<string, number>>((acc, n) => {
    const c = categorize(n.title);
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <AppShell title="News" subtitle="Feed berita crypto dengan tag sentimen — dipakai ElVoid AI untuk News Sentiment scan.">
      {!news.length ? (
        <div className="glow-card p-6 text-center text-sm text-ink-muted">
          Feed berita belum aktif — NEWSAPI_KEY belum diset. Lihat Settings untuk status integrasi.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Total Articles</p>
              <p className="mono-num mt-1 text-xl font-semibold">{news.length}</p>
            </div>
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Breaking</p>
              <p className="mono-num mt-1 text-xl font-semibold text-down">{breakingCount}</p>
            </div>
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Sentiment</p>
              <p className="mono-num mt-1 text-sm">
                <span className="text-up">+{positiveCount}</span> / <span className="text-down">−{negativeCount}</span>
              </p>
            </div>
            <div className="glow-card p-4">
              <p className="text-[10px] uppercase text-ink-faint">Top Category</p>
              <p className="mt-1 text-sm font-medium">{topCategory ?? "—"}</p>
            </div>
          </div>

          <NewsFeedView news={news} />
        </>
      )}
    </AppShell>
  );
}
