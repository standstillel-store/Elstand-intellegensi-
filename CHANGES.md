# ElStand AI — Market Intelligence Dashboard: apa yang berubah

## V5.0 — Phase: ELSTAND PREMIUM (second intelligence layer — macro + altcoin + FOMC + news)

Brief baru: bikin destinasi kedua yang terpisah dari ELVOID PRO (trading/execution terminal) — fokusnya macro regime + market regime + altcoin intelligence + news, bukan trading. Rute baru `/elstand-premium`, group nav baru "Premium Intelligence" (di `Sidebar.tsx` & `mobile/NavDrawer.tsx`, dua-duanya diupdate biar tetap sinkron kayak konvensi yang udah ada). **ELVOID PRO, Footprint, TPO, Liquidity Heatmap, Order Book, Oracle, AI Signal, PaperTrade, AI Performance — nggak disentuh sama sekali**, sesuai batasan di brief.

**Penamaan beda dari reference image, sengaja:** Reference image nyebut grup ini "ELVOID INTELLIGENCE PRO" — tapi itu mirip banget sama nama "ELVOID PRO" (terminal trading yang udah ada), padahal brief teksnya sendiri eksplisit warning "jangan sampai ELSTAND PREMIUM dan ELVOID PRO ketuker". Jadi dipakai nama dari brief teks: **"ELSTAND PREMIUM"**. Kalau Karin lebih suka nama dari gambar, gampang diganti — cuma string di 3 tempat (`Sidebar.tsx`, `NavDrawer.tsx`, judul halaman).

**Scope round ini:** satu halaman gabungan ("Dashboard Utama" dari reference image) yang isinya strip + regime + screener + FOMC/news. Reference image juga nunjukkin 4 halaman detail terpisah (Altcoin Screener PRO / Accumulation Scanner / Dump-Rugpull Scanner / Macro & News Intelligence sebagai route sendiri-sendiri) — itu belum dibikin round ini (scope-nya besar banget buat sekali jalan), tapi datanya sudah di `lib/intelligence/premium.ts` jadi tinggal bikin halaman baru yang manggil snapshot yang sama kalau mau di-split.

**Data real yang di-reuse langsung (0 fetch baru):**
- DXY → `getUsdReading()` (udah ada sejak V2)
- S&P 500 / Nasdaq → `getStocksReading()` (SPY/QQQ dari Finnhub — ditandai **PROXY** di UI, bukan REAL, karena index ticker asli butuh Finnhub tier berbayar; ini jujur ditulis di badge-nya, bukan disamarkan)
- Total Crypto Mcap / BTC Dominance / 24H change → `getGlobal()` (CoinGecko)
- BTC/ETH price + sparkline 7D → `getTopMarkets()` (sparkline dari field `sparkline_in_7d` yang ternyata udah ke-fetch tapi belum pernah dipakai di UI manapun)
- Fear & Greed → `getFearGreed()`
- Global Risk Regime (gauge + AI Summary + Key Factors) → `deriveGlobalSentiment()` dipakai apa adanya, cuma dirender ulang; nggak bikin scoring baru
- Altcoin Screener Pro (2 mode) → `buildPumpCandidates()` buat mode Accumulation, `buildRugpullRisks()` buat mode Dump/Rugpull Risk — persis fungsi yang sama yang dipakai `/api/pump-candidates` & `/api/rugpull-risk`, dipanggil langsung (server component, bukan self-fetch API)
- News Intelligence → komponen `MacroNewsPanel` yang udah ada dipakai apa adanya (kategorisasi Crypto/Macro/Stocks/Forex/ETF-nya real, bukan bikin klasifikasi baru)

**Data real yang baru ditambah (`lib/macro.ts`, pola sama persis kayak `getDxyProxy`/`getM2Supply` yang udah ada — FRED_API_KEY, cache, graceful-undefined kalau gagal):**
- `getUs10Y()` — FRED `DGS10`, primary source (bukan proxy)
- `getFedFundsRate()` — FRED `DFEDTARU`/`DFEDTARL` (target range asli FOMC), plus "Last Rate Change" yang dihitung dari histori 400 hari terakhir (tanggal terakhir angkanya beneran berubah — bukan diklaim sebagai "keputusan meeting terakhir", karena app ini nggak punya feed hasil meeting per-tanggal, cuma punya deret rate-nya)
- `getUsNationalDebt()` — **US Treasury Fiscal Data API** (`api.fiscaldata.treasury.gov/.../debt_to_penny`), bukan FRED — no API key sama sekali (public, unauthenticated), perubahan YoY dihitung dari record ~365 hari lalu di deret yang sama (Treasury nggak nerbitin field YoY-nya sendiri)

**Yang sengaja ditandai UNAVAILABLE, bukan dikarang:**
- **Rate-cut probability distribution** (gaya CME FedWatch) — nggak ada sumber gratis buat ini, jadi kartunya nampilin "DATA UNAVAILABLE" persis kayak instruksi di brief, bukan angka contoh (67.3%/32.7%) yang emang cuma placeholder ilustratif di brief.
- **Tanggal FOMC berikutnya** kalau lagi nggak ada di window `getEconomicCalendar()` (feed itu cuma cover "this week") — fallback ke jadwal resmi FOMC 2026 yang dipublikasi Fed (`federalreserve.gov`, di-hardcode sebagai *tanggal publik*, bukan data pasar — beda kategori sama "data dikarang"), badge-nya nunjukkin sumbernya "live calendar" vs "published schedule" biar jujur ke user mana yang mana.

**UI baru** (`components/dashboard/premium/`): `MarketIntelligenceStrip` (11 tile, REAL/PROXY/UNAVAILABLE badge di tiap tile + sparkline kalau ada deret asli), `GlobalRiskRegimePanel`, `AltcoinScreenerPro` (mobile: toggle 1 tabel aktif; desktop: dua tabel Accumulation/Dump-Rugpull side-by-side sekaligus — beda layout desktop/mobile sesuai konvensi app ini), `FomcPanel` (countdown live client-side, ticking per detik). Sparkline-nya reuse `components/intelligence/ui/Sparkline.tsx` yang udah ada (sempet ke-duplikat sebentar pas nulis, ketauan pas final check, langsung dibetulin ke versi reuse). Satu atom baru yang genuinely baru: `components/ui/DataStateBadge.tsx` (badge REAL/PROXY/UNAVAILABLE, dipakai di semua panel di atas).

**Testing:** `tsc --noEmit` 0 error (baseline sebelum perubahan juga 0 error, jadi ini murni tambahan bersih). `next build` sempet dicoba di sandbox ini tapi gagal di step fetch Google Fonts (`app/layout.tsx`, `fonts.googleapis.com` diblokir jaringan sandbox-nya, bukan error dari kode baru) — webpack sempet jalan sampai compile module sebelum kena error font itu, jadi resolusi import/module graph-nya udah kevalidasi.

**Gak disentuh:** `/elvoid-pro` & semua yang di bawahnya (`components/elvoid-pro/*`, `lib/elvoid/*`), Footprint/TPO/Liquidity Heatmap/Order Book/Oracle/AI Signal/PaperTrade/AI Performance, `lib/scoring.ts` & `lib/types.ts` (dipakai apa adanya, nggak diubah sama sekali — jadi 0 risiko ke `/scanner` atau route lain yang udah pakai fungsi yang sama), semua halaman selain yang disebut di atas.

## V4.1 — Phase: Global Market Intelligence Map → AI Relationship Graph

Brief-nya kali ini beda dari V4.0: bukan restyle doang, tapi minta Map-nya jadi "fully interactive AI relationship graph" 3 tingkat (Global Market → 6 kategori → aset masing-masing → 6 koin di bawah Altcoin), dengan left panel, top bar, dan relationship timeline. Karena brief-nya secara eksplisit minta struktur data baru (bukan cuma tampilan), ronde ini **beda dari V4.0** — `lib/intelligence/marketMap.ts` dan beberapa source file memang disentuh, tapi dengan aturan yang sama seperti semua fase sebelumnya: **nggak ada angka dikarang.**

**Keputusan paling penting: real data vs "belum tersambung" — bukan ditutup-tutupi**

Dari ~40 node yang diminta, hampir semuanya ternyata BISA dapet data asli, dengan cara nyambungin ke sumber yang udah ADA di app ini, cuma belum pernah ditarik ke level segranular ini:
- **Stocks (NASDAQ/SP500/NVDA/AAPL/TSLA)** — `lib/intelligence/sources/stocks.ts` sebelumnya cuma nge-track QQQ/SPY/DIA lewat Finnhub `/quote`; tinggal nambah 3 ticker lagi ke array `TRACKED`, endpoint & mekanismenya persis sama.
- **Forex (EUR/GBP/JPY/CNY)** — file baru `lib/intelligence/sources/forex.ts`, murni wrapper tipis di atas `fetchTwelveDataSeries()` yang udah ada (dipakai USD/DXY & Gold sejak V2), cuma ganti simbol pair-nya.
- **Macro (Interest Rate/CPI/PPI/NFP/GDP)** — `lib/intelligence/macroEvents.ts` udah punya taksonomi `MacroCategory` (FOMC/CPI/PPI/NFP/PMI/Interest Rate); tambah "GDP" sebagai kategori baru (regex detection doang, gak ubah logic dampak/forecast), terus tiap node macro tinggal filter array yang sama by category.
- **News (Reuters/Bloomberg/CoinDesk)** — dikelompokkan dari `newsItems` yang udah ada (NewsAPI/GNews), match by nama source. Real kalau outlet itu lagi ada beritanya di feed, kosong (jujur, bukan dipaksa nol) kalau nggak.
- **Sentiment (Fear&Greed/Funding/OI/Whale/ETF Flow)** — 5-5nya reuse data yang udah dihitung buat Market Pulse & Whale/Institutional Flow panel, cuma sekarang JUGA muncul sebagai node sendiri di peta.
- **Stablecoin** — ternyata `getStablecoinSupply()` (DefiLlama, no API key) udah dipanggil dari `getDashboardSnapshot()` buat kebutuhan lain (`snap.stablecoin`); tinggal diteruskan ke map, 0 fetch baru.
- **Altcoin Level 3 (SOL/BNB/XRP/LINK/SUI/RENDER)** — lookup langsung dari `scannerRows` (Altcoin Scanner) yang udah dihitung di halaman yang sama; top 150 market cap udah pasti mencakup ke-6 coin ini.

Yang **beneran belum ada sumbernya** dan sengaja dibiarkan tampil sebagai node yang jujur nunggu API (bukan dihapus, bukan dikarang): **DEX volume** (belum ada integrasi DefiLlama DEX di app ini), **Twitter** dan **Telegram** (app ini belum punya integrasi media sosial sama sekali). Ketiganya tetap muncul sebagai node yang bisa diklik di peta — taksonomi yang diminta tetap lengkap — tapi selalunampilin "Menunggu API" persis kayak node lain yang belum tersambung, konsisten sama aturan anti-data-dummy yang udah dipegang dari V1.

**Satu penyesuaian dari brief:** "Gold" (XAU, komoditas) nggak ada di 6 kategori Level 1 yang diminta (Crypto/Forex/Stocks/Macro/News/Sentiment) — daripada dihapus (padahal datanya real & udah jalan dari V2), dipindah jadi child ke-6 di bawah Forex, ditandai jelas sebagai komoditas bukan mata uang.

**Cascade effect (contoh CPI→USD→BTC di brief) — dibuat reaktif ke data asli, bukan di-script**

Brief kasih contoh urutan "CPI naik → USD hijau → garis ke BTC merah → AI Verdict jadi Risk Off 82%". Itu nggak di-hardcode sebagai animasi yang muter apapun kondisi pasarnya — soalnya itu sama aja bikin AI pura-pura mikir. Sebagai gantinya: warna & ketebalan tiap garis dihitung dari tone KEDUA node yang disambungnya SAAT INI (dua-duanya connected & searah = terang; salah satu belum tersambung = redup; tone-nya beda arah = netral), dan partikel cuma jalan di garis yang dua ujungnya beneran live. Kalau kondisi pasar beneran membentuk pola kayak di contoh itu, peta bakal nunjukkinnya — tapi karena itu beneran kejadian, bukan diputer terus-terusan.

**UI baru:**
- **AI Core orb** di tengah (node "Global Market") — lebih besar dari V4.0, breathing glow + 2 ring rotasi + sonar ping, warna ring luar ikut status sentiment live (hijau/merah/biru/gold).
- **Hub-and-spoke layout**: News di atas, Forex/Global/Stocks di tengah, Macro/Sentiment di bawahnya, Crypto di baris paling bawah — mengikuti sketsa ASCII di brief, dibangun pakai grid col-start/row-start (bukan grid-template-areas arbitrary, lebih aman lintas breakpoint).
- **Expand/collapse**: tiap node kategori (dan Altcoin di dalam Crypto) punya chevron buat buka anak-anaknya; klik chevron nggak ikut milih node itu (event `stopPropagation`, tombol terpisah dari card). Klik chip "Connected Markets"/"Related Assets" di panel otomatis buka cabang yang relevan di peta.
- **Left panel** (`components/intelligence/ui/NodeDrawer.tsx`, ditulis ulang) — permanent sidebar di desktop (≥1024px), bottom sheet di mobile (perilaku lama dipertahankan). Isi: Title, Current Trend, Confidence (kalau node itu emang punya angka confidence asli — AI Score, sentiment confidence; nggak dipaksain buat node yang nggak punya), AI Reasoning, Latest Event, Connected Markets (dari edge graph), Related Assets (sibling di parent yang sama).
- **Top bar**: AI Verdict, Risk Mode, Confidence %, Market Phase — 4 angka berbeda (2 dari `GlobalSentimentReading`, 2 dari `FinalConclusion` yang emang komputasi terpisah), bukan angka yang sama ditempel 4x.
- **Relationship Timeline** (bawah): AI Reasoning / Macro Event / Whale Movement / ETF Flow — 4 bacaan "terkini" dari data yang udah connected, bukan histori beneran (app ini belum nyimpen snapshot historis di mana pun) — jujur ditampilin sebagai bacaan terbaru, bukan diklaim sebagai "timeline" 24 jam.
- Tema: gold + purple tetap, tambah **cyan** (`tailwind.config.ts`) buat aksen graph/data-flow sesuai brief "Gold + Purple + Cyan".
- Layout dashboard: Map dikeluarin dari grid 2 kolom (dulu share row sama Crypto Heatmap) jadi full-width sendiri — sekarang punya top bar + panel + graph + timeline, nggak muat lagi di setengah kolom. Crypto Heatmap jadi baris sendiri di bawahnya.

**Testing:** `tsc --noEmit` 0 error, `next build` sukses 88 route termasuk `/dashboard` (29.9kB, naik dari 21.3kB — proporsional sama fitur barunya). Semua sumber eksternal baru (TwelveData buat 4 FX pair, Finnhub buat 3 ticker saham) manggil fungsi generik yang sama kayak yang udah dipakai USD/Gold/Nasdaq dari V2 — bukan integrasi baru dari nol.

**Gak disentuh:** logic klasifikasi bullish/bearish/neutral/transition di manapun (threshold-nya sama persis), `deriveGlobalSentiment`/`deriveFinalConclusion` (Map cuma baca hasilnya, gak ikut ngitung), `TerminalReportView`/AI Snapshot/AI Final Conclusion (masih pake `buildReasoningChain` yang sama, gak diubah), semua halaman selain `/dashboard`.

## V4.0 — Phase: Dashboard Visual Overhaul (Bloomberg × Apple, UI/UX-only)

Brief-nya eksplisit: redesign visual `/dashboard` doang — gold (#D4AF37) jadi primary accent, purple tetap dipakai tapi cuma buat AI, tambah "rasa hidup" (ambient glow, particle/grid background, micro-interaction, animated skeleton) ke 6 section yang dianggap masih kosong (Global Intelligence Map, AI Snapshot, Market Pulse, Sector Rotation, Altcoin Scanner, Whale Intelligence), **tanpa nyentuh fitur/API flow/business logic/backend**. Jadi ronde ini murni presentation layer: nggak ada file di `lib/intelligence/*.ts` atau route API manapun yang disentuh — semua komponen tetap nerima props yang persis sama, cuma cara render-nya beda.

**Sistem warna baru — perubahan paling mendasar ronde ini**

Sebelumnya `signal` (violet, CSS-var jadi bisa diganti user lewat Accent Color picker di Settings) dipakai sebagai warna default hampir di semua tempat — bukan cuma buat AI. Sekarang:
- **Gold** (`gold` token baru di `tailwind.config.ts`, static hex, sengaja BUKAN CSS-var kayak `signal` — biar Accent Color picker tetap cuma ngatur `signal`/AI, gold gak ikut kegeser) jadi primary/premium accent: ambient glow di card penting, hover glow default (`.glow-card` dapet `box-shadow` beneran sekarang, sebelumnya cuma ganti border-color padahal namanya "glow"), border aktif node/sector/quick-link.
- **Purple (`signal`)** sekarang ketat cuma buat elemen yang literally "AI": AI Core orb di Intelligence Map, AI Snapshot (verdict + confidence bar), Confidence gauge di Market Pulse (kebetulan di data-nya emang udah ditandai `tone: "signal"` dari sononya — `lib/intelligence/marketPulse.ts` gak disentuh, cuma sekarang ke-render sesuai tag yang emang udah ada), AI Score bar di Altcoin Scanner, AI Energy widget.
- **Neutral = Blue**, **Transition = Gold**: sebelumnya "neutral" state kadang ke-render ungu (ketuker sama AI) dan kadang abu-abu; sekarang konsisten biru (`smartmoney`) di semua tempat yang genuinely soal state pasar netral (Intelligence Map, Market Status Badge, Market Pulse, Sector Rotation, Altcoin Scanner, Whale Panel). "Transition"/amber tetap dilabeli amber di data, cuma tampilannya sekarang gold.
- Perubahan warna ini **cuma di file yang eksklusif dipakai `/dashboard`** (dicek satu-satu lewat grep sebelum disentuh: `GlobalIntelligenceMap`, `MarketStatusBadge`, `PulseGauge`, `Sparkline`, `SectorRotationHeatmap`, `AltcoinScannerTable`, `WhaleLiquidityPanel`, `AIFinalConclusion` — semua konfirmed cuma di-import dari `app/dashboard/page.tsx`). Komponen yang dipakai bareng halaman lain (`GlowCard`, `Badge`, `LiveDot`, `SectionHeader`) cuma dapet tambahan opsional (tone/prop baru) tanpa ubah default — semua ~30+ caller lain di luar dashboard (trading, paper-trader, scanner, whale activity, settings, dst.) render persis kayak sebelumnya.

**Per-section**

- **Global Intelligence Map** — tambah "AI Core" orb (breathing scale + 2 ring rotasi arah berlawanan + sonar ping, reuse `coreBreathe`/`orbitSlow`/`orbitSlowReverse` dari Phase 5 landing, bukan mekanisme baru) gantiin bar status polos di tengah map; data yang ditampilin (status/confidence/reasons) sama persis, cuma dibungkus visual baru. Node dirapetin dikit (`space-y-3`→`space-y-2.5`), hover sekarang enlarge (`scale-1.03`) selain lift, dan klik node sekarang ikut nge-pin connected-path highlight (sebelumnya cuma hover) — tetap buka NodeDrawer yang sama kayak sebelumnya.
- **AI Snapshot** (`AISummaryCard.tsx`) — full rewrite dari tabel divide-y (`TerminalReportView`, yang JUGA dipakai AI Final Conclusion + tiap balasan AIChatDock/ElVoidChatPanel/AskNocturnBar) jadi grid status-card premium: AI Verdict + Confidence progress bar di atas, lalu 6 card (Market Mode/Fear & Greed/Whale Activity/Macro/Liquidity/Market Bias) icon+warna. Sengaja **gak nyentuh `TerminalReportView.tsx`** — komponen itu tetep persis sama kayak sebelumnya buat AI Final Conclusion dan semua balasan chat, cuma AI Snapshot yang dapet layout baru, ambil row yang sama dari object `TerminalReport` yang sama (`lib/intelligence/marketSnapshotReport.ts` gak disentuh sama sekali).
- **Market Pulse** — `PulseGauge` sekarang punya jarum beneran (garis dari pusat ke titik baca, animasi rotasi halus) di atas arc yang udah ada, plus glow pas connected dan pulse ring lembut di sekeliling gauge yang live.
- **Sector Rotation** — tambah icon per sector, trend arrow, approx % (diturunkan dari `momentum` yang udah dihitung — `(momentum-50)/3.5`, kebalikan formula yang ada di `lib/intelligence/sectorRotation.ts`, ditulis ulang di layer tampilan doang, bukan angka baru), sama mini sparkline 2-titik (baseline netral 50 → momentum live). Sengaja gak bikin sparkline pura-pura ada histori — data row sector emang gak nyimpen time-series, jadi 2-titik yang jujur dipilih ketimbang ngarang angka masa lalu (konsisten sama aturan "no dummy data" yang udah dipegang proyek ini dari awal).
- **Altcoin Scanner** — nambahin logo koin (`row.image`, field yang udah ada dari CoinGecko tapi belum pernah dirender), sector badge dengan icon, AI Score jadi progress bar gradient (bar baru lokal di file ini — sengaja gak nyentuh `ConfidenceMeter` yang dipakai bareng RugpullRiskPanel/PumpCandidatesPanel/mobile sections), liquidity jadi badge berwarna, plus accent border kiri pas hover row.
- **Whale Intelligence** — icon Waves dikasih animasi mengambang halus, tiap whale card dapet icon arah transaksi (inflow/outflow/accumulation, diturunkan dari teks label card yang udah ada), badge "Live"/"Waiting" jujur berdasarkan flag `sample` yang emang udah ada (bukan angka confidence baru yang dikarang).
- **Card lain di halaman yang sama** (Crypto Heatmap, Institutional Flow, AI Final Conclusion, Top Market Overview, AI Energy widget) — polish ringan biar konsisten sama section di atas: header icon, ambient glow gold, hover state, tanpa restructure besar karena emang gak diminta eksplisit di brief.

**Testing:** `tsc --noEmit` bersih (0 error, seluruh proyek) dan `next build` sukses generate semua 88 route termasuk `/dashboard`. Google Fonts (`Inter`/`JetBrains Mono`/`Bricolage Grotesque`) gak ke-fetch pas build karena sandbox nulis kode ini emang gak diizinin akses `fonts.googleapis.com` — di-stub sementara cuma buat sanity-check build, langsung di-revert (`git checkout`) sebelum kelar, gak ada perubahan permanen ke `app/layout.tsx`. 403 dari CoinGecko/Binance/DefiLlama/Farside pas static generation juga murni network sandbox, bukan bug — itu justru nunjukin fallback "waiting for API"/sample yang udah ada di codebase ini jalan kayak yang diharapin.

**Gak disentuh** (sesuai brief): semua file `lib/intelligence/*.ts` dan file bisnis logic lain, semua route API, struktur/urutan section di `app/dashboard/page.tsx` (cuma tambah `<AmbientBackground />` + styling), halaman selain `/dashboard` (Settings Accent Color picker tetap punya mekanisme yang sama persis, cuma sekarang ngatur cakupan yang lebih sempit — AI-only — karena gold gak lagi lewat token `signal` yang sama).


Brief-nya: audit codebase dulu, baru implementasikan brief "ELSTAND AI CORE" (dokumen system-prompt terpisah yang di-upload Karin) jadi engine modular production-ready — 10 module (Oracle, Market Intelligence, Technical Analyst, Scanner, Confidence Engine, Narrative, Paper Trading Coach, Journal, Personal Coach, Token Analyzer), masing-masing bisa dipanggil independen lewat AI Router, gak bikin fitur baru dulu, gak ubah UI kecuali perlu, fokus backend AI/prompt engineering/reasoning flow/service layer/integrasi data yang udah ada.

**Prinsip inti, dipegang di semua 10 module:** layer AI ini gak pernah menghitung ulang atau menggantikan angka yang udah final dari engine rule-based (`lib/elvoid/engine.ts`) — Confidence, Trade Grade, entry/SL/TP semua tetep punya SATU sumber kebenaran. Tugas tiap module cuma menjelaskan/menarasikan/memberi konteks pada angka itu. Konkretnya: field numerik dari hasil AI (mis. `confidence`, `grade`) selalu ditimpa balik dengan angka asli dari signal SETELAH LLM merespons — gak pernah dipercaya mentah-mentah dari output model, meski prompt-nya udah eksplisit minta jangan diubah.

**Arsitektur (`lib/ai/core/`)**
- `llm.ts` — `callAiCore()`, satu pintu masuk semua module ke LLM: coba paid provider dulu kalau `AI_CHAT_PROVIDER` di-set eksplisit, jatuh ke chain gratis Groq→OpenRouter (Phase 3.0) kalau enggak. Parse JSON + satu percobaan "perbaikan" (strip ```json fence) + validasi shape sebelum dipercaya. GAK PERNAH throw ke caller — apapun yang gagal (belum dikonfigurasi, timeout, JSON invalid, shape gak cocok) collapse jadi `null`, tiap module lalu fallback ke hasil deterministik sendiri. Sama persis prinsip "integrasi opsional gak boleh matiin fitur" yang udah dipakai di `lib/energyGate.ts`/`app/api/chat`.
- `lib/ai/router.ts` (Phase 3.0's file) — ditambah `routeStructured()` + refactor internal (`runProviderChain` diekstrak dari `runRouterChain` lama). **`routeChat`/`routeChatStream` gak berubah perilakunya sama sekali** — cuma sekarang manggil fungsi chain yang sama dari dalam, byte-for-byte pesan/cache/timeout yang sama kayak sebelumnya.
- `lib/ai/provider.ts` — `AiProviderInput` nambah `systemPromptOverride`/`maxTokensOverride` opsional. Kalau gak diisi (semua call site lama gak ngisi ini), perilaku 100% sama kayak sebelumnya — cuma dipakai `callAiCore()` pas eksplisit mau lewat paid provider.
- `prompts.ts` — preamble misi/aturan inti (dari brief AI CORE yang di-upload: jangan pernah mengarang, jangan hitung ulang angka yang udah final, jangan janjikan profit, selalu jelasin KENAPA) + instruksi + skema JSON per module. Ditulis Bahasa Indonesia biar konsisten sama suara ElVoid AI yang udah ada di seluruh app (bukan bahasa dokumen aslinya yang Inggris).
- `types.ts`, `context.ts` (context builder market-wide buat Market Intelligence/Narrative — reuse fungsi-fungsi yang udah diekspor `app/api/chat/route.ts` juga pakai, tanpa nyentuh route chat itu sendiri), `modules/*.ts` (10 file, satu per module), `router.ts` (registry — re-export semua + `AI_CORE_MODULES` buat referensi).

**Penyesuaian kecil ke 2 file existing (visibility doang, logic gak disentuh):** `lib/elvoid/engine.ts` — `CONFLUENCE_FACTOR_KEYS` di-export (dipakai Confidence Engine biar gak duplikat daftar 12 faktor). `lib/elvoid/performance.ts` — nambah `getJournalEntryById()` (query select yang sama kayak `getJournalEntries()`, cuma di-narrow ke 1 baris, buat route AI Journal on-demand di bawah).

**Wiring ke route — opt-in semua, gak ada perilaku default yang berubah**
- `POST /api/ai-signals` — body `includeAiReasoning: true` → jalanin Oracle + Technical Analyst + Confidence Engine paralel, nempel di response sebagai `aiReasoning`. Tanpa flag ini: response sama persis kayak sebelum phase ini.
- `POST /api/ai-signals/scan` — body `includeAiReasoning: true` → AI Scanner narasiin batch, nempel sebagai `aiScanner`.
- `GET /api/token-analysis?ai=1` → AI Token Analyzer, nempel sebagai `aiTokenAnalysis`. Eksplisit nyebutin di `unavailableChecks` kalau holder count/unlock schedule/audit/treasury wallet emang gak ada sumber datanya di app ini (`CoinReport.holders`/`.nextUnlock` udah `null` dari sononya) — gak pernah dikarang.
- `GET /api/ai-performance?ai=1` → Paper Trading Coach + Personal Coach, nempel sebagai `aiCoach`.
- `POST /api/ai-journal/review` (route baru) — body `{ journalEntryId }`, generate `TradeReview` rule-based (`lib/elvoid/review.ts`, gak diubah) lalu AI Journal narasiin ulang. Sengaja route terpisah dari `GET /api/ai-journal` (list) biar buka tab Journal gak mancing N-request AI buat N baris histori.
- `GET /api/ai-market-intelligence?mode=intelligence|narrative|both` (route baru) — Market Intelligence + Narrative dari 1 context fetch yang sama.

**Energy** (`lib/energy.ts`, tambahan murni — 5 cost lama gak berubah): `ai_reasoning` (3), `ai_scanner_reasoning` (3), `ai_token_analysis` (2), `ai_market_intelligence` (3), `ai_journal_review` (2), `ai_coach` (3). Semuanya cuma kena charge kalau minimal salah satu module beneran jalan di LLM asli — kalau semuanya jatuh ke fallback deterministik (AI belum dikonfigurasi / provider lagi gagal semua), reservation-nya di-refund, bukan di-charge diam-diam buat fitur yang secara fungsional gak kejadian.

**Gak disentuh** (sesuai brief): UI (semua field baru di atas cuma ada di response API, belum ada tampilan buat nampilinnya — itu next step kalau mau disurface), Signal Logic/engine perhitungan (`lib/elvoid/engine.ts` selain 1 baris export), Landing Page, Auth, Dashboard Layout, Google Login, Wallet, `routeChat`/`routeChatStream` punya Phase 3.0. Zero dependency npm baru (gak nambah zod/schema-lib — validasi JSON manual, konsisten sama gaya codebase yang emang gak pernah pakai schema library).

**Belum digarap ronde ini**
- "AI Risk Engine" (Module 10 di dokumen brief asli) gak termasuk di 10 prioritas yang diminta round ini — kalau mau, bisa nyusul, kemungkinan besar tinggal narasiin `scanRiskAssessment()` yang udah ada di `lib/elvoid/scanners.ts`.
- Belum ada UI buat nampilin `aiReasoning`/`aiScanner`/`aiTokenAnalysis`/`aiCoach`/route baru — murni backend + service layer dulu sesuai brief.
- Belum di-test end-to-end lawan Groq/OpenRouter/paid-provider beneran (sandbox nulis kode ini gak punya akses network ke API-API itu) — udah lolos `tsc --noEmit` (strict, 0 error) dan `next build` (lolos semua compile/bundle, cuma kepentok fetch Google Fonts yang network sandbox-nya emang gak izinin, gak related ke kode ini) tapi test API call beneran perlu dicoba di environment Karin sendiri.
- Belum ada persistensi hasil AI ke DB (mis. simpen `aiReasoning` bareng row `ai_signals`) — sekarang di-generate on-demand tiap request, gak nambah kolom/migration baru.

## V3.0 — Phase 3.2: AI Energy System (akhirnya beneran jalan, bukan stub)

**Patch (hari yang sama):** bug asli ketemu abis first delivery — `reserveEnergy()` nge-treat SEMUA kegagalan `spendEnergy()` sebagai "insufficient_energy" (402, AI gak dipanggil), termasuk kalau penyebabnya infra error (misal migration `ai_token` belum jalan di Supabase live, RLS misconfig, DB blip). Efeknya: kalau ada masalah infra apapun di sistem energy, 3 fitur yang di-gate (Analyze Coin, Generate Signal, AI Chat) ikut mati total — padahal harusnya masalah di layer metering gak boleh sampai matiin fitur AI yang sebenarnya. Fixed: sekarang cuma rejection asli ("insufficient_energy") yang nge-block; error lain (dikasih kode `"infra_error"`) bikin request lanjut *unmetered* (di-log, tapi AI tetep jalan). `reserveEnergy()` juga dibungkus try/catch penuh sebagai jaring terakhir — apapun yang meledak di situ gak akan pernah nge-crash route AI-nya.

Brief-nya: bikin sistem AI Energy yang beneran berfungsi — belum ada payment/top-up/blockchain/wallet payment/subscription, itu semua nanti. Pas mulai ngoprek, ternyata table-nya (`ai_token`, `ai_token_transactions`) udah ada dari Phase 3.1 lengkap dengan RLS, cuma masih stub separuh jalan: UI-nya nampilin "0" hardcoded, dan `chargeEnergy()` di `lib/energyGate.ts` gak dipanggil di endpoint manapun. Jadi round ini nyambungin yang udah ada, bukan bikin sistem paralel — table-nya dipakai apa adanya, gak ada migration nambah table baru.

**Ganti mekanisme daily reward, bukan cuma nyalain switch**

Versi Phase 3.1 reset balance ke 10 flat tiap 24 jam secara pasif, begitu ada request yang baca balance-nya. Brief minta yang beda banget: klaim +10 manual lewat tombol, gated 24 jam sejak klaim terakhir (bukan reset jam 00.00). Itu ganti mekanisme beneran, bukan rename doang — jadi `lib/energy.ts` gue tulis ulang total:
- `claimDailyEnergy()` — klaim +10, compare-and-swap atomic di level query biar gak bisa spam-klik tombol atau klaim dobel dari 2 tab/device.
- `spendEnergy()` — tetep ada (logic-nya udah bener dari Phase 3.1), sekarang dipakai sebagai langkah "reserve" di gate baru (lihat bawah).
- `refundEnergy()` — baru. Undo spend kalau fitur yang dibayar ternyata gagal.
- Kolom DB tetep `balance` dan `last_reset_at`, gak di-rename — cuma makna `last_reset_at` sekarang "kapan terakhir klaim", bukan "kapan terakhir reset pasif". Rename kolom berarti nyentuh tiap caller cuma buat manfaat kosmetik, jadi gue skip demi minim risiko.
- Nambahin `check (balance >= 0)` di `ai_token` (`supabase/schema.sql`) — jaga-jaga di level DB, bukan cuma percaya logic aplikasi.

**Reserve-then-refund buat 3 fitur yang di-gate**

Brief-nya beda redaksi soal kapan energy dipotong per fitur: Generate Signal & AI Chat eksplisit "kalau gagal jangan dipotong", Analyze Coin cuma bilang "harus otomatis mengurangi" tanpa nyebut sukses/gagal. Gue samain ketiganya biar konsisten: potong energy duluan (atomic — gak bisa kebobol biarpun ada 2 request bareng di sisa energy pas-pasan), baru jalanin fitur-nya, refund kalau gagal. Analyze Coin jadi ikut auto-refund kalau exception juga, meski brief gak eksplisit minta — lebih aman buat user dan brief-nya emang gak bilang sebaliknya. `lib/energyGate.ts` nambah `reserveEnergy()` + `settleEnergy()` buat pola ini; `chargeEnergy()` yang lama dibiarin nganggur (masih gak kepake di mana pun, tapi gak gue hapus — gak ada ruginya).

Yang di-gate, biaya, dan definisi sukses/gagal yang gue pakai:
- **Analyze Coin** (`app/api/token-analysis`, −2) — sukses kecuali exception (502). "Coin not found" tetep dianggap sukses — mesin analisisnya emang jalan, cuma datanya kosong, itu jawaban valid.
- **Generate AI Signal** (`app/api/ai-signals` POST, −4) — sukses kalau ada signal object yang keluar (persisted atau enggak ke DB, dua-duanya tetep kena charge — user tetep dapet signal beneran). 404 "candle data gak tersedia" dan exception di-refund.
- **AI Agent Chat** (`app/api/chat` POST, −2) — sukses kecuali report balik dengan `title: "SYSTEM"` (penanda internal buat "AI sedang sibuk" / error — udah ada dari sononya di `errorReport()`, bukan gue yang nambahin). Jawaban rule-based "COIN NOT FOUND" tetep charge, itu jawaban beneran bukan error.

Cuma 3 endpoint ini yang di-gate. `/api/ai-signals/scan` (full watchlist scan) dan `/api/ai-signals/analyze-chart` sengaja gue biarin — brief nyebut 3 fitur spesifik, gue gak nebak-nebak nambahin sendiri.

**Endpoint baru**

`/api/ai-energy` (GET — balance + riwayat 10 transaksi terakhir), `/api/ai-energy/claim` (POST), `/api/ai-energy/consume` (POST — generic validate-then-spend, dipanggil siapapun yang butuh potong energy langsung by feature key). `/api/account/energy` (bikinan Phase 3.1) sengaja dibiarin apa adanya — masih jalan normal, cuma UI baru gak manggil dia lagi, semua pindah ke `/api/ai-energy`.

**UI**

- **Profile Dropdown** (`ProfileMenu.tsx`) — angka "0" hardcoded diganti balance beneran (data-nya sebenarnya udah ke-fetch dari `/api/account/me`, cuma gak dipakai), label "AI Token" → "AI Energy" biar sama kayak brief. Ditambah refetch pas dropdown dibuka biar gak nampilin angka basi.
- **Settings** (`AiEnergySection.tsx`) — plot twist: komponennya udah lumayan lengkap dari Phase 3.1 (bukan static placeholder kayak dugaan awal gue dari komentar lama di schema.sql), tapi ternyata gak pernah di-render — gak ada di `SettingsView.tsx` maupun di nav (`SettingsNav.tsx`). Gue tulis ulang (tombol Klaim, copy diupdate biar gak nyebut "reset otomatis" lagi) sekalian akhirnya didaftarin ke nav + di-render.
- **Dashboard** — widget kecil baru (`AiEnergyWidget.tsx`), pill kecil pojok kanan atas halaman, styling sama persis kayak pill di Settings/Profile (gak bikin gaya baru). Gak nyentuh grid/panel yang udah ada — cuma 1 baris baru paling atas, sebelum disclaimer.

**Pesan error yang bener, bukan silent fail**

Chat: response insufficient-energy dibungkus dalam bentuk `TerminalReport` yang sama kayak balasan normal (biar `useElVoidChat.ts` gak perlu diubah — kalau formatnya beda, hook-nya bakal nganggep ini network error terus auto-retry, user gak pernah liat pesan yang bener). Token Analyzer (drawer + versi mobile) dan Chart Analysis (`ChartAnalysisView.tsx` — tombol Save Signal/Execute) ditambahin state buat nangkep status 402 secara spesifik, biar "AI Energy tidak mencukupi." beneran nongol ke user. `AiSignalView.tsx` (halaman utama Generate Signal) udah otomatis bener dari sononya berkat error-handling yang udah ada — gak gue apa-apain.

**Gak disentuh** (sesuai brief): Landing Page, Google Login, Wallet, Signal Logic, AI Router, Dashboard Layout, Authentication. Zero dependency npm baru.

**Belum digarap ronde ini**
- Payment / top-up / blockchain / wallet payment / subscription — emang belum scope-nya, brief-nya jelas soal ini.
- `/api/ai-signals/scan` dan `/analyze-chart` gak di-meter — brief cuma nyebut 3 fitur spesifik.
- Edge case concurrency yang sempit banget: 2 request nyaris bersamaan dari sisa energy pas-pasan bisa dua-duanya lolos reservation sebelum salah satu ke-block (balance tetap gak akan pernah negatif — itu dijamin — tapi teorinya bisa "kebobolan" 1 request ekstra dalam skenario super jarang ini). Fix penuhnya butuh pola hold/reserve yang lebih berat dari compare-and-swap; kalau nanti concurrency-nya beneran jadi masalah, itu langkah berikutnya.

## V2.9 — Phase 3.0: AI Router (Groq + OpenRouter, gratis, auto-failover)

Fokus ronde ini murni AI Chat Backend — gak nyentuh Dashboard, Landing Page, Wallet, Google Login, komponen UI manapun, database, atau AI Signal Engine (`lib/elvoid/*`). Yang berubah cuma `lib/ai/`, `app/api/chat/route.ts`, dan dokumentasi.

- File baru `lib/ai/router.ts` — router LLM gratis: **Groq (primary, retry sekali kalau gagal) → OpenRouter (fallback, jalan turun daftar model FREE: Qwen → Mistral → Llama → satu ekstra safety net)**. Gak ada Gemini/Claude/GPT/provider berbayar manapun yang dipanggil di jalur ini — sama sekali gak masuk ke kode router-nya.
- Auto-failover beneran otomatis dan gak kelihatan user: kalau Groq kena rate limit/timeout/500/quota habis, langsung pindah ke OpenRouter tanpa user notice apa-apa. Provider mana yang jawab cuma dicatat di server log (`[AI Router] Provider: ...`), gak pernah ikut ke response API.
- Timeout keras 15 detik per attempt (`AbortController`), retry Groq cuma sekali sebelum pindah, dan model OpenRouter yang udah retired/salah nama cukup bikin attempt itu gagal cepat terus lanjut ke model berikutnya di daftar — gak nge-hang di satu model yang mati.
- Cache 45 detik (`AI_ROUTER_CACHE_TTL_MS`, default di tengah rentang 30-60 detik yang diminta) berdasarkan teks pesan — pertanyaan yang sama diulang dalam jendela waktu itu gak nembak API lagi. Sengaja gak ikutin `liveContext` (harga BTC dkk yang berubah tiap request) di cache key-nya, biar cache-nya kepake beneran buat pertanyaan berulang.
- System prompt SAMA PERSIS dipakai buat Groq maupun tiap model OpenRouter, jadi gaya jawabnya konsisten siapa pun yang jawab di baliknya — natural, gak markdown, gak template kaku (sesuai instruksi STYLE AI di brief).
- **Default zero-config gak berubah**: kalau `GROQ_API_KEY` dan `OPENROUTER_API_KEY` dua-duanya kosong, chat tetap 100% jalan di rule-based Intelligence Engine yang lama — gak ada yang break buat siapa pun yang belum nambahin key. Kalau dua-duanya ADA tapi semua attempt gagal, baru muncul pesan "AI sedang sibuk. Silakan coba beberapa saat lagi." (sesuai brief) — bukan diam-diam diganti market snapshot.
- `lib/ai/provider.ts` (provider paid — OpenAI/Claude/Gemini/DeepSeek/local) SENGAJA gak disentuh sama sekali — masih ada buat siapa pun yang mau opt-in eksplisit lewat `AI_CHAT_PROVIDER`, biar nambahin provider lain nanti tetap tinggal config, bukan rombak arsitektur.
- Bonus opsional: `app/api/chat/stream/route.ts` — endpoint SSE streaming token-by-token dari router yang sama, buat kalau nanti frontend mau diupgrade ke streaming beneran. **Gak dipasang ke UI manapun saat ini** (dock/panel/mobile bar semua masih manggil `/api/chat` yang JSON biasa, `lib/hooks/useElVoidChat.ts` gak disentuh) — murni disiapin di baliknya aja sesuai batasan "jangan ubah UI".

Belum/gak digarap ronde ini (di luar scope brief): perubahan apapun ke `lib/hooks/useElVoidChat.ts` atau komponen chat biar beneran nampilin streaming secara visual (endpoint-nya udah siap, tinggal disambungin kalau ada ronde UI berikutnya), dan daftar model free OpenRouter itu sendiri — lineup free OpenRouter dikenal suka rotasi, jadi `OPENROUTER_FREE_MODELS` di `.env.local` ada buat di-update tanpa perlu sentuh kode kalau suatu saat modelnya di-retire.

## V2.8 — Phase 3 slice: Reasoning Chain di Global Sentiment node ("bukan black box")

Developer prompt Phase 3 minta "Rule Engine + Correlation Engine + Confidence Engine + Cross Market Analysis" dengan rantai sebab-akibat News→Sentiment→DXY→Gold→Stocks→Crypto→BTC→ETH→Altcoin→AI Conclusion yang bisa dijelaskan, bukan black box. Itu scope berminggu-minggu kalau digarap literal (butuh correlation engine statistik yang beneran, dan aku gak punya data historis buat validasi itu di sandbox ini — jadi gak digarap, biar gak pura-pura ada rigor statistik yang sebenarnya gak ada).

Yang beneran achievable dan jujur round ini: `deriveGlobalSentiment()` (di `globalSentiment.ts`) TERNYATA sudah jadi rule engine yang tepat — baca 8 sinyal (Fear&Greed, market cap, DXY, Gold, Stocks, BTC, Altcoin, macro event) dan vote jadi satu status + confidence. Masalahnya reasoning-nya cuma keluar sebagai list rata (gak dikelompokkan per node, dan di card ringkasan cuma nongol top-3). Round ini bikin itu jadi chain yang bener-bener bisa diklik & ditelusuri:

- `SentimentReason` sekarang punya field `node` (macro/usd/gold/stocks/crypto/altcoin) — nandain reason itu asalnya dari node mana di peta. Threshold & rumus vote-nya SAMA PERSIS, cuma reason-nya sekarang ditag.
- Fungsi baru `buildReasoningChain()` — regroup `reasons` (yang tadinya flat) jadi urutan tetap macro → USD → Gold → Stocks → Crypto → Altcoin, tiap node nunjukkin reason-nya sendiri atau "Tidak ada sinyal signifikan saat ini" kalau memang gak ada — gak pernah diisi dummy.
- `DrawerSection` di `marketMap.ts` punya varian baru `"chain"`, dipasang di node "Global Sentiment" pada Global Intelligence Map — ganti list datar yang lama.
- `NodeDrawer.tsx` render chain itu sebagai flow vertikal: titik + garis penghubung per node, warna sesuai tone, berakhir di baris "AI Conclusion" (status + confidence). Klik node "Global Sentiment" di peta → langsung keliatan kenapa AI narik kesimpulan itu, node per node.
- PENTING soal kejujuran desain: ini fan-in (semua node vote paralel ke satu Sentiment), BUKAN pipeline sekuensial (DXY gak benar-benar "menyebabkan" Gold gerak di kode ini). Aku render sebagai flow visual karena itu cara paling gampang dibaca, tapi framing-nya "sinyal-sinyal ini membentuk verdict" bukan "A men-trigger B men-trigger C" — biar gak ngarang causal claim yang gak didukung logic-nya.

Belum digarap: reasoning chain ini baru nempel di node Map doang, belum di-surface ke AI Final Conclusion card atau chat/Market Snapshot (V2.7). "Correlation Engine" versi statistik beneran (korelasi historis antar aset) juga belum — butuh data historis + keputusan soal sumbernya dulu. Sisa Phase 3 (Cross Market Analysis view yang lebih eksplisit, dsb) juga belum disentuh. Phase 4/5/6/7 di developer prompt itu juga masih di luar round ini.

## V2.7 — AI Chat + AI Summary jadi terminal beneran (bukan lagi chatbot)

Bagian paling "ChatGPT banget" di seluruh app — chat dock, AI Summary card, dan mobile Ask bar — masih pakai markdown header, `**bold**`, emoji (📊🐋⚠️📈📰💡), dan paragraf panjang di rounded bubble sampai round ini. Padahal Map, Heatmap, Market Pulse, dan AI Final Conclusion semua udah kena gaya terminal dari V2.1–V2.5. Round ini nutup gap itu — fokus ke bagian "AI Response Style", "Terminal Experience", "Error Handling", dan "AI Summary Redesign" di brief V3.

- Tipe baru `TerminalReport` (`lib/terminalReport.ts`) — title + baris label/value + tone + list singkat + conclusion + recommended action + watchlist. Format bersama untuk SEMUA output AI, bukan komponen per komponen.
- `lib/analysis.ts` dirombak total: semua fungsi yang tadinya nge-generate string markdown+emoji sekarang balikin `TerminalReport`. Matematika/threshold-nya SAMA PERSIS — gak ada logic yang diubah, cuma bentuk output-nya. `buildConclusion()`, `CoinReport`, `getCoinReportData()` (dipakai Token Analyzer widget) sengaja gak disentuh sama sekali biar gak ada risiko break di fitur lain.
- Komponen baru `components/ui/TerminalReportView.tsx` — satu renderer buat semua card (title bar ala Bloomberg `<GO>`, LiveDot, baris label/value, watchlist, recommended action). Dipakai bareng-bareng oleh AI Summary card DAN chat (dock/panel/mobile bar) — ubah gaya card cukup di satu file.
- Chat sekarang beneran kerasa terminal: pesan user ditulis `root@elvoid` / `«teks»`, bukan bubble ijo. Loading state siklus "Connecting... → Loading Intelligence... → Checking Macro... → ... → Generating Final Decision..." (urutan persis dari brief), bukan "Thinking…" doang. Kalau fetch lebih lama dari sequence-nya, berhenti di step terakhir — gak ngulang dari awal biar gak kesan buggy. Hormat `prefers-reduced-motion` (langsung ke step terakhir, gak nyicil).
- Error state juga terminal-style (`root@elvoid` / `ERROR` / alasan / `Retrying...`) — dan "Retrying..." itu BENERAN retry sekali otomatis, bukan teks dekoratif. Kalau gagal lagi baru muncul tombol "Coba lagi" manual.
- `AISummaryCard.tsx` sekarang render `TerminalReport` yang angkanya sama persis dengan Market Pulse + AI Final Conclusion — dihitung SEKALI di `app/dashboard/page.tsx` (`pulseInputs`, `pulseMetrics`, `finalConclusion`) terus dipakai bertiga, jadi card ini gak mungkin beda pendapat sama panel lain. Field baru yang nambah: Market Cap, BTC Dominance, Fear Index, Funding, Open Interest.
- `app/api/chat/route.ts` dirombak: klasifikasi intent dulu (murah, gak fetch apa-apa) buat pertanyaan spesifik (coin/whale/risk/momentum/news/greeting) — baru kalau user nanya market secara umum, route ini fetch sentiment/ETF/macro yang SAMA kayak dashboard (`lib/intelligence/marketSnapshotReport.ts`), biar jawaban "ringkasan market" gak pernah beda sama yang ditampilin di halaman utama.
- Buang field `action`/`open_chart` lama dari response API — ternyata udah 100% redundan sama `report.chartSymbol` yang baru (dua-duanya nunjuk coin yang sama), disederhanain jadi satu jalur.
- `AskNocturnBar.tsx` (mobile) tadinya punya fetch logic sendiri, terpisah dari `useElVoidChat`. Sekarang dipindah ke hook yang sama biar loading sequence & retry konsisten di 3 tempat (dock, panel, mobile bar), bukan 3 implementasi yang gampang beda-beda sendiri-sendiri.

Belum digarap ronde ini: restyle terminal buat sisa panel (Whale/Institutional Flow, Sector Rotation, Altcoin Scanner masih visual lama dari V1), Settings page redesign, Market Mode masih 4 state bukan 8 (Strong Risk On/Bullish/Bearish/Strong Risk Off belum ada threshold-nya di `deriveGlobalSentiment`), desktop top ribbon belum dicek satu-satu match sama daftar di brief (BTC/ETH/DOM/DXY/GOLD/NASDAQ/FEAR/NEWS).

## V2.6 — Audit "API di env tapi gak kebaca" + sambungin yang masih stub

Ronde ini fokus ke reliability data, bukan UI. Yang saya temuin & benerin:

**Bug utama yang paling mungkin nyebabin "udah taruh API key tapi gak kebaca":**
`lib/cache.ts` nyimpen HASIL GAGAL (`undefined`) selama TTL yang SAMA kayak
hasil sukses — buat DXY/M2 (FRED) itu 6-12 JAM. Jadi kalau server sempat
kepanggil SEKALI sebelum key ditambahin (gagal, ke-cache sebagai gagal),
nambahin key setelahnya gak langsung kelihatan — nunggu proses restart
atau TTL abis. Sekarang hasil gagal cuma di-cache maks 10 detik, sukses
tetap dapet TTL penuh. Ini kemungkinan besar akar masalahnya — **tapi kalau
masih belum muncul setelah ini, restart/redeploy Repl-nya sekali** biar
proses lama (yang mungkin masih pegang env var lama) beneran mati.

**Semua source (`lib/intelligence/sources/*.ts`, `lib/alchemy.ts`,
`lib/newsapi.ts`, `lib/stablecoins.ts`, `lib/snapshot.ts`,
`lib/dashboardSnapshot.ts`) sekarang nge-log alasan gagal yang sebenarnya**
(`console.error` dengan prefix `[nama-source]`) — sebelumnya semua gagal
diem-diem jadi `undefined`. Setelah deploy, cek log Replit-nya: kalau ada
baris `[twelvedata] ...` / `[finnhub] ...` dst, itu alasan pastinya (key
salah, plan gak cover simbol, rate limit, dll) — bukan saya nebak lagi.

**Ketauan pas audit:** `NEWSAPI_KEY` free tier NewsAPI.org **cuma jalan di
localhost** — ditolak dari domain manapun begitu di-deploy (aturan
NewsAPI sendiri, bukan bug). Ini kemungkinan salah satu API yang "ada
key-nya tapi gak pernah nyala". Fix: tambahin `GNEWS_API_KEY`
(https://gnews.io, gratis, gak ada batasan localhost) — kalau diisi,
otomatis jadi fallback pas NewsAPI gagal.

**Fitur baru/disambungin:**
- USD (DXY) node: kalau TwelveData gagal (simbol DXY sering gak ke-cover
  plan gratis), otomatis fallback ke FRED DTWEXBGS yang udah ada di
  `lib/macro.ts` — sesuai brief "if DXY fails, try another symbol".
- `lib/intelligence/institutionalFlow.ts`: sebelumnya stub yang SENGAJA
  selalu balikin kosong (didokumentasikan jelas di komentarnya — bukan
  bug, emang belum ada API ETF flow gratis). Sekarang scrape tabel publik
  Farside (https://farside.co.uk/btc/), sesuai prioritas di brief. **Catatan
  jujur:** saya tulis parser-nya berdasarkan HTML halaman itu yang saya
  baca lewat web-fetch saya sendiri (bukan dari sandbox coding, yang gak
  bisa akses situs luar) — jadi BELUM saya jalankan end-to-end. Cek log
  buat baris `[farside]`: gak ada = parsing sukses, ada = layout-nya
  beda dari yang saya baca, kasih tau saya buat saya sesuaikan. Kalaupun
  gagal, jatuhnya balik ke "Waiting" seperti sebelumnya — gak bakal nampilin
  angka ngasal.

**Sudah beres dari ronde sebelumnya (No. 10 & 11 di brief ini):** Market
Pulse (rule-based, 9 gauge) dan AI Summary yang menggabungkan semua sinyal
sudah dibangun di V2.4/V2.5 — gak perlu dikerjain ulang.

**Belum digarap ronde ini:** node-level status/last-update/confidence
animasi di Intelligence Map (No. 9), retry-with-backoff otomatis &
AbortController (No. 12 performance), Binance Long/Short Ratio (funding
rate + open interest udah ada, long/short ratio belum).

## V2.5 — AI Final Conclusion gaya terminal + urutan section dirapikan

- Section baru `components/intelligence/AIFinalConclusion.tsx` +
  `lib/intelligence/finalConclusion.ts`, persis format di brief V3
  (MARKET MODE / CONFIDENCE / BTC / ETH / ALT / WATCHLIST / FINAL
  ACTION) tapi semua nilainya baca ulang data yang sudah ada:
  - MARKET MODE & CONFIDENCE = `sentiment.status`/`.confidence` yang
    sama dipakai di Intelligence Map.
  - BTC/ETH/ALT = klasifikasi Bullish/Bearish/Neutral dari 24h change
    (ambang ±2%, sama kayak ambang "top decliners" yang udah dipakai
    di tempat lain) — ALT dari rata-rata top-30 altcoin yang sudah
    dihitung buat node Crypto Market di Map.
  - WATCHLIST = top-3 24h gainer beneran dari data yang sama dipakai
    `topGainer`/`topLoser`, bukan ticker contoh dari brief.
  - FINAL ACTION sengaja BUKAN sinyal beli/jual — WAIT/MONITOR/CONFIRMED
    cuma nunjukkin seberapa sejalan sinyal-sinyal di atas, konsisten
    sama disclaimer dashboard sendiri ("bukan sinyal beli/jual").
- Urutan section dirapikan biar sesuai nomor Section di brief: Altcoin
  Scanner (4) dipindah ke sebelum Market Pulse (6), dan AI Summary + AI
  Final Conclusion (7) sekarang jadi dua section PALING BAWAH — sesuai
  "AI Summary MUST become the final output after every analysis".

## V2.4 — Market Pulse (section baru)

- Section baru sesuai brief V3 (Section 6, sebelum AI Summary):
  `lib/intelligence/marketPulse.ts` + `components/intelligence/ui/PulseGauge.tsx`
  (gauge setengah lingkaran, reusable) + `components/intelligence/MarketPulsePanel.tsx`.
- 9 gauge: Risk Mode, Macro, Whale Activity, Institution, Sentiment,
  Liquidity, Volatility, Market Bias, Confidence — **semuanya baca ulang
  angka yang sudah dihitung panel lain** (sentiment, kalender makro,
  whale summary, Fear&Greed, stablecoin supply, funding rate BTC,
  altseason index, ETF flow), bukan angka baru yang dikarang.
- Ketauan pas nyambungin: `getInstitutionalFlowData()` sekarang selalu
  balikin `connected: false` (belum ada sumber data ETF flow yang live —
  kemungkinan integrasinya belum/sudah dicabut). Gauge "Institution"
  jujur nampilin "Waiting" bukan "Flat", karena "Flat" bakal keliatan
  kayak ada data yang bilang net flow-nya nol padahal sebenernya belum
  konek sama sekali. Sama buat gauge lain kalau sumbernya undefined
  (mis. stablecoin gagal fetch).
- Dipasang di dashboard tepat sebelum AI Summary, konsisten sama urutan
  section di brief.

## V2.3 — Crypto Heatmap disandingkan dengan Intelligence Map

- `components/heatmap/CryptoHeatmap.tsx` sudah ada dari sesi sebelumnya
  (treemap per-koin, ukuran cell mengikuti market cap rank, warna+intensity
  dari % perubahan, kategori bullish/bearish/rugpull-risk/smart-money,
  toggle Top 40/Top 80, klik cell buka Token Analyzer) tapi belum pernah
  dipasang ke dashboard — sekarang dipasang persis sesuai brief V3
  Section 1 (Map di kiri, Heatmap di kanan, desktop 2 kolom / mobile
  tumpuk). Datanya dari `base.markets`, `base.rugpullRisks`, dan
  `snap.smartMoneyAccumulation` yang sebenarnya sudah dihitung di
  `getDashboardSnapshot()` — jadi tidak perlu fetch baru.
- Heatmap dikasih `max-height` + scroll halus (`scrollbar-none`) supaya
  tetap rapi bersebelahan dengan Map waktu toggle ke Top 80, plus
  `LiveDot` di header konsisten dengan panel lain.
- Grid cell & hover-nya (`.heat-cell` di globals.css) sudah bagus dari
  sebelumnya, tidak diutak-atik.
- Section brief V3 yang lain (Whale Intelligence & Institutional Flow
  restyle, Sector Rotation restyle, Altcoin Scanner restyle, Economic
  Calendar di dashboard, Market Pulse — section baru, AI Final Conclusion
  gaya terminal, Settings redesign) belum digarap ronde ini.

## V2.2 — Zoom & pan di Global Intelligence Map

- Peta sekarang jadi canvas yang bisa di-zoom & digeser, gaya graph
  explorer Arkham Intelligence, lewat hook baru yang reusable:
  `components/intelligence/ui/useZoomPan.ts` — tanpa dependency
  tambahan, murni Pointer Events + satu native wheel listener.
- Interaksi: **mouse** klik-drag buat geser, **Ctrl/Cmd+scroll** buat
  zoom (scroll biasa dibiarkan apa adanya supaya halaman tetap bisa
  di-scroll normal walau kursor ada di atas peta). **Touch** satu jari
  TIDAK ditangkap sama sekali supaya swipe-scroll halaman tetap jalan
  seperti biasa — cubit/geser dua jari baru men-zoom & menggeser peta,
  persis seperti embed Google Maps. Tombol +/− dan reset selalu
  terlihat di pojok kanan bawah buat yang tidak coba gesture-nya, plus
  double click/tap buat lompat zoom.
- Klik node tetap berfungsi seperti biasa — ada guard kecil yang
  menekan event klik selama ±300ms setelah drag/pinch beneran
  terjadi, supaya menggeser peta tidak sengaja kebuka drawer.
- Perbaikan sekalian: garis penghubung SVG dulu dihitung dari
  `getBoundingClientRect()` (posisi di layar). Begitu container dikasih
  `transform` buat zoom/pan, itu bakal dobel-terskalakan. Sekarang
  dihitung dari `offsetLeft/offsetTop` (posisi lokal, tidak
  kepengaruh transform), jadi garis tetap nempel presisi ke node di
  skala/posisi berapa pun, dan tidak perlu dihitung ulang di tiap
  frame drag.
- Latar dot-grid tipis (`.map-canvas-grid` di `globals.css`) ditambahkan
  di belakang peta supaya "ini area yang bisa digeser" kelihatan dari
  awal, bukan cuma ketauan pas coba drag.
- `minScale`/`maxScale`/`edgePadding` di `useZoomPan` bisa dipakai lagi
  buat panel lain yang bakal jadi canvas juga (Sector Rotation, Altcoin
  Scanner map, dst.) dari brief redesign V3.

## V2.1 — Animasi flow di garis penghubung

- Garis di `GlobalIntelligenceMap` sekarang solid + glow (bukan dash
  "marching ants" lagi), dengan **3 partikel/bubble kecil yang mengalir
  terus-menerus** di sepanjang tiap garis (pakai SVG `animateMotion` +
  `mpath` native — tanpa dependency tambahan), meniru efek "liquidity
  mengalir" seperti referensi. Garis/node aktif (hover/klik) dapat partikel
  lebih besar, lebih terang, lebih cepat; garis idle tetap mengalir pelan
  supaya peta terasa hidup terus, bukan cuma saat disentuh.
- Menghormati `prefers-reduced-motion`: kalau user mengaktifkan itu di OS,
  partikel tidak dirender (garis tetap terlihat, cuma tanpa gerakan).
- Tidak menambahkan angka $ di garis (seperti di beberapa referensi) karena
  itu akan jadi data fiktif untuk hubungan macro→crypto yang sifatnya
  kausal, bukan aliran dana yang terukur — konsisten dengan aturan
  "no dummy data" dari brief sebelumnya.

## V2 — Global Intelligence Map rebuild

Fokus V2: peta jadi sistem real-time interaktif, bukan tampilan statis.

### Baru

- **`lib/intelligence/globalSentiment.ts`** — mesin AI reasoning. Membaca
  semua sinyal yang tersedia (Fear & Greed, market cap, DXY, Gold, Stocks,
  struktur BTC, momentum altcoin, event makro yang akan datang) dan
  menghasilkan **Risk On / Risk Off / Neutral / Transition** + confidence
  score 0–100 + daftar alasan. Dipakai bersama oleh Market Status card
  (Top Market Overview) dan header peta, jadi keduanya tidak pernah
  berbeda pendapat.
- **`lib/intelligence/sources/`** — integrasi API baru, masing-masing
  gated di belakang env var, `cached()`, dan fallback `undefined` yang
  graceful persis pola `lib/macro.ts`:
  - `twelvedata.ts` + `usd.ts` + `gold.ts` — DXY & XAU/USD via TwelveData,
    termasuk time-series untuk sparkline. Perlu `TWELVEDATA_API_KEY`.
  - `stocks.ts` — Nasdaq/S&P500/Dow Jones via Finnhub, pakai proxy ETF
    (QQQ/SPY/DIA) karena ticker indeks asli butuh paid add-on di Finnhub.
    Perlu `FINNHUB_API_KEY`.
  - `cryptoNews.ts` — berita crypto via CryptoPanic, fallback ke feed
    NewsAPI yang sudah ada kalau key tidak diisi. Opsional,
    `CRYPTOPANIC_API_KEY`.
- **`lib/intelligence/macroEvents.ts`** — mengkategorikan kalender makro
  yang sudah ada (gratis, ForexFactory) ke FOMC/CPI/PPI/NFP/PMI/Interest
  Rate sesuai spec, plus deteksi event high-impact yang akan datang untuk
  reasoning engine. Tidak menambah dependency baru.
- **`components/intelligence/ui/NodeDrawer.tsx`** — drawer modern: side
  panel di desktop, bottom sheet di mobile, dengan animasi slide + spring
  yang sesuai arah layout masing-masing.
- **`components/intelligence/ui/Sparkline.tsx`** — mini chart SVG ringan
  untuk node USD/Gold, tanpa dependency tambahan.

### Diubah total

- **`lib/intelligence/marketMap.ts`** — model data ditulis ulang. Setiap
  node sekarang punya `connected: boolean` (bukan `sample`) dan `sections`
  (list/stats/chart/text) yang generic — menambah node baru (Whale, Order
  Flow, Footprint, Liquidity Heatmap) di versi berikutnya tinggal menulis
  satu `buildXNode()` lagi, tidak perlu ubah tree, drawer, atau garis
  penghubung.
- **`components/intelligence/GlobalIntelligenceMap.tsx`** — header Global
  Sentiment (status + confidence + alasan) selalu tampil tanpa perlu klik;
  klik node membuka `NodeDrawer` (bukan panel inline di bawah peta seperti
  V1); semua garis penghubung sekarang berdenyut terus-menerus (lebih
  cepat & terang saat sebuah node di-hover/aktif, pelan & redup saat idle)
  supaya terasa hidup, bukan statis.
- **Tidak ada lagi label "Contoh"** di mana pun. Data yang belum terhubung
  ke API sekarang tampil sebagai **"Waiting for API Connection"** —
  termasuk di Institutional Flow (ETF Flow & Institutional Movement kini
  benar-benar kosong dengan status waiting, bukan angka contoh) dan
  Sector Rotation.

### Belum ada sumber gratis (tampil "Waiting for API Connection", bukan angka fiktif)

- **ETF Flow & Institutional Movement** — tidak ada API gratis tanpa key
  untuk data ini; lihat komentar di `lib/intelligence/institutionalFlow.ts`
  untuk opsi (Farside Investors, SoSoValue, atau vendor berbayar).
- **Large BTC Transaction on-chain** — feed whale (`lib/alchemy.ts`) hanya
  memantau token ERC-20, bukan BTC asli.

---

## V1 — Dashboard utama (struktur awal)

Semua di bawah ini ditambahkan untuk membangun `/dashboard` pertama kali
sesuai struktur awal yang diminta (Top Market Overview, Whale & Liquidity,
Institutional Flow, Sector Rotation, AI Summary, Altcoin Scanner). Tidak
ada file lama dari project asli yang dihapus.

- `lib/intelligence/shared.ts`, `sectorRotation.ts`, `whaleLiquidity.ts`,
  `altcoinScanner.ts` — helper rule-based dan taksonomi sektor bersama.
- `components/intelligence/TopMarketOverview.tsx`,
  `WhaleLiquidityPanel.tsx`, `InstitutionalFlowPanel.tsx`,
  `SectorRotationHeatmap.tsx`, `AltcoinScannerTable.tsx`,
  `MarketStatusBadge.tsx`.
- `app/dashboard/page.tsx` disusun ulang mengikuti urutan brief. AI Signal,
  Paper Trader, Token Scanner lengkap, dan chat tetap ada — dipindah ke
  baris "Lainnya dari ElStand AI" + sidebar/menu, bukan dihapus.
