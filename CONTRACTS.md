# Deployed Contracts — BSC Testnet (chainId 97)

Backup reference untuk semua contract address yang dipakai ELSTAND Intelligence / ELVOID PRO.
Kalau perlu redeploy salah satu, update env var terkait DAN baris di tabel ini biar tidak drift.

| Contract              | Address                                      | Digunakan di (env / config) |
|-----------------------|-----------------------------------------------|------------------------------|
| ELS Token             | `0x4AeA3938eb5c5A594410Bf67c2F2107970901a4D` | `WALLET_NETWORK_CONFIG.ELS_CONTRACT`, `lib/payments/config.ts` (`elsTokenAddress`) |
| Testnet Faucet        | `0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82` | Faucet claim flow |
| Reward Distributor    | `0xdF06b4C5a77a9fbFB2400481e159fD0e223db739` | `lib/rewards/*` (swap → verify → claim pipeline) |
| BugBountyEscrow       | `0x305f5450042eD126Aa08e0E2C9740F46B1f3b7DB` | Bug Hunter (Phase 6.6.1) submission/claim flow |
| ELSTestnetSwap        | `0x5EB87767c2861eD345E068bbACB07d73C014751B` | Swap contract |
| ELSTestnetSell        | `0x97A8EE8157C1fe62124c5fBD475b1282cB248D34` | Sell contract |
| ELSTestnetPayment     | `0x576bba3714983B59d5440C8f6Bb7Dd048cf9628b` | `PAYMENT_CONTRACT_ADDRESS` env, `lib/payments/config.ts` (`PAYMENT_CONTRACT_CONFIG.paymentContract`) — ELVOID PRO membership + AI Energy purchases |

## Notes

- Semua di atas adalah **BSC Testnet**, chainId `97`.
- `ELSTestnetPayment` adalah satu-satunya processor untuk kedua produk `ELVOID_PRO_WEEK` / `ELVOID_PRO_MONTH` / `AI_ENERGY_10` — jangan bikin contract baru untuk salah satu produk itu.
- Kalau salah satu contract di-redeploy, pastikan address disinkronkan manual di dua tempat kalau ada duplikasi (contoh: `PAYMENT_CONTRACT_ADDRESS` server-side vs `WALLET_NETWORK_CONFIG` client-side) — ini pola yang sudah disebut di komentar `lib/payments/config.ts`.
- File ini murni dokumentasi/backup. Tidak ada kode yang membaca dari file ini — source of truth tetap env vars / config file masing-masing.
