ElStand AI — Phase 5 Reboot: Terminal Preview, Features reskin, light/dark toggle
==================================================================================

12 file di update ini. GitHub web nggak bisa upload .zip lalu auto-extract —
ekstrak dulu (file manager HP: tap .zip > Extract), lalu tiap file: kalau
sudah ada di repo, edit (pensil) > select all > paste > Commit; kalau belum
ada, "Add file > Create new file" di folder yang sesuai.

PALING PENTING DULU — 2 file yang DIPAKAI BERSAMA seluruh app (bukan cuma
landing page):

  tailwind.config.ts (di root repo)
  app/globals.css
    - Ini SATU-SATUNYA bagian yang secara teknis "keluar" dari folder
      landing, karena cuma ada satu file config buat seluruh app — nggak
      ada cara nambahin warna baru buat landing tanpa nyentuh file ini.
      TAPI: yang aku ubah cuma isi di dalam objek `landing` (tailwind.config)
      dan nambahin blok CSS baru (bukan ngubah yang lama) di globals.css.
      Nggak ada satupun token yang dashboard/auth/backend pakai (bg, line,
      signal, amber, up, down, rugpull, smartmoney, ink) yang kesentuh atau
      berubah nilainya. Kalau kamu mau double-check sendiri: search "signal"
      atau "ink:" di file lama vs baru, isinya sama persis.
    - GANTI seluruh isi kedua file ini dengan yang di zip.

Sisanya (semua di components/landing/ + app/page.tsx) 100% landing-only,
nggak ada risiko ke backend/auth/dashboard sama sekali:

  app/page.tsx
    - GANTI seluruh isi. <main> sekarang punya class "landing-root" (perlu
      ada ini biar toggle terang/gelap jalan) + render TerminalPreview.

  components/landing/TerminalPreview.tsx   -> FILE BARU
  components/landing/ThemeToggle.tsx       -> FILE BARU
  components/landing/Features.tsx          -> GANTI seluruh isi (reskin, konten 6 fitur tetap sama)
  components/landing/Hero.tsx              -> GANTI seluruh isi (nambah class theme-invariant)
  components/landing/LandingHeader.tsx     -> GANTI seluruh isi (pasang tombol toggle)
  components/landing/TokenSection.tsx      -> GANTI seluruh isi (ink -> landing-ink)
  components/landing/Roadmap.tsx           -> GANTI seluruh isi (ink -> landing-ink)
  components/landing/Security.tsx          -> GANTI seluruh isi (ink -> landing-ink)
  components/landing/VoidCore.tsx          -> sama persis kayak sebelumnya, cuma dikirim ulang biar satu paket lengkap

Soal toggle terang/gelap: Hero (Void Core) dan Terminal Preview SENGAJA
tetap gelap terus walau mode terang dinyalain — alasannya di komentar kode
(theme-invariant class): terminal trading kan emang biasanya gelap, siang
atau malam. Section lain (header, Features, AI Energy, Roadmap, Security,
dan section lama yang belum di-reskin) ikut ganti terang/gelap.

Belum lolos `npm run build` beneran (sandbox nggak ada network buat
install/verify) — semua .ts/.tsx sudah lolos syntax check TypeScript asli,
tapi tetap perhatikan log Vercel setelah push.
