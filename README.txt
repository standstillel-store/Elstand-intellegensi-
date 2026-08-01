ElStand AI — Phase 5 Reboot: full current drop (13 file)
===========================================================

Ini paket LENGKAP paling baru — isinya semua file dari drop-drop sebelumnya
(sudah termasuk toggle terang/gelap, Terminal Preview, Features reskin) DITAMBAH
perubahan baru di bawah. Nggak perlu buka zip yang lama lagi, yang ini sudah
final/gabungan semuanya.

CARA PASANG: ekstrak (file manager HP: tap .zip > Extract), lalu tiap file —
kalau sudah ada di repo: edit (pensil) > select all > paste > Commit. Kalau
belum ada (Reveal.tsx, ThemeToggle.tsx, TerminalPreview.tsx): "Add file >
Create new file" di folder yang sesuai.

=== BARU DI DROP INI ===

Soal foto bola hex biru+angka+api yang kamu kirim: nggak aku jadiin file
gambar di project. Itu kemungkinan besar foto stock/hasil AI generator yang
lisensinya nggak jelas — masukin foto orang lain sebagai aset tetap di
produk beneran itu beda risikonya dibanding sekadar liat-liat buat gaya,
karena itu artinya nyebarin ulang karya orang lain. Yang aku lakuin malah
bangun ulang "rasa"-nya pakai kode asli punya kita sendiri:

  components/landing/VoidCore.tsx  -> DIPERBARUI
    - Permukaan void sekarang ada tekstur segi-enam (hex) yang muncul
      samar dari tengah ke pinggir, ngambil dari kesan foto kamu (bola
      isinya panel-panel kecil) tapi versi kode sendiri, bukan foto.
    - Nambah cincin koin kecil (BTC/ETH/SOL/BNB/XRP) — bentuknya lingkaran
      + teks ticker, BUKAN logo resmi masing-masing koin, jadi aman dari
      urusan hak cipta/merek logo.

  components/landing/Reveal.tsx  -> FILE BARU
    - Wrapper animasi scroll (fade + geser naik pas section masuk layar).
      Otomatis nonaktif kalau user set "reduce motion" di HP/browser-nya.
    - Dipasang di: Features, Roadmap, Security, AI Energy (TokenSection).
      Hero & Terminal Preview sengaja nggak dikasih (sudah rame animasinya
      sendiri).

  components/landing/Roadmap.tsx  -> DIPERBARUI (selain Reveal)
    - Ketemu 2 kelas warna yang kelewat pas ganti ke landing-ink kemarin
      (bg-ink-faint harusnya bg-landing-ink-faint) — udah dibetulin,
      kalau kelewat, titik "Later" di roadmap bakal warnanya salah pas
      mode terang.

=== SEMUA FILE DI ZIP INI ===

  tailwind.config.ts, app/globals.css   -> shared, tapi cuma nambah/ubah
    bagian `landing` — dashboard/auth nggak kesentuh nilainya.
  app/page.tsx                          -> <main> punya class landing-root
  components/landing/Hero.tsx           -> theme-invariant (tetap gelap)
  components/landing/VoidCore.tsx       -> hex texture + coin ring baru
  components/landing/TerminalPreview.tsx -> theme-invariant (tetap gelap)
  components/landing/LandingHeader.tsx  -> tombol toggle terang/gelap
  components/landing/ThemeToggle.tsx    -> logic toggle-nya
  components/landing/Reveal.tsx         -> wrapper animasi scroll
  components/landing/Features.tsx       -> reskin + Reveal
  components/landing/Roadmap.tsx        -> reskin + Reveal + fix warna
  components/landing/Security.tsx       -> reskin + Reveal
  components/landing/TokenSection.tsx   -> reskin + Reveal

Semua .ts/.tsx lolos syntax check TypeScript asli. Belum pernah di-`npm run
build` beneran (sandbox nggak ada network) — perhatikan log Vercel abis push.

Belum kesentuh sama sekali: Live Market Preview, About, How It Works, AI
Signal Showcase, FAQ, Footer — masih versi lama.
