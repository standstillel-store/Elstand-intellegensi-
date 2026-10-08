# ELVOID — Root-Cause Audit: Failure Pattern → Memory → Qualification → Pre-Entry → REJECT (2026-10-09)

Sumber bukti: source code (HEAD 3e27203) + production Learning DB (read-only).

## Root cause utama
`failure_pattern_candidates` side-blind (identitas = source, symbol, evidenceTag). Grup bisa mencapai MIN_OCCURRENCE_COUNT=5 hanya karena loss LONG + SHORT dijumlahkan, lalu `queryDecisionMemory` (side-agnostik untuk patterns) mengembalikannya ke KEDUA arah, dan `qualify.ts` menjadikan `matchedPatternPresent` saja sebagai CONFLICTED -> pre-entry BLOCKED -> REJECT.

## Evidence (window 2026-09-30..10-08)
- Keputusan: EXECUTE 260 / WAIT 391 / REJECT 189. REJECT pertama 2026-10-02 (sebelumnya 0).
- 189/189 REJECT = qualification CONFLICTED -> PRE_ENTRY BLOCKED via qualificationConflicted. macro/event risk elevated = 0.
- Atribusi CONFLICTED: pattern-only 184 (97.4%), raw-evaluation CURRENT_NEGATIVE_EVIDENCE 5 (2.6%).
- Side (as-of): same-side >=5 negatif = 8 (4.2%); mixed (pattern hanya ada karena pooling) = 158 (83.6%); opposite-only (0 loss same-side) = 23 (12.2%). => 181/189 (95.8%) akibat pooling lintas-side.
- Timing: tiap simbol REJECT pertama muncul beberapa jam setelah negative eval ke-5 (pooled) simbol itu (XRP 10-02, SUI 10-03, BNB/LINK 10-04, ETH 10-05, ... AVAX 10-08).
- Pattern tag non-diskriminatif: HIGH_GRADE ada di 100% evaluation; dominantClassShare=1 dihitung hanya di antara negatif (positif diabaikan).
- Coverage: 625 experience / 116 evaluation (grade B+ -> INSUFFICIENT_EVIDENCE tidak dipersist; by design).

## Evolution
Tidak memengaruhi REJECT: semua tabel evolution_* = 0 baris; constraint_validations 33 baris, 0 VALID (cautionConstraintPresent tidak pernah true); tidak ada import evolution* di jalur decision/qualification/pre-entry.

## Regresi
Jalur pattern->CONFLICTED tidak berubah sejak 8.2.2 (2026-09-01). P0 (09-18) hanya membatasi jalur raw-evaluation. Tidak ada commit pada file terkait antara 09-18 dan 10-08. Kemunculan REJECT = data-driven (hitungan melewati 5), bukan Phase 8.6.7/Evolution. Fix `since` pattern (3e27203) benar tapi bukan penyebab: semua lastObservedAt < 30 hari.

## Fix
- failurePatterns/contracts.ts: `FailurePatternSide`, field opsional `side`.
- failurePatterns/detect.ts: `detectSideScopedFailurePatternCandidates()` (detector & threshold yang sama).
- decisionMemory/retrieve.ts: `scopePatternsToSide()` — bila query punya side, pattern persisted harus re-qualify pada riwayat side itu sendiri. Hanya bisa MENGURANGI match (subset), tidak menurunkan threshold, tidak mengubah qualify/decide, tanpa migrasi DB.
- scripts/phase8/side-aware-pattern-fixtures.ts: 30 test (16 gagal tanpa fix).
Dampak historis: 181 dari 189 REJECT tidak lagi diveto pattern; 8 same-side tetap REJECT.

## Residual risk
1. Pattern same-side tetap bisa menang walau positif same-side >= negatif (mis. ADA LONG 6 neg vs 7 pos) — tag HIGH_GRADE non-diskriminatif. Perlu keputusan kebijakan terpisah (gate dominasi/lift).
2. Pattern persisted/adaptive constraint/causal graph tetap side-blind (observabilitas); hanya jalur keputusan yang side-scoped.
3. Hanya ~19% experience dievaluasi (B+ tidak masuk memory).
4. UNKNOWN-symbol legacy row masih ada (tidak berpengaruh).
5. Tidak bisa `npm run build` di sandbox; tsc filtered: nol error di file yang disentuh.
