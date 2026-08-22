import type { JournalWithSignal, ScanResult } from "./types";

// ---------------------------------------------------------------------------
// Every closed paper trade gets a short structured post-mortem: why it won
// or lost, what (if anything) looked like a mistake going in, and a concrete
// recommendation. Same rule as the rest of ElVoid AI — plain logic over the
// trade's own recorded data (confidence, duration, realized R:R, and the
// scan snapshot from generation time), never an LLM guess.
// ---------------------------------------------------------------------------

export interface TradeReview {
  verdict: string;
  points: string[];
  mistakes: string[];
  recommendations: string[];
}

export function generateTradeReview(entry: JournalWithSignal): TradeReview {
  const points: string[] = [];
  const mistakes: string[] = [];
  const recommendations: string[] = [];
  const signal = entry.signal;
  const isWin = entry.result === "win";
  const isBreakeven = entry.result === "breakeven";

  if (isWin) {
    points.push(`Trade ditutup profit ${entry.profit_percent.toFixed(2)}% dengan realized R:R ${entry.rr.toFixed(2)}.`);
    if (entry.rr >= 2) points.push("R:R yang direalisasikan tergolong sehat (≥2R) — setup seperti ini layak diulang.");
  } else if (!isBreakeven) {
    mistakes.push(`Trade ditutup loss ${entry.profit_percent.toFixed(2)}% (${entry.rr.toFixed(2)}R).`);
  }

  if (signal) {
    if (!isWin && signal.confidence < 55) {
      mistakes.push(`Confidence awal hanya ${signal.confidence}% — sudah tergolong Grade rendah sejak awal, risiko di atas rata-rata.`);
      recommendations.push("Pertimbangkan hanya membuka Market Order untuk sinyal dengan Confidence ≥65% (Grade A/A+ ke atas).");
    }
    if (isWin && signal.confidence >= 70) {
      points.push(`Confidence awal ${signal.confidence}% — sinyal dengan konfirmasi kuat cenderung lebih konsisten menang.`);
    }
  }

  if (entry.duration_minutes !== null) {
    if (!isWin && entry.duration_minutes < 30) {
      mistakes.push("Kena SL dalam waktu kurang dari 30 menit — kemungkinan entry terlalu dekat dengan noise/likuiditas jangka pendek.");
      recommendations.push("Beri jarak SL mengikuti ATR/struktur market, bukan angka bulat, agar tidak mudah kena stop-hunt.");
    }
    if (isWin && entry.duration_minutes > 60 * 24) {
      points.push("Butuh lebih dari 24 jam untuk profit — setup ini cocok untuk gaya swing, bukan scalping cepat.");
    }
  }

  const allScans: ScanResult[] = [...(signal?.scans ?? []), ...(signal?.extra_reasoning ?? [])];
  const winningBias = signal?.side === "LONG" ? "bullish" : "bearish";
  const fired = allScans.filter((s) => s.bias === winningBias && s.weight > 0);
  if (allScans.length) {
    if (!isWin && fired.length <= 3) {
      mistakes.push(`Hanya ${fired.length} dari ${allScans.length} kategori yang searah saat sinyal dibuat — konfirmasi tergolong tipis.`);
      recommendations.push("Tunggu lebih banyak kategori align (idealnya 5+) sebelum entry, terutama untuk setup Grade B/C.");
    }
    if (isWin && fired.length >= 6) {
      points.push(`${fired.length} dari ${allScans.length} kategori searah — konfirmasi kuat ikut berkontribusi pada hasil ini.`);
    }
  }

  if (!mistakes.length && !isWin) {
    mistakes.push("Tidak ada red flag jelas di setup awal — kemungkinan besar ini murni market noise/whipsaw, bukan kesalahan analisa.");
  }
  if (!recommendations.length) {
    recommendations.push(
      isWin
        ? "Pertahankan kriteria entry yang sama untuk setup serupa ke depan."
        : "Evaluasi ulang risk per trade dan hindari overtrading setelah beberapa loss beruntun."
    );
  }

  const verdict = isWin
    ? "Menang — setup dan eksekusi selaras dengan rencana awal."
    : isBreakeven
    ? "Breakeven — posisi ditutup di sekitar entry, tidak untung tidak rugi signifikan."
    : "Kalah — lihat evaluasi di bawah untuk perbaikan ke depan.";

  return { verdict, points, mistakes, recommendations };
}
