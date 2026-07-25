export interface KnowledgeEntry {
  term: string;
  short: string;
}

/**
 * One glossary, two uses: (1) KnowledgeTerm tooltips wherever these labels
 * show up in the UI (Signal Card, Intelligence Rail), and (2) available to
 * hand to a real LLM provider later (lib/ai/provider.ts) as grounding
 * context, so a swapped-in model explains things the same way ElVoid AI
 * already does — "future ready" extends to vocabulary, not just wiring.
 */
export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  { term: "ICT", short: "Inner Circle Trader — kerangka analisa yang membaca pergerakan harga lewat jejak likuiditas institusi, bukan indikator biasa." },
  { term: "SMC", short: "Smart Money Concepts — turunan ICT yang fokus ke struktur pasar, order block, dan fair value gap." },
  { term: "Wyckoff", short: "Metode klasik membaca fase akumulasi/distribusi lewat volume dan price action, cikal bakal banyak konsep SMC modern." },
  { term: "Liquidity", short: "Kumpulan stop-loss/pending order di area tertentu (mis. equal high/low) yang jadi target 'sapuan' sebelum harga berbalik." },
  { term: "Fair Value Gap", short: "FVG — celah 3-candle di mana harga bergerak cepat, sering 'diisi ulang' saat harga kembali ke area itu." },
  { term: "Order Block", short: "Candle terakhir yang berlawanan arah sebelum pergerakan impulsif — area yang sering jadi acuan entry saat diuji ulang." },
  { term: "Breaker", short: "Order Block yang gagal menahan harga (ditembus), lalu berbalik fungsi jadi support/resistance di sisi sebaliknya." },
  { term: "Mitigation", short: "Saat harga kembali ke Order Block/FVG untuk 'membereskan' order yang belum terisi di area itu." },
  { term: "EMA", short: "Exponential Moving Average — rata-rata harga yang lebih bereaksi ke data terbaru dibanding SMA biasa." },
  { term: "RSI", short: "Relative Strength Index — indikator momentum 0-100, biasa dibaca overbought di atas 70 dan oversold di bawah 30." },
  { term: "Volume", short: "Jumlah unit yang diperdagangkan — lonjakan volume di titik struktural jadi konfirmasi kuat/lemahnya sebuah gerakan." },
  { term: "Funding", short: "Funding Rate — biaya periodik antara long dan short di kontrak perpetual; angka positif tinggi = long ramai (rawan long squeeze)." },
  { term: "OI", short: "Open Interest — total kontrak derivatif yang masih terbuka; OI naik + harga naik biasanya dibaca sebagai tren yang didukung uang baru." },
  { term: "Fear & Greed", short: "Indeks sentimen pasar crypto 0-100 dari Alternative.me — ekstrem fear/greed historisnya sering berbarengan dengan titik balik." },
  { term: "DXY", short: "US Dollar Index — kekuatan dolar AS relatif ke sekeranjang mata uang lain; DXY naik cenderung menekan aset risiko termasuk crypto." },
  { term: "Gold", short: "Emas — aset safe-haven klasik, sering dibandingkan sebagai penanda selera risiko pasar secara umum." },
  { term: "NASDAQ", short: "Indeks saham teknologi AS — pergerakannya sering berkorelasi dengan crypto sebagai sesama 'risk asset'." },
  { term: "BTC Dominance", short: "Persentase market cap Bitcoin dari total market cap crypto — naik biasanya berarti dana mengalir ke BTC dari altcoin, atau sebaliknya." },
  { term: "Stablecoin Supply", short: "Total suplai stablecoin (USDT, USDC, dll) — kenaikan sering dibaca sebagai 'dry powder' yang siap masuk ke market." },
  { term: "ETF Flow", short: "Aliran dana masuk/keluar dari produk ETF crypto spot — proxy demand institusional." },
  { term: "Whale", short: "Alamat/wallet dengan saldo besar — pergerakan dananya sering dipantau sebagai sinyal potensi tekanan beli/jual besar." },
  { term: "Sentiment", short: "Suasana hati pasar secara umum — dari Fear & Greed, aktivitas berita, hingga funding rate, digabung jadi satu pembacaan." },
];

const BY_TERM = new Map(KNOWLEDGE_BASE.map((k) => [k.term.toLowerCase(), k]));

export function lookupKnowledge(term: string): KnowledgeEntry | undefined {
  return BY_TERM.get(term.toLowerCase());
}
