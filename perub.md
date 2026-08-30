# ELSTAND PREMIUM — Futures Microstructure Intelligence (delta)

Ganti Fear & Greed dengan Funding Rate / Market Order Flow / Order Book Imbalance,
BTC/ETH/BNB/SOL, real Binance Futures data. ELVOID PRO tidak disentuh sama sekali.

## Cara apply (GitHub web UI)

**File yang DIUBAH (buka file di GitHub, edit, replace isinya dengan file di sini):**
1. `lib/binance.ts` — cuma nambah fungsi baru `getFundingRateHistory` (cari `export interface FundingRatePoint` di file delta ini, taruh SEBELUM fungsi `getLongShortRatio` di file lo — copy paste block itu aja kalau gak mau replace seluruh file).
2. `app/elstand-premium/page.tsx` — ganti import `GlobalRiskRegimePanel` → `FuturesMicrostructurePanel`, dan ganti pemanggilannya di JSX (lihat file delta, cuma 2 baris beda).

**File BARU (create file baru di GitHub dengan path & isi persis seperti ini):**
3. `lib/intelligence/premiumMicrostructure.ts`
4. `app/api/premium/microstructure/route.ts`
5. `components/dashboard/premium/futures/AiSummaryIsolated.tsx`
6. `components/dashboard/premium/futures/FundingRateCard.tsx`
7. `components/dashboard/premium/futures/MarketOrderFlowCard.tsx`
8. `components/dashboard/premium/futures/OrderBookImbalanceCard.tsx`
9. `components/dashboard/premium/futures/FuturesMicrostructurePanel.tsx`

## Yang TIDAK berubah (confirmed)
- `lib/intelligence/btcMicrostructure.ts` — untouched (additive adapter dipisah, bukan refactor)
- `lib/intelligence/globalSentiment.ts` — logic sentimen tetap ada, cuma gak dirender lagi di halaman ini
- `app/elvoid-pro/**`, `lib/ai/oracle/**`, `lib/elvoid/**` — ZERO touch, ZERO import
- Auth, payments, rewards, contracts — ZERO touch

## Data sources (real, no fabrication)
- Funding current: `getFundingSnapshot()` (existing, Binance `/fapi/v1/premiumIndex`)
- Funding history: `getFundingRateHistory()` (NEW, Binance `/fapi/v1/fundingRate`) — periode dipetakan ke jumlah settlement (Binance settle 3x/hari), bukan hari kalender persis. 1D≈3 pts, 7D≈21 pts, 1M≈90 pts.
- Order flow (buy/sell taker dominance + historical chart): `getCvdSeries()` (existing, dari `takerBuyBaseVolume` per candle 1h)
- Order book depth/imbalance: `getOrderBookDepth()` (existing, Binance `/fapi/v1/depth`)

Semua single-exchange (Binance Futures) — sesuai koreksi arsitektur lo, gak ada agregasi multi-exchange.

## AI Summary
Statis di semua 3 card — "Connector Offline / ELVOID Intelligence Core integration currently isolated during active development." Gak ada import dari `lib/ai/oracle` atau `lib/elvoid` di file manapun.

## Belum bisa divalidasi di environment ini
Gak ada akses network buat `npm install` / `next build` di sandbox ini, jadi typecheck cuma manual (cross-check tipe field antar file + konvensi className/tailwind token yang udah ada di repo). Disarankan run `npm run build` lokal/CI sebelum deploy buat nangkep typo TS yang mungkin kelewat.

## Belum tervalidasi visual
Responsive check di 1440/1280/1024/430/390/360 belum bisa dilakuin (gak ada dev server jalan di sini) — cek manual pas udah di-deploy ke preview Vercel.
