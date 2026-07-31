# PHASE 5 — Landing Page: Audit, Design System & Sitemap

*Audit berbasis codebase asli (`Elstand-intellegensi-.zip`) yang di-extract dan dibaca langsung — bukan asumsi. Belum ada satu baris kode pun yang diubah; ini murni dokumen perencanaan sesuai urutan yang diminta (audit → keep/rombak → design system → sitemap → baru implementasi).*

---

## Ringkasan Eksekutif

- Landing page (`app/page.tsx` + `components/landing/*`) **belum disentuh sejak Phase 3** — konfirmasi langsung dari `CHANGES.md` milikmu sendiri: entri "AI CORE ENGINE" maupun "AI Energy System" sama-sama eksplisit menulis *"Gak disentuh (sesuai brief): Landing Page, Auth[...]"*. Jadi struktur di bawah adalah kondisi asli, bukan hasil kerja terbaru.
- **Temuan paling penting:** `Pricing.tsx` masih jual paket $0 vs $29/bulan — padahal produk asli sudah pindah total ke sistem **AI Energy** (`lib/energy.ts`: saldo awal 10, klaim +10/hari, potong per fitur) sejak Phase 3.2, dan tidak ada satu pun kode payment/subscription di repo ini. `faqData.ts` juga masih menjawab *"the Free plan needs no card."* Ini bukan cuma soal visual — landing page saat ini **salah menjelaskan cara kerja produknya sendiri** ke pengunjung baru.
- `framer-motion` sudah terpasang (`^11.3.19`) tapi **nyaris tidak dipakai** di landing — `Hero.tsx` dan `HeroMockup.tsx` 100% statis, bahkan keyframe `cardFloat` yang sudah ada di `tailwind.config.ts` tidak dipanggil di mockup hero manapun.
- Tidak ada library 3D (`three`, `@react-three/fiber`) atau GSAP di `package.json`. Semua elemen "3D" yang diminta brief butuh satu keputusan: ilusi CSS/SVG (0 dependency baru) vs library 3D beneran — lihat Pertanyaan Terbuka.
- Warna yang diminta brief (`#09090B` / `#111827` / `#151823`) **nyaris identik** dengan token dashboard yang sudah ada (`#08090D` / `#12141B` / `#181B24`, disebut "Phase 2 palette" di komentar kode) — tapi tidak sama persis, dan brief eksplisit minta jangan sentuh dashboard dulu. Rekomendasi: namespace token baru khusus landing.
- Dashboard sudah punya primitive UI kelas institusi yang matang (`RadialGauge`, `AnimatedNumber`, `GlowCard`, `LiveDot`, `SimulatedTag`) — landing sama sekali belum memakainya, padahal ini persis yang dibutuhkan untuk panel "AI Live Status"/"Terminal Preview" ala brief.

---

## 1. Audit UI Lama

Urutan render saat ini (`app/page.tsx`):

```
LandingHeader → Hero → About → Features → HowItWorks →
AiSignalShowcase → Pricing → Faq → LandingFooter → JsonLd
```

| File | Kondisi saat ini | Catatan |
|---|---|---|
| `LandingHeader.tsx` | Server component statis, tanpa deteksi sesi login | Semua CTA → `/login` |
| `Hero.tsx` | Statis total, 2 kolom, tanpa motion sama sekali | Copy generik ("The AI Co-Pilot for Crypto Markets") |
| `HeroMockup.tsx` | Card mockup statis, sudah dilabel "SAMPLE" (jujur, bagus) | Tidak pakai `cardFloat` yang sudah tersedia |
| `TickerStrip.tsx` | Angka hardcoded, **tanpa label SAMPLE** | Kandidat kuat untuk data live — `lib/coingecko.ts`/`lib/binance.ts` sudah ada |
| `About.tsx` | 3 kartu Mission / Vision / Technology | Tidak ada di 9-section sitemap baru — perlu keputusan |
| `Features.tsx` | 6 kartu, copy sudah bagus | Perlu remap ke daftar institusional brief |
| `HowItWorks.tsx` | 4 step bernomor, konten jelas | Tidak ada di sitemap baru — perlu keputusan |
| `AiSignalShowcase.tsx` | Panel sinyal AI, sudah dilabel "SAMPLE · NOT LIVE DATA" | Fondasi bagus untuk section "AI Reasoning" |
| `Pricing.tsx` | **Free vs Pro $29/bulan, hardcoded** | ⚠️ Tidak sinkron dengan produk asli (lihat Ringkasan Eksekutif) |
| `Faq.tsx` + `faqData.ts` | Accordion sudah jalan, sudah client component | Konten perlu direvisi (masih menyebut "Free plan") |
| `LandingFooter.tsx` | 4 kolom, link legal + sosial lengkap | Struktur solid, cuma perlu reskin |
| `shared.tsx` | `Container` (max-w-6xl), `Eyebrow`, `SectionIntro` | Generik, terpisah total dari `components/ui/*` |

**Sistem pendukung yang relevan:**

- **Auth** — bukan komponen `AuthGate` client-side di landing (grep di seluruh repo untuk `AuthGate` nol hasil). Gating sesi jalan di `middleware.ts` (server-side, edge); landing (`/`) memang sengaja **tidak** masuk daftar `PROTECTED_PREFIXES`. Artinya redesign visual landing **tidak berisiko ke logic auth**, selama link CTA tetap konsisten arah ke `/login`.
- **Font & provider global** — seluruh app (termasuk landing) memakai `Inter` + `JetBrains Mono`, didefinisikan sekali di `app/layout.tsx`. `RootLayout` juga membungkus landing dengan `Web3Provider` (wagmi/Reown) — landing ikut menanggung bobot init wallet connector walau pengunjung baru belum butuh itu sama sekali. Ini poin performa (relevan ke requirement "hook 3 detik pertama"), bukan poin visual — dicatat di rencana implementasi §5.
- **Mobile** — dashboard punya `components/mobile/*` terpisah (device-split components, karena datanya padat). Landing **tidak** memakai pola ini, murni Tailwind responsive classes. Ini sudah keputusan yang tepat dan sebaiknya dipertahankan apa adanya.

---

## 2. Pertahankan vs Rombak Total

**Pertahankan strukturnya (reskin, bukan rebuild):**
- `LandingHeader.tsx` — tetap server component, reskin + efek blur-on-scroll
- `LandingFooter.tsx` — layout 4 kolom sudah solid
- `Faq.tsx` / `faqData.ts` — accordion logic sudah benar, tinggal reskin + revisi 2 jawaban
- Routing CTA ke `/login` — tidak diubah, di luar scope Phase 5

**Rombak total (visual, dan sebagian konten):**
- `Hero.tsx` + `HeroMockup.tsx` — full rebuild, ini jantung "hook 3 detik pertama"
- `Pricing.tsx` — rebuild total jadi section ELS Token / AI Energy (bukan reskin — kontennya sendiri sudah tidak akurat, bukan cuma tampilannya)
- `TickerStrip.tsx` — reskin + sambungkan ke data live
- `Features.tsx` — konten di-remap, treatment visual baru
- `AiSignalShowcase.tsx` — diperluas jadi section AI Reasoning penuh

**Perlu keputusanmu (tidak ada slot-nya di 9-section sitemap baru):**
- `About.tsx` dan `HowItWorks.tsx` — rekomendasi default saya: intisari About dipadatkan jadi sub-headline di bawah Hero, HowItWorks dipadatkan jadi strip 3–4 langkah kecil di antara Terminal Preview dan Features. Bukan dihapus, dipadatkan. Koreksi saya kalau salah satunya tetap mau jadi section penuh.

---

## 3. Design System Baru

### Warna

Brief minta `#09090B` / `#111827` / `#151823` + aksen Purple/Blue/Cyan. Sangat dekat dengan token dashboard yang sudah ada ("Phase 2 palette"), tapi tidak identik — dan brief eksplisit: jangan sentuh dashboard dulu. Jadi bukan reuse langsung token lama, juga bukan tulis ulang token lama. **Namespace baru khusus landing**, supaya kedua sisi independen:

```
landing.bg       #09090B    (persis sesuai brief)
landing.surface  #111827    (persis sesuai brief)
landing.card     #151823    (persis sesuai brief)
landing.line     rgba(255,255,255,0.08)   — hairline di atas glass

landing.violet   #7C6AF6    — echo dari --signal-rgb default dashboard (#6D5DF6),
                               ada benang merah brand, bukan ungu generik
landing.blue     #3E7BFA
landing.cyan     #22D3EE
```

Satu catatan rekonsiliasi: dokumen master (Phase 5 Master Implementation) menyebut Gold/Yellow/Orange sebagai warna dominan identitas ElStand, sementara brief landing yang lebih spesifik ini membatasi ke Purple/Blue/Cyan saja dan eksplisit *"❌ Banyak warna."* Saya ikuti yang lebih spesifik. Tapi satu observasi menarik: `globals.css` yang sudah ada ternyata **sudah mencampur violet + amber tipis** di gradient background body (`rgba(110,91,255,0.1)` + `rgba(255,176,32,0.05)`) — jadi benang emas itu sebenarnya sudah ada di identitas ElStand, cuma nyaris tak terlihat. Saya usulkan satu titik aksen emas sangat tipis di elemen signature Hero saja (bukan wash warna) — ini keputusan selera yang saya sisakan buat kamu, lihat Pertanyaan Terbuka.

`amber` (`#F5B942`), `rugpull` (`#A855F7`), `smartmoney` (`#3B82F6`) di dashboard **tidak disentuh** — token landing di atas sengaja didefinisikan terpisah walau angkanya berdekatan, supaya perubahan di satu sisi tidak pernah bocor ke sisi lain.

### Tipografi

Sekarang: `Inter` + `JetBrains Mono` di seluruh app. Untuk dashboard ini tetap benar (netral, cocok terminal data padat) — **tidak diubah**. Untuk landing, Inter-untuk-semuanya bikin ELSTAND terasa seperti template AI-SaaS pada umumnya (dipakai hampir semua produk sejenis).

Rekomendasi 3 peran, bukan 1 font untuk semua:
- **Display (headline besar):** `Bricolage Grotesque` — grotesk berkarakter, bukan geometric-sans template, tersedia via `next/font/google` (konsisten dengan pattern `Inter`/`JetBrains_Mono` yang sudah dipakai — tidak nambah pipeline font baru)
- **Body:** tetap `Inter` — sudah ter-load, cocok untuk "Apple-level simplicity," body copy sebaiknya netral supaya display face yang bicara
- **Data/eyebrow/label:** tetap `JetBrains Mono` — pola `.eyebrow`/`.mono-num` yang sudah ada dipertahankan, ini identitas "terminal" yang sudah established

*(Space Grotesk sengaja tidak saya pilih untuk display — sudah terlalu umum di situs crypto/web3, jadi kurang jadi pembeda.)*

### Glass, Glow, Shadow

Belum ada utility glass di `globals.css` saat ini (`.panel`/`.glow-card` dashboard itu solid/opaque secara sengaja — cocok keterbacaan data padat, tapi salah untuk hero atmospheric). Tambahan baru khusus landing:

```css
.landing-glass {
  background: rgba(21, 24, 35, 0.55); /* landing.card @ 55% */
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset,
              0 20px 60px -20px rgba(0,0,0,0.6);
}
```

Glow mengikuti pola `boxShadow` yang sudah ada (`glow-signal`, `glow-rugpull`, dst.) — tambah `glow-landing-violet`/`glow-landing-cyan` dengan pola sama, bukan sistem baru.

### Motion

Prinsip utama: **reuse dulu, baru bikin baru.**

| Brief minta | Sudah tersedia di codebase |
|---|---|
| "AI scanning animation" | `.scan-sweep` + keyframe `scanline` (sudah dipakai panel "Scanning Market..." dashboard) |
| "floating" | keyframe `cardFloat` / class `.card-float` |
| "loading skeleton" | `.skeleton` + keyframe `shimmer` |
| "typing effect" | `.typing-dots` + keyframe `typingDot` |
| pulse/glow status | keyframe `pulseGlow`, `.live-dot` |
| garis data mengalir | keyframe `dashFlow` / `dashFlowSlow` |

Baru yang perlu ditambah: **scroll reveal** & **parallax** (native Framer Motion — `whileInView`, `useScroll`/`useTransform`, tidak butuh keyframe CSS baru), dan satu keyframe ambient baru untuk drift gradient background hero (`auroraDrift`, sangat lambat, ~20–30 detik/loop).

Semua animasi baru wajib hormat `[data-motion="reduced"]` + `prefers-reduced-motion` yang sudah ada mekanismenya di `globals.css` — tinggal ikut pola yang sudah jalan.

### Elemen Signature (satu titik "wah")

Brief minta banyak elemen 3D sekaligus (cube, node, sphere, hologram, dst.) — kalau semua dipaksa masuk, hero jadi ramai, bukan premium. Saya usulkan **satu** elemen pusat: **"Confluence Core"** — orb cahaya di tengah hero, dengan beberapa thread data tipis (RSI, Whale, Funding, News, Macro — label mono kecil) yang mengalir masuk dan menyatu jadi satu angka Confidence yang berdenyut pelan.

Ini bukan ornamen 3D generik — ini **visualisasi langsung dari cara kerja AI ElStand yang sebenarnya**: fan-in, banyak sinyal → satu verdict, arsitektur yang sama dengan reasoning chain di `NodeDrawer.tsx`. Elemen paling mencolok di halaman jadi benar-benar menjelaskan produknya, bukan cuma dekorasi.

Dua opsi implementasi (lihat Pertanyaan Terbuka):
1. **CSS/SVG murni** — animated SVG path (`dashFlow`/`dashFlowSlow` persis untuk ini) + radial glow + Framer Motion parallax on mouse-move. 0 dependency baru, ringan, konsisten "semua animasi harus ringan" di brief master.
2. **React Three Fiber** — orb benar-benar 3D, bisa rotate, lebih immersive, tapi nambah `three` + `@react-three/fiber` ke bundle (~150–300kb), wajib `next/dynamic` + `ssr:false` + lazy load supaya tidak mengganggu First Contentful Paint.

---

## 4. Sitemap Landing Page Baru

| # | Section (brief) | File rencana | Sumber konten | Status |
|---|---|---|---|---|
| 1 | Hero | `Hero.tsx`, `HeroSignature.tsx` (baru), `TickerStrip.tsx` | Copy baru, CTA "Launch Terminal" / "View Intelligence" | Rombak total |
| 2 | AI Intelligence (6 kartu) | `AiIntelligenceGrid.tsx` (baru, gantikan slot `About.tsx`) | Di-ground ke module AI Core asli (`lib/ai/core/modules/*`: Oracle, Market Intelligence, Technical Analyst, Scanner, Confidence Engine, Narrative, dll.) — bukan copy karangan | Baru |
| 3 | ELVOID AI Terminal Preview | `TerminalPreview.tsx` (baru) | Reuse `GlowCard`, `RadialGauge`, `AnimatedNumber`, `LiveDot` dari `components/ui/*` dalam varian glass, disusun "floating windows" | Baru, reuse primitive existing |
| 4 | AI Reasoning | `AiSignalShowcase.tsx` (expand) | Perluas copy existing ke 8 dimensi: Reason/Risk/Probability/Confidence/Narrative/Technical/Macro/Whale | Rombak total |
| 5 | Features | `Features.tsx` (remap) | Remap ke 9 item institusional brief; tandai jujur data yang sudah live vs belum (pola `.simulated-tag`/"Waiting Source" yang sudah jadi kebiasaan app ini) | Rombak total |
| 6 | ELS Token | `Pricing.tsx` → `TokenSection.tsx` (rename + rebuild) | AI Energy asli dari `lib/energy.ts` (saldo 10, klaim +10/hari, biaya per fitur). Referral & Bug Hunter **belum ada di kode** (sudah dicek, nol hasil grep) | Rombak total |
| 7 | Roadmap | `Roadmap.tsx` (baru) | Ditarik dari histori `CHANGES.md` asli (V1 Dashboard → V2 Intelligence Map → V3 AI Core/Energy/Wallet → Phase 5) — bukan janji kosong | Baru |
| 8 | FAQ | `Faq.tsx` (reskin) | Reskin + revisi 2 jawaban yang masih menyebut "Free plan" | Reskin + revisi konten |
| 9 | Footer | `LandingFooter.tsx` (reskin) | Struktur dipertahankan | Reskin |

`About.tsx` dan `HowItWorks.tsx` tidak jadi section berdiri sendiri (lihat §2) — intisarinya dipadatkan ke section #1 dan #3.

---

## 5. Rencana Implementasi Bertahap (belum dieksekusi)

- **5.1** — Design tokens (`tailwind.config.ts` namespace `landing.*`, `globals.css` utility `.landing-glass` + keyframe baru), font `Bricolage Grotesque` masuk `app/layout.tsx`
- **5.2** — Hero total (termasuk Confluence Core) + TickerStrip live data
- **5.3** — AI Intelligence Grid + Terminal Preview + AI Reasoning (expand AiSignalShowcase)
- **5.4** — Features remap + ELS Token section + Roadmap
- **5.5** — FAQ + Footer reskin, lalu full responsive pass (mobile/tablet) + performance pass (code-split `Web3Provider` keluar dari critical path landing, lazy-load signature element)

Tidak mulai 5.1 sebelum 3 pertanyaan di bawah dijawab — sisanya saya jalan pakai default yang sudah saya tulis di atas (bisa dikoreksi kapan saja, termasuk di tengah jalan).

---

## Keputusan Terkonfirmasi

1. **Aksen emas** — ya, dipakai tipis di elemen signature Hero (lihat `landing.gold` di §3, dipakai sebagai 1-px ring/glow saja, bukan wash).
2. **Confluence Core** — CSS/SVG murni, 0 dependency baru. `three`/`@react-three/fiber` tidak jadi ditambahkan.
3. **Referral & Bug Hunter** — ditandai "Coming Soon" di section ELS Token, bukan launch bareng Phase 5.

---

## Status Implementasi

**Phase 5.1 — Design Tokens: ✅ selesai.** Perubahan (semua aditif, tidak ada satu baris pun kode dashboard yang tersentuh):

- `tailwind.config.ts` — namespace warna `landing.*` (bg/surface/card/line/violet/blue/cyan/gold), `fontFamily.display`, 3 `boxShadow` baru (`glow-landing-violet/cyan/gold`), keyframe + animation `auroraDrift`.
- `app/globals.css` — utility `.landing-glass` (frosted glass surface) dan `.landing-aurora` (ambient gradient wash, sudah termasuk benang emas tipis di titik dengan opacity paling rendah dari 4 gradient). Otomatis ikut aturan `prefers-reduced-motion`/`[data-motion="reduced"]` yang sudah ada — tidak perlu logic baru.
- `app/layout.tsx` — font `Bricolage Grotesque` (Google Fonts, via `next/font/google`, pola sama persis dengan Inter/JetBrains Mono yang sudah ada) di-load sebagai `--font-display`, opt-in lewat class `font-display` — tidak ada komponen existing yang otomatis ikut berubah.

Catatan jujur: sandbox tempat saya kerja tidak punya akses network, jadi belum sempat `next build`/`npm run dev` beneran (sama seperti pola yang sudah biasa muncul di `CHANGES.md` kamu) — sudah dicek manual (brace balance, penempatan, penamaan export `next/font/google`) tapi tetap perlu kamu jalankan build sekali di environment sendiri sebelum push.

**Phase 5.2 — Hero total: ✅ selesai.**

- `components/landing/Hero.tsx` — rewrite total. Layout diubah dari 2-kolom jadi centered-stack (headline besar `font-display` + gradient violet→blue→cyan di kata kunci, subcopy, CTA "Launch Terminal"/"View Intelligence" sesuai brief, lalu Confluence Core besar di bawahnya). Background pakai `bg-landing-bg` + `.landing-aurora`.
- `components/landing/HeroSignature.tsx` — **baru**, ini "Confluence Core": 5 thread data (RSI/Whale/Funding/News/Macro) mengalir ke orb tengah (pakai `dashFlowSlow`/`pulseGlow` yang sudah ada, bukan bikin animasi baru), ring orb violet→cyan→**gold** di ujung (satu-satunya titik emas di seluruh Hero, sesuai keputusan "aksen tipis"), parallax miring ikut posisi jari/mouse (Framer Motion `useSpring`+`useTransform`, redam ke 0 kalau `prefers-reduced-motion`). CSS/SVG murni, 0 dependency baru — sesuai keputusan.
- Sengaja **tidak ada angka confidence/skor** di elemen ini — murni atmospheric/konseptual, supaya tidak pernah bisa disalahartikan sebagai data asli atau data palsu. Angka asli nanti di section AI Reasoning (5.3).
- `components/landing/TickerStrip.tsx` — rewrite total jadi **live data asli** lewat `lib/coingecko.ts` (`getTopMarkets`), bukan angka hardcode lagi. Dibungkus `<Suspense>` di `Hero.tsx` supaya fetch-nya tidak memblokir first paint headline/CTA — kalau API gagal, fallback jujur "Connecting to live market data…" (bukan angka fallback palsu).
- `components/landing/shared.tsx` — tambah `LandingEyebrow` (baru, pakai `landing.violet`, aditif — `Eyebrow` lama dipertahankan apa adanya untuk section yang belum digarap).
- `components/landing/HeroMockup.tsx` — **tidak dihapus**, tapi untuk sementara tidak dipanggil di manapun (`Hero.tsx` sudah tidak import). Kontennya rencana dipakai lagi di section Terminal Preview (5.3).

Catatan jujur (sama seperti 5.1): belum bisa `npm run build` beneran di sandbox ini (tidak ada akses network/`node_modules`). Sudah saya cek manual — brace balance semua file OK, path `@/lib/coingecko` valid (dicek ke `tsconfig.json`), `getTopMarkets`/`CoinMarket` dipakai sesuai signature aslinya (dicek ke `lib/coingecko.ts` dan `lib/types.ts`) — tapi tetap wajib `npm run build` di sisi kamu sebelum push.

**Phase 5.2 — "Final Polish" pass: ✅ selesai.**

Confluence Core di-rebuild total sesuai brief kedua (dokumen "FINAL POLISH") — dari lingkaran+garis jadi "glass sphere AI entity":

- `components/landing/HeroSignature.tsx` — rewrite total. Sphere sekarang berlapis: cast shadow (efek melayang), outer bloom, rim-light conic-gradient yang muter pelan (violet → cyan → **satu lengkungan kecil emas**, sengaja dijaga di bawah 5% dari keliling ring), body dengan inset shadow buat ilusi kelengkungan, specular highlight blur (kesan kaca), inner energy pulse. Sphere melayang (`cardFloat`) + bernapas pelan (`coreBreathe`, keyframe baru) di layer terpisah biar transform-nya nggak tabrakan.
- **Oracle Node** diganti dari 5 (RSI/Whale/Funding/News/Macro) jadi 7 sesuai brief baru: **Macro, Whale, News, Funding, On-chain, Liquidity, Sentiment** — muter perlahan mengelilingi sphere (`orbitSlow`, satu putaran ~90 detik) sebagai satu grup kaku, tapi tiap label text-nya counter-rotate (`orbitSlowReverse`, durasi sama persis) supaya tulisannya tetap tegak walau ikut muter.
- Background jadi lebih "cinematic": aurora (sudah ada) + 2 "floating mesh" blob tambahan yang drift independen di kecepatan beda + noise texture (`.landing-noise`, SVG turbulence inline, 0 asset baru) + ambient motes yang berkedip pelan.
- Tetap CSS/SVG murni, 0 dependency baru — sesuai batasan brief (NO React Three Fiber, NO WebGL).
- Referensi gambar Tenor Protocol yang dikirim: diambil pelajaran soft-dimensional/tactile-3D dan whitespace-nya, **bukan** palet light-mode-nya — ElStand tetap dark sesuai brief awal.

**Cache fix:** `next.config.js` — tambah header `Cache-Control: no-cache` khusus di `/` supaya browser selalu revalidate ke server dulu (bukan langsung pakai cache lama), ini yang bikin build kelihatan "gak berubah" sebelumnya di URL polos.

**Auth fix:** `app/auth/callback/route.ts` — kalau exchange gagal karena `flow_state_already_used` (kode OAuth kepakai 2x), sekarang dicek dulu apakah session udah ada dari percobaan pertama yang sukses — kalau ada, lanjut ke dashboard alih-alih nampilin error mentah. Tombol "Continue with Google" di `app/login/page.tsx` sudah dicek — sudah benar di-disable saat loading, jadi double-tap di halaman yang sama harusnya sudah aman dari dulu.

**Soal "logout sendiri":** sudah ditelusuri `middleware.ts` (refresh token via `getUser()` di setiap request ke route terproteksi) dan `lib/auth/client.ts` (browser client, default persistSession+autoRefreshToken) — keduanya sudah benar, nggak ketemu bug logout-sendiri yang terpisah. Dugaan saya, apa yang kerasa seperti "logout sendiri" itu efek samping dari `flow_state_already_used` yang sekarang sudah diperbaiki. Tolong dicoba lagi dan kabari kalau masih kejadian di luar momen login (misal: lagi asik di dashboard tiba-tiba ke-lempar ke /login) — itu butuh info waktu/pola kejadian buat ditelusuri lebih lanjut.

**Sengaja belum dikerjakan turn ini** (di luar scope "Landing Page" murni, dan supaya auth-related fixes nggak tercampur buru-buru sama kerjaan visual besar): Feature section (glass/gradient-border/floating icon) dan Trust section (partner logo/timeline/metrics) dari brief "final polish" — tetap direncanakan masuk 5.4, bukan dilewatkan.

**Belum dikerjakan (roadmap besar):** 5.3–5.5 (AI Intelligence Grid, Terminal Preview — di sinilah `HeroMockup.tsx` dipakai lagi, AI Reasoning expand, Features remap + Feature/Trust section styling dari brief final-polish, ELS Token, Roadmap, FAQ/Footer reskin, responsive + performance pass).

---

## Update — brief "ELVOID (FINAL)" masuk

Brief baru ini isinya jauh lebih detail per section (8 section penuh) dan memperkenalkan istilah "ElVoid AI" (sudah konsisten sama branding lama, lihat memory). Yang sudah dikerjakan dari brief ini:

- **Oracle Node** di Confluence Core diupdate ke 8 sesuai brief baru: Macro, Whale, News, Funding, On-chain, **DEX, CEX** (ganti dari "Liquidity"), Sentiment.
- **Section 2 — Live Market Preview**: ✅ dibuat baru (`components/landing/LiveMarketPreview.tsx`), 4 kartu, SEMUA data asli:
  - TradingView mini chart BTC/USDT — widget resmi TradingView (embed script, 0 dependency npm baru)
  - Order Book heatmap BTC — **baru**: nambah `getOrderBookDepth()` di `lib/binance.ts` (endpoint public Binance Futures `/depth`, gak butuh API key)
  - Fear & Greed gauge — pakai `lib/alternativeme.ts` yang sudah ada, dirender pakai `RadialGauge` yang sudah ada di `components/ui/`
  - Whale Activity — pakai `lib/alchemy.ts` (`getWhaleTransfers`) yang sudah ada
  - Semua kartu dibungkus `<Suspense>` sendiri-sendiri + fallback jujur "Connecting Oracle…" / "Waiting For Live Data…" (istilah persis dari brief), bukan angka palsu kalau API gagal/API key belum di-set.
- CTA "View Intelligence" di Hero sekarang beneran nyambung ke section ini (`#intelligence`).

**PERTANYAAN PENTING yang belum terjawab — TECH STACK bertabrakan:**

Brief "FINAL POLISH" (sebelumnya) bilang: *"NO React Three Fiber. NO WebGL. NO dependency baru."*
Brief "ELVOID (FINAL)" (ini) bilang tech stack-nya: *"React Three Fiber, ThreeJS, Drei."*

Dua dokumen kamu sendiri bertolak belakang di poin ini. Aku jalan dengan asumsi **tetap CSS/SVG only** (keputusan eksplisit kamu paling awal, dan yang paling murah risikonya) sampai dikoreksi. Kalau maunya beneran pindah ke R3F/Three.js buat Confluence Core + elemen 3D lain, bilang — itu rebuild besar (nambah ~150-300kb+ dependency, butuh didesain ulang dari CSS-illusion jadi geometry asli) jadi lebih baik dikonfirmasi dulu daripada aku tebak.

**Belum dikerjakan dari brief ini:** Section 3 (AI Thinking pipeline), Section 4 (Features dengan floating 3D object per card — nunggu keputusan tech stack di atas), Section 5 (Terminal Preview), Section 6 (AI Signal Preview), Section 7 (Roadmap), Section 8 (Footer polish). Ticker strip juga belum diperluas ke aset makro (S&P/NASDAQ/DXY/Gold/Oil) — ada indikasi `lib/intelligence/sources/` sudah punya sebagian data ini dari `CHANGES.md`, belum diverifikasi detail.

---

## Update — "garap full semuanya"

Keputusan tech stack: **jalan dengan CSS/SVG** (tidak nunggu jawaban lagi — default paling aman, gampang diganti kalau ternyata salah).

Dikerjakan chunk ini:

- **`Pricing.tsx` dihapus**, diganti `TokenSection.tsx` — section "AI Energy" baru, semua angka (saldo awal 10, klaim +10/hari, biaya per fitur) diambil langsung dari `lib/energy.ts`, bukan dikarang. Referral & Bug Hunter ditandai "Coming Soon" (sesuai keputusan sebelumnya).
- **`faqData.ts`** — jawaban "How do I get started?" yang masih nyebut "Free plan" diperbaiki ke bahasa AI Energy.
- Section order di `app/page.tsx` sekarang: Header → Hero → Live Market Preview → About → Features → How It Works → AI Signal → **AI Energy (baru)** → FAQ → Footer.

**Pola kerja mulai sekarang:** karena scope-nya besar (brief 8-section + brief final-polish + rekonsiliasi audit awal), aku jalan dalam beberapa chunk yang masing-masing lengkap & terverifikasi (bukan satu tembakan besar tanpa pengecekan) — tiap chunk tetap di-zip lengkap biar kapan pun dites, keadaannya konsisten. Lanjut ke chunk berikutnya tanpa nunggu konfirmasi kecuali ada keputusan produk yang beneran cuma kamu yang tahu jawabannya.
