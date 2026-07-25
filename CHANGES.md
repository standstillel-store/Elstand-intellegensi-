# ElStand AI — Market Intelligence Dashboard: apa yang berubah

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
