ElStand AI — Phase 5 Reboot (Hero + ElVoid Core) + previous chunk (Header fix, Roadmap, Security)
=================================================================================================

GitHub web tidak bisa upload .zip lalu auto-extract ke struktur folder repo —
zip ini cuma cara paling ringkas buat bawa semua file dalam satu unduhan.
Setelah diekstrak (file manager HP kebanyakan bisa: tap file .zip > Extract),
tinggal buka tiap file, copy isinya, lalu di GitHub web:

  - File yang PATH-nya sudah ada di repo -> buka file itu > edit (pensil) >
    select all > paste > Commit.
  - File yang belum ada (VoidCore.tsx, Roadmap.tsx, Security.tsx) -> di
    folder components/landing/ pilih "Add file > Create new file", ketik
    nama filenya, paste isinya, Commit.

Isi folder ini (path relatif terhadap root repo kamu):

  app/page.tsx
    - GANTI seluruh isi. Nambahin import + render Roadmap & Security.

  components/landing/Hero.tsx
    - GANTI seluruh isi. Reboot penuh: copy baru + VoidCore, bukan reskin.

  components/landing/VoidCore.tsx
    - FILE BARU. Signature element pengganti HeroSignature.tsx (biarin
      HeroSignature.tsx nganggur di repo, sama kayak HeroMockup.tsx).

  components/landing/LandingHeader.tsx
    - GANTI seluruh isi. Aksen gold, fix link "Pricing" -> "AI Energy",
      efek blur saat scroll.

  components/landing/TokenSection.tsx
    - GANTI seluruh isi. Cuma nambah id="ai-energy" + border atas.

  components/landing/Roadmap.tsx
    - FILE BARU. Belum kena reboot warna gold — masih aksen violet lama.

  components/landing/Security.tsx
    - FILE BARU. Sama kayak Roadmap.tsx, masih aksen violet lama.

Semua sudah lolos syntax check (TypeScript compiler beneran, bukan itung
kurung manual) tapi belum pernah di-`npm run build` beneran karena sandbox
ini nggak ada akses network buat install dependency — jadi tetap perhatikan
log build di Vercel setelah push, siapa tahu ada error import/typo yang
lolos dari syntax check tapi kena di type-check penuh.

Dashboard tidak disentuh sama sekali di update ini.
