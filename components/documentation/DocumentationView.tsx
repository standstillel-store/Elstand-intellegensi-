"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X, ExternalLink, Mail, Github } from "lucide-react";
import { Footer } from "@/components/Footer";
import { FlowDiagram, EcosystemRelationDiagram, SystemIcebergDiagram } from "./diagrams";

// ---------------------------------------------------------------------------
// Nav / TOC
// ---------------------------------------------------------------------------

const NAV: { id: string; label: string }[] = [
  { id: "overview", label: "01 · Overview" },
  { id: "problem", label: "02 · The Problem" },
  { id: "philosophy", label: "03 · Intelligence Philosophy" },
  { id: "ecosystem", label: "04 · Intelligence Ecosystem" },
  { id: "elstand-x-elvoid", label: "05 · ELSTAND × ELVOID" },
  { id: "iceberg", label: "06 · System Iceberg" },
  { id: "architecture", label: "07 · Architecture" },
  { id: "oracle", label: "08 · ELVOID PRO Oracle" },
  { id: "evidence", label: "09 · Evidence System" },
  { id: "decision-trace", label: "10 · Decision Trace" },
  { id: "cognitive-layer", label: "11 · Cognitive Layer" },
  { id: "autonomous-runtime", label: "12 · Autonomous Runtime" },
  { id: "learning", label: "13 · Learning From Outcomes" },
  { id: "self-evolution", label: "14 · Controlled Self-Evolution" },
  { id: "data-sources", label: "15 · Data Sources" },
  { id: "api", label: "16 · API Documentation" },
  { id: "database", label: "17 · Database" },
  { id: "security", label: "18 · Security" },
  { id: "web3", label: "19 · Web3 / BNB Chain" },
  { id: "repo-structure", label: "20 · Repository Structure" },
  { id: "engineering", label: "21 · Engineering Principles" },
  { id: "status", label: "22 · Implementation Status" },
  { id: "changelog", label: "23 · Changelog" },
  { id: "contact", label: "24 · Contact & Resources" },
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

type Status = "IMPLEMENTED" | "EXPERIMENTAL" | "ROADMAP" | "DESIGN PRINCIPLE";

function StatusBadge({ status }: { status: Status }) {
  const style: Record<Status, string> = {
    IMPLEMENTED: "border-up/40 bg-up/10 text-up",
    EXPERIMENTAL: "border-amber/40 bg-amber/10 text-amber",
    ROADMAP: "border-violet-400/40 bg-violet-400/10 text-violet-300",
    "DESIGN PRINCIPLE": "border-line bg-bg-raised text-ink-muted",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style[status]}`}
    >
      {status}
    </span>
  );
}

function Section({
  id,
  number,
  title,
  subtitle,
  children,
}: {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-line pb-10 pt-10 first:pt-0">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-ink-faint">{number}</div>
      <h2 className="mt-1 text-lg font-semibold text-ink sm:text-xl">{title}</h2>
      {subtitle && <p className="mt-1.5 text-xs text-ink-faint">{subtitle}</p>}
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber">
      {children}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-bg-raised px-1 py-0.5 text-[11px] text-ink">{children}</code>;
}

function Table({ head, rows }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="panel overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-faint">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top text-ink-muted">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NOT_VERIFIED = "Belum dapat diverifikasi dari implementasi saat ini.";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DocumentationView() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      {/* Header */}
      <div className="border-b border-line pb-6">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-amber">Documentation</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">ELSTAND Intelligence</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Dokumentasi teknis ekosistem intelligence dan decision-intelligence layer{" "}
          <span className="text-violet-300">ELVOID</span> — dari lapisan yang terlihat di dashboard sampai lapisan
          teknis paling dalam.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
          <a
            href="https://github.com/standstillel-store/Elstand-intellegensi-"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 hover:border-amber/40 hover:text-amber"
          >
            <Github size={13} /> GitHub Repository <ExternalLink size={11} />
          </a>
          <a
            href="mailto:contact@elstand-intellegence.my.id"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 hover:border-amber/40 hover:text-amber"
          >
            <Mail size={13} /> contact@elstand-intellegence.my.id
          </a>
        </div>
      </div>

      {/* Mobile TOC toggle */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:hidden">
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-medium text-ink"
        >
          <span>Daftar Isi</span>
          {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
        {mobileNavOpen && (
          <nav className="mt-2 max-h-[60vh] space-y-0.5 overflow-y-auto pb-2">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                onClick={() => setMobileNavOpen(false)}
                className="block rounded px-2 py-1.5 text-xs text-ink-muted hover:bg-bg-raised hover:text-ink"
              >
                {n.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div className="mt-8 grid gap-8 sm:grid-cols-[200px_1fr]">
        {/* Desktop sidebar */}
        <nav className="hidden sm:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] space-y-0.5 overflow-y-auto pr-2 text-xs">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className="block rounded px-2 py-1.5 text-ink-faint hover:bg-bg-raised hover:text-ink"
              >
                {n.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div>
          <Section id="overview" number="01" title="Overview">
            <p>
              <strong className="font-medium text-amber">ELSTAND Intelligence</strong> adalah ekosistem
              market-intelligence untuk crypto yang mengubah data makro, market, order flow, on-chain, dan berita
              menjadi evidence, reasoning, dan konteks keputusan yang bisa ditelusuri — bukan sekadar chart atau skor
              tanpa alasan di baliknya.
            </p>
            <p>
              <strong className="font-medium text-violet-300">ELVOID</strong> adalah decision-intelligence layer{" "}
              <em>di dalam</em> ELSTAND — bagian yang bertugas mengubah evidence menjadi keputusan trading yang
              graded dan risk-aware. ELVOID bukan keseluruhan produk; ia adalah reasoning core dari platform yang
              juga menangani agregasi data, paper trading, membership, dan lapisan wallet/token on-chain (BSC
              Testnet).
            </p>
            <Table
              head={["", "ELSTAND Intelligence", "ELVOID"]}
              rows={[
                ["Apa itu", "Ecosystem / product surface", "Decision-intelligence layer di dalamnya"],
                [
                  "Cakupan",
                  "Macro, market, order flow, Web3, external data, membership, wallet",
                  "Oracle analysis, scenario/contradiction/arbitration, cognitive layer, evaluasi & learning",
                ],
                [
                  "Output",
                  "Seluruh product surface (dashboard, journal, portfolio, wallet)",
                  "Satu keputusan graded: side, confidence, risk plan",
                ],
              ]}
            />
          </Section>

          <Section id="problem" number="02" title="The Problem">
            <p>Masalah utamanya bukan kekurangan data — justru sebaliknya.</p>
            <FlowDiagram
              direction="vertical"
              steps={[
                { label: "Data terlalu banyak" },
                { label: "Evidence tidak terstruktur" },
                { label: "Konteks terfragmentasi" },
                { label: "Reasoning sulit ditelusuri" },
                { label: "Keputusan terlambat" },
                { label: "Outcome tidak dievaluasi" },
                { label: "Kesalahan berulang" },
              ]}
            />
            <p>
              Rantai kegagalan ini yang coba dipotong ELSTAND — bukan dengan mengejar signal accuracy setinggi
              mungkin, tapi dengan membuat setiap langkah (evidence → reasoning → decision → outcome → evaluation)
              terstruktur dan bisa ditelusuri balik.
            </p>
          </Section>

          <Section id="philosophy" number="03" title="Intelligence Philosophy">
            <FlowDiagram
              steps={[
                { label: "Data" },
                { label: "Evidence" },
                { label: "Intelligence" },
                { label: "Reasoning" },
                { label: "Decision" },
                { label: "Outcome" },
                { label: "Evaluation" },
                { label: "Learning" },
                { label: "Future Reasoning" },
              ]}
            />
            <ul className="space-y-2">
              <li>
                <strong className="font-medium text-ink">Data</strong> — feed mentah dari sumber market, makro,
                on-chain, dan berita.
              </li>
              <li>
                <strong className="font-medium text-ink">Evidence</strong> — data yang dinormalisasi, ditag
                sumbernya, dengan fallback jujur kalau sumber tidak tersedia — bukan nilai placeholder yang
                dikarang.
              </li>
              <li>
                <strong className="font-medium text-ink">Intelligence</strong> — evidence disilangkan untuk mencari
                confluence dan conflict antar timeframe dan sumber.
              </li>
              <li>
                <strong className="font-medium text-ink">Reasoning</strong> — Oracle/Cognitive Layer ELVOID mengubah
                intelligence jadi pembacaan yang graded dan bisa dijelaskan.
              </li>
              <li>
                <strong className="font-medium text-ink">Decision</strong> — side, confidence, risk plan, dan grade —
                bisa ditelusuri kembali ke evidence yang mendasarinya.
              </li>
              <li>
                <strong className="font-medium text-ink">Outcome</strong> — apa yang benar-benar terjadi setelah
                keputusan dieksekusi (paper atau live).
              </li>
              <li>
                <strong className="font-medium text-ink">Evaluation</strong> — apakah outcome cocok dengan ekspektasi
                keputusan itu sendiri.
              </li>
              <li>
                <strong className="font-medium text-ink">Learning</strong> — hasil evaluasi masuk kembali ke
                pembobotan evidence di masa depan (lihat{" "}
                <a href="#status" className="text-amber hover:underline">
                  status implementasi
                </a>
                ).
              </li>
            </ul>
          </Section>

          <Section id="ecosystem" number="04" title="ELSTAND Intelligence Ecosystem">
            <p>Komponen yang benar-benar ada di repository, masing-masing menyumbang evidence ke ELVOID:</p>
            <Table
              head={["Komponen", "Tujuan", "Input", "Output"]}
              rows={[
                [
                  "Macro Context",
                  "Konteks regime market secara luas",
                  "FRED (DXY, M2), Fear & Greed, economic calendar",
                  "Tag bias/konteks makro",
                ],
                [
                  "ELVOID Quant",
                  "Konteks harga, volume, dan derivatif",
                  "CoinGecko, Binance (spot/futures), GeckoTerminal",
                  "Input confluence, evidence kondisi market",
                ],
                [
                  "Order Flow",
                  "Pembacaan flow gaya footprint/CVD",
                  "Binance klines, order book, funding",
                  "Evidence bias flow",
                ],
                [
                  "Intelligence Map",
                  "Agregasi cross-source",
                  "Semua sumber di atas",
                  "Permukaan evidence terpadu untuk ELVOID",
                ],
                [
                  "External Intelligence",
                  "Berita dan sentimen",
                  "NewsAPI.org",
                  "Tag sentimen berita, flag rugpull \"negative press\"",
                ],
                [
                  "Web3 Utility",
                  "Aktivitas on-chain",
                  "Alchemy (whale transfer), DefiLlama (stablecoin supply)",
                  "Evidence whale/liquidity",
                ],
                [
                  "ELVOID Pro",
                  "Decision-intelligence layer",
                  "Semua evidence di atas",
                  "Keputusan trading graded",
                ],
                [
                  "Evidence Ledger / Methodology",
                  "Transparansi metodologi & histori",
                  "—",
                  "Halaman /methodology, /ai-journal",
                ],
              ]}
            />
          </Section>

          <Section id="elstand-x-elvoid" number="05" title="ELSTAND × ELVOID">
            <EcosystemRelationDiagram />
          </Section>

          <Section id="iceberg" number="06" title="System Iceberg" subtitle="UI hanyalah permukaan sistem">
            <SystemIcebergDiagram />
          </Section>

          <Section id="architecture" number="07" title="Architecture">
            <FlowDiagram
              direction="vertical"
              steps={[
                { label: "External Sources (market/makro/on-chain/news)" },
                { label: "Data / Cache Layer" },
                { label: "Evidence Normalization" },
                { label: "Intelligence Layer (confluence, order flow, macro/market/external)" },
                { label: "ELVOID Oracle", tone: "violet" },
                { label: "Cognitive Layer", tone: "violet" },
                { label: "Decision (grade, confidence, risk plan)" },
                { label: "Execution (paper / live Binance)" },
                { label: "Outcome" },
                { label: "Evaluation / Learning (Learning DB terisolasi)" },
                { label: "Future Reasoning" },
              ]}
            />
            <p>
              Desain database dual/triple-Supabase: <strong className="text-ink">Main Supabase</strong> (auth, user,
              journal, wallet, membership), <strong className="text-ink">Market Data Supabase</strong> (project
              terisolasi khusus data market), dan <strong className="text-ink">ELVOID Learning Database</strong>{" "}
              (proyeksi <Code>decision_experiences</Code> yang terisolasi, tanpa foreign key lintas-project). Detail
              lebih lanjut di{" "}
              <a href="#database" className="text-amber hover:underline">
                bagian Database
              </a>
              .
            </p>
          </Section>

          <Section id="oracle" number="08" title="ELVOID PRO Oracle">
            <p>
              ELVOID adalah <strong className="text-ink">deterministic pipeline</strong>, bukan satu panggilan LLM
              yang dibungkus prompt. Alurnya: context assembly → evidence → analisis multi-timeframe (MTF) →
              confluence + contradiction detection → skenario &amp; risk analysis → arbitrase → keputusan final.
            </p>
            <Callout>
              LLM <strong>bukan</strong> sumber utama keputusan. Ada satu LLM narrative pass opsional di paling
              akhir (Phase 7.9) yang mengubah keputusan yang sudah dihitung menjadi penjelasan bahasa natural — LLM
              tidak boleh mengarang evidence maupun menentukan keputusan itu sendiri.
            </Callout>
            <p>
              Endpoint aktual: <Code>GET /api/elvoid-pro/oracle</Code> — menjalankan pipeline Oracle → Cognitive
              untuk satu symbol/timeframe dan mengembalikan <Code>OracleAssessment</Code> yang graded beserta
              ringkasan cognitive. Insight tambahan tersedia lewat <Code>GET /api/elvoid-pro/insights</Code>.
            </p>
            <p>
              Dokumentasi mendalam stage-by-stage (Phase 7.5–8.2.9) ada di{" "}
              <Code>docs/ELVOID_COGNITIVE_LAYER.md</Code> pada repository.
            </p>
          </Section>

          <Section id="evidence" number="09" title="Evidence System">
            <ul className="space-y-2">
              <li>— Evidence dinormalisasi dan ditag sumbernya (source provenance).</li>
              <li>— Setiap evidence membawa supporting factors (confluence yang mendukung) dan contradicting factors (konflik yang terdeteksi).</li>
              <li>— Uncertainty/risk direpresentasikan sebagai level (LOW/MEDIUM/HIGH) — bukan angka yang dikarang seolah presisi.</li>
              <li>— Confluence dihitung lintas sumber dan timeframe, bukan dari satu sinyal tunggal.</li>
            </ul>
            <Callout>
              No fabricated data — kalau sebuah source tidak tersedia, sistem merepresentasikan state
              unavailable/degraded secara jujur, bukan mengarang nilai pengganti.
            </Callout>
          </Section>

          <Section id="decision-trace" number="10" title="Decision Trace">
            <FlowDiagram
              steps={[
                { label: "Evidence" },
                { label: "Factors" },
                { label: "Conflict" },
                { label: "Risk" },
                { label: "Decision" },
                { label: "Outcome" },
              ]}
            />
            <p>
              Setiap keputusan ELVOID bisa ditelusuri balik ke evidence yang membentuknya. Ini bukan klaim
              marketing — Cognitive Conflict Resolution (Phase 8.0.4) secara eksplisit dibangun untuk menjawab
              &ldquo;seberapa koheren reasoning ini saat ini&rdquo;, dan setiap hipotesis yang dihasilkan Cognitive
              Layer (8.0.3) membawa level uncertainty, bukan skor numerik yang dibuat terlihat presisi.
            </p>
            <p>
              Lapisan trace di repository berjalan append-only (satu baris per cycle attempt, termasuk siklus tanpa
              assessment, dicatat apa adanya) — bukan snapshot yang di-overwrite.
            </p>
          </Section>

          <Section id="cognitive-layer" number="11" title="Cognitive Layer">
            <p>
              ELVOID Cognitive Layer melakukan observation → reasoning → hypothesis → uncertainty → conflict →
              decision trace.
            </p>
            <Callout>
              Cognitive Layer bersifat <strong>downstream dan read-only</strong> terhadap keputusan kanonik Oracle —
              ia mereframe dan cross-check keputusan tersebut, tidak pernah meng-override atau menduplikasinya
              sebagai decision engine kedua.
            </Callout>
            <p>
              Cognitive Layer juga tidak pernah mengarang data kalau sebuah sumber hilang — ia melaporkan state{" "}
              <Code>degraded</Code>/<Code>unavailable</Code> secara jujur.
            </p>
          </Section>

          <Section id="autonomous-runtime" number="12" title="Autonomous Runtime">
            <p>
              Runtime otonom menjalankan pipeline Oracle → Cognitive → Decision per symbol watchlist tanpa aksi
              user, dipicu oleh Vercel cron dan heartbeat GitHub Actions setiap 15 menit, dijaga lock agar batch
              tidak overlap.
            </p>
            <ul className="space-y-2">
              <li>
                <strong className="text-ink">Read-only status</strong>: <Code>GET /api/elvoid-pro/autonomous/status</Code> membaca snapshot autonomous-runtime terbaru; <Code>GET /api/elvoid-pro/autonomous/snapshots</Code> membaca histori snapshot.
              </li>
              <li>
                <strong className="text-ink">Execution</strong>: <Code>POST /api/elvoid-pro/autonomous/tick</Code> menjalankan satu siklus; <Code>POST /api/elvoid-pro/execute-signal</Code> mengeksekusi sinyal menjadi order.
              </li>
              <li>
                Failure isolation: kegagalan di satu langkah learning-refresh menghentikan run itu tanpa menghapus
                snapshot sukses sebelumnya (lihat bagian Learning).
              </li>
            </ul>
          </Section>

          <Section id="learning" number="13" title="Learning From Outcomes">
            <FlowDiagram
              direction="vertical"
              steps={[
                { label: "Decision" },
                { label: "Outcome (Learning DB terisolasi)" },
                { label: "Decision Evaluation" },
                { label: "Failure Pattern Detection (min. 5 kejadian)" },
                { label: "Adaptive Constraint Generation" },
                { label: "Learning Validation" },
                { label: "Future Reasoning" },
              ]}
            />
            <p>
              <StatusBadge status="IMPLEMENTED" /> — rantai ini wired end-to-end ke autonomous runtime, dijalankan
              oleh <Code>lib/ai/autonomousRuntime/learningRefresh.ts</Code> yang menyusun tiga fungsi recompute
              secara berurutan di bawah lock yang sama dengan batch trading. Kegagalan di satu langkah menghentikan
              run tanpa menghapus snapshot sukses sebelumnya.
            </p>
            <p>
              Audit tambahan terhadap kode (di luar README) menemukan bahwa{" "}
              <strong className="text-ink">decision memory retrieval</strong> (
              <Code>queryDecisionMemory()</Code>) benar-benar live — dipanggil setiap cycle di orchestrator{" "}
              <em>sebelum</em> tahap qualification/decision, dan terbukti mengubah behavior secara konkret: sinyal
              memory negatif membuat status keputusan menjadi <Code>CONFLICTED</Code>, yang langsung berujung REJECT
              — never menguatkan EXECUTE, selalu fail-safe ke arah WAIT/REJECT. Untuk bagian ini status yang lebih
              akurat adalah <StatusBadge status="IMPLEMENTED" /> ketimbang label &ldquo;experimental&rdquo; yang
              lebih umum di README, meski scope penuh lifecycle autonomous-learning di luar retrieval ini tetap{" "}
              <StatusBadge status="EXPERIMENTAL" />.
            </p>
            <Callout>
              Ini adalah controlled system, bukan &ldquo;AI belajar sendiri tanpa batas&rdquo;. Adaptive constraint
              yang dihasilkan sifatnya advisory (menaikkan kehati-hatian/membutuhkan konfirmasi lebih kuat) — tidak
              ada jalur yang memblokir eksekusi otonom secara langsung dari constraint ini.
            </Callout>
          </Section>

          <Section id="self-evolution" number="14" title="Controlled Self-Evolution">
            <StatusBadge status="ROADMAP" />
            <FlowDiagram
              steps={[
                { label: "Monitor" },
                { label: "Detect" },
                { label: "Decide" },
                { label: "Propose" },
                { label: "Test" },
                { label: "Protect" },
                { label: "Approve" },
              ]}
            />
            <p>
              Fase ini (Phase 8.6 pada roadmap internal) belum aktif di sistem yang berjalan. Prinsip desainnya:
              tidak ada direct self-modification tanpa validation, regression testing, dan human approval. Fitur ini
              belum menghasilkan efek apa pun pada keputusan trading yang berjalan hari ini.
            </p>
          </Section>

          <Section id="data-sources" number="15" title="Data Sources">
            <Table
              head={["Source", "Digunakan untuk", "API key"]}
              rows={[
                ["CoinGecko", "Data market, harga, market cap, perubahan 1h/24h/7d", "Tidak"],
                ["Binance Futures", "Funding rate, open interest, OHLCV candle", "Tidak"],
                ["Alternative.me", "Fear & Greed index", "Tidak"],
                ["GeckoTerminal", "Volume DEX, liquidity & FDV (ETH, BSC, Solana, Base, Arbitrum)", "Tidak"],
                ["DefiLlama", "Overview supply stablecoin", "Tidak"],
                ["FRED (St. Louis Fed)", "DXY (proxy Broad USD Index) & M2 money supply", "Ya — gratis"],
                ["Alchemy", "Feed whale transfer (watchlist ERC-20 terkurasi)", "Ya — free tier"],
                ["NewsAPI.org", "Feed berita, sentimen, flag \"negative press\" rugpull", "Ya — free tier"],
                ["ForexFactory (calendar feed)", "Economic calendar (event FOMC/CPI/NFP)", "Tidak"],
                ["Binance Spot/Futures (Testnet/Live)", "Live trading — saldo, posisi, order, eksekusi", "Ya — free testnet key"],
              ]}
            />
            <p>Sumber yang terputus atau salah konfigurasi gagal secara jujur — platform menampilkan fallback state, bukan nilai placeholder yang dikarang.</p>
          </Section>

          <Section id="api" number="16" title="API Documentation" subtitle="Representatif, bukan exhaustive — lihat app/api/ di repository">
            <Table
              head={["Method", "Path", "Tujuan"]}
              rows={[
                ["GET", "/api/elvoid-pro/oracle", "Jalankan pipeline Oracle → Cognitive untuk satu symbol"],
                ["GET", "/api/elvoid-pro/autonomous/status", "Baca snapshot autonomous-runtime terbaru"],
                ["GET", "/api/elvoid-pro/autonomous/snapshots", "Baca histori snapshot autonomous"],
                ["GET / POST", "/api/elvoid-pro/autonomous/tick", "Baca status tick / jalankan satu siklus autonomous"],
                ["POST", "/api/elvoid-pro/execute-signal", "Eksekusi sinyal menjadi order"],
                ["GET", "/api/elvoid-pro/insights", "Baca insight tambahan Oracle"],
                ["GET", "/api/elvoid-pro/runtime-events", "Baca event runtime"],
                ["GET / POST", "/api/ai-signals", "Baca / buat sinyal AI"],
                ["POST", "/api/ai-signals/scan", "Scan watchlist untuk kandidat sinyal"],
                ["POST", "/api/binance/order", "Tempatkan order live/testnet"],
                ["DELETE", "/api/binance/order", "Batalkan order"],
                ["GET", "/api/binance/risk/calculate", "Hitung eksposur risiko — ini POST di implementasi aktual, menerima payload perhitungan"],
                ["GET", "/api/ai-performance/cognitive", "Baca state/performa cognitive layer"],
                ["POST", "/api/bug-hunter/report", "Submit laporan bug ke BugBountyEscrow"],
                ["GET", "/api/leaderboard", "Baca leaderboard"],
              ]}
            />
            <p>
              Method dan path di atas dikutip langsung dari handler route (<Code>app/api/**/route.ts</Code>) di
              repository, bukan tebakan. Schema request/response detail {NOT_VERIFIED.toLowerCase()} untuk setiap
              endpoint di luar tabel ini — {NOT_VERIFIED}
            </p>
          </Section>

          <Section id="database" number="17" title="Database">
            <p>Arsitektur database berlapis, sesuai temuan di README dan struktur folder <Code>supabase/</Code>:</p>
            <Table
              head={["Database", "Isi", "Isolasi"]}
              rows={[
                ["Main Supabase", "Auth, user, journal, wallet, membership", "Project utama"],
                ["Market Data Supabase", "Data market yang di-cache", "Project terpisah, terisolasi"],
                ["ELVOID Learning Database", "Proyeksi decision_experiences dan rantai learning", "Terisolasi, tanpa foreign key lintas-project"],
              ]}
            />
            <p>
              Row Level Security (RLS) diaktifkan pada tabel sensitif — detail lebih lanjut di bagian{" "}
              <a href="#security" className="text-amber hover:underline">
                Security
              </a>
              .
            </p>
          </Section>

          <Section id="security" number="18" title="Security">
            <ul className="space-y-2">
              <li>
                <StatusBadge status="IMPLEMENTED" /> Autentikasi via Supabase Auth (Google OAuth), ditegakkan di{" "}
                <Code>middleware.ts</Code> untuk semua route terproteksi (<Code>/dashboard</Code>, <Code>/trading</Code>, <Code>/portfolio</Code>, <Code>/settings</Code>, dll) — request tanpa autentikasi diarahkan ke <Code>/login</Code>.
              </li>
              <li>
                <StatusBadge status="IMPLEMENTED" /> Row Level Security aktif di tabel sensitif (<Code>ai_signals</Code>, <Code>ai_journal</Code>, <Code>paper_wallet</Code>, <Code>bn_credentials</Code>, <Code>bn_orders_log</Code>, <Code>users</Code>, <Code>profiles</Code>, <Code>ai_token</Code>, dan lainnya) — nol public policy, akses butuh service role key sisi server.
              </li>
              <li>
                <StatusBadge status="IMPLEMENTED" /> Exchange API key dibaca dari env var server-only secara default; alternatif tersimpan di database dienkripsi AES-256-GCM (<Code>ENCRYPTION_KEY</Code>, server-only).
              </li>
              <li>
                <StatusBadge status="IMPLEMENTED" /> Keamanan order: setiap order punya client order ID unik, cooldown double-submit singkat, dan lock in-process per symbol.
              </li>
              <li>
                <StatusBadge status="DESIGN PRINCIPLE" /> No fabricated data — source yang gagal menampilkan fallback jujur, diterapkan konsisten di seluruh codebase, bukan hanya di Cognitive Layer.
              </li>
            </ul>
            <Callout>ELSTAND tidak pernah mengklaim &ldquo;100% secure&rdquo;. Kontrak yang dideploy semuanya BSC Testnet — belum mainnet.</Callout>
          </Section>

          <Section id="web3" number="19" title="Web3 / BNB Chain">
            <p>
              ELSTAND memakai <strong className="text-ink">BNB Smart Chain Testnet</strong> (chainId 97) untuk
              ekonomi token dan gating membership on-chain.
            </p>
            <Callout>
              BSC Testnet contract ≠ Binance Spot/Futures API. Satu adalah blockchain tempat token ELS berada; yang
              lain adalah exchange API untuk eksekusi order. Keduanya sistem yang terpisah.
            </Callout>
            <Table
              head={["Contract", "Address", "Network", "Purpose"]}
              rows={[
                ["ELS Token", <Code key="1">0x4AeA3938eb5c5A594410Bf67c2F2107970901a4D</Code>, "BSC Testnet (97)", "Core ERC-20, fixed supply 1.000.000.000"],
                ["Testnet Faucet", <Code key="2">0x3a0664300EA06Ba7c01EDC9951c1b04BE9101C82</Code>, "BSC Testnet (97)", "Alur klaim faucet"],
                ["Reward Distributor", <Code key="3">0xdF06b4C5a77a9fbFB2400481e159fD0e223db739</Code>, "BSC Testnet (97)", "Pipeline swap → verify → claim reward"],
                ["BugBountyEscrow", <Code key="4">0x305f5450042eD126Aa08e0E2C9740F46B1f3b7DB</Code>, "BSC Testnet (97)", "Submission/claim Bug Hunter"],
                ["ELSTestnetSwap", <Code key="5">0x5EB87767c2861eD345E068bbACB07d73C014751B</Code>, "BSC Testnet (97)", "Contract swap"],
                ["ELSTestnetSell", <Code key="6">0x97A8EE8157C1fe62124c5fBD475b1282cB248D34</Code>, "BSC Testnet (97)", "Contract sell (ELS → tBNB)"],
                ["ELSTestnetPayment", <Code key="7">0x576bba3714983B59d5440C8f6Bb7Dd048cf9628b</Code>, "BSC Testnet (97)", "Satu-satunya processor membership PRO + AI Energy"],
              ]}
            />
            <p>
              Address di atas dikutip verbatim dari <Code>CONTRACTS.md</Code> pada repository. Detail lengkap ada di
              file tersebut.
            </p>
          </Section>

          <Section id="repo-structure" number="20" title="Repository Structure">
            <div className="panel overflow-x-auto p-4">
              <pre className="text-[11px] leading-relaxed text-ink-muted">{`app/                 → routes & UI (App Router)
app/api/             → seluruh API route handler
components/          → komponen UI React
lib/                 → business logic
lib/ai/              → Oracle, Cognitive Layer, learning chain, autonomous runtime
lib/elvoid/          → helper/hook khusus ELVOID
docs/                → dokumentasi teknis mendalam (mis. ELVOID_COGNITIVE_LAYER.md)
supabase/            → schema & migration (main DB, learning DB terisolasi)
contracts/           → source smart contract
CONTRACTS.md         → daftar address contract terdeploy
README.md            → overview & status implementasi
CHANGES.md           → riwayat perubahan per fase`}</pre>
            </div>
          </Section>

          <Section id="engineering" number="21" title="Engineering Principles">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                "No fabricated data",
                "Evidence-first reasoning",
                "Traceability",
                "Risk-aware decision",
                "Explicit uncertainty",
                "Separation of concerns",
                "Deterministic decision pipeline",
                "LLM sebagai reasoning/narrative layer",
                "Controlled learning",
                "Failure isolation",
                "Human approval untuk evolusi high-risk",
              ].map((p) => (
                <li key={p} className="rounded-md border border-line bg-bg-raised px-3 py-2 text-xs text-ink-muted">
                  {p}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="status" number="22" title="Implementation Status">
            <Table
              head={["Komponen", "Status"]}
              rows={[
                ["Agregasi data Macro / Market / Order Flow / Web3 / External", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["ELVOID PRO Oracle (confluence, scenario, contradiction, arbitration, risk)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Cognitive Layer (observation, hypothesis, conflict state)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision Outcome Capture + Learning DB terisolasi", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision Evaluation / Failure Pattern / Adaptive Constraint / Learning Validation", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Autonomous background runtime (cron + heartbeat)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Paper trading (journal, statistik)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Live trading via Binance Spot/Futures", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Membership on-chain (ELVOID PRO / ELSTAND PREMIUM) via ELSTestnetPayment", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["ELS token, faucet, reward distributor, Bug Hunter escrow", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["LLM narrative pass di atas keputusan final", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision memory retrieval (queryDecisionMemory, live per-cycle)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Autonomous-learning lifecycle penuh (di luar retrieval)", <StatusBadge key="s" status="EXPERIMENTAL" />],
                ["Controlled Self-Evolution (Phase 8.6)", <StatusBadge key="s" status="ROADMAP" />],
                ["Mainnet deployment", <StatusBadge key="s" status="ROADMAP" />],
                ["Cross-chain di luar BNB Smart Chain", <StatusBadge key="s" status="ROADMAP" />],
              ]}
            />
            <p className="text-xs text-ink-faint">
              Status disusun dari README.md dan audit langsung terhadap source code — dua baris terakhir sebelum
              roadmap disesuaikan dari label README berdasarkan bukti kode konkret (lihat bagian{" "}
              <a href="#learning" className="text-amber hover:underline">
                Learning From Outcomes
              </a>
              ).
            </p>
          </Section>

          <Section id="changelog" number="23" title="Changelog">
            <p>
              <Code>CHANGES.md</Code> pada repository adalah canonical changelog/evolution record — riwayat
              perubahan per fase, termasuk seluruh Phase 8.3.x Cognitive Brain.
            </p>
            <ul className="space-y-1.5">
              <li>
                → <Code>CHANGES.md</Code> — riwayat perubahan lengkap per fase
              </li>
              <li>
                → <Code>docs/ELVOID_COGNITIVE_LAYER.md</Code> — deep-dive pipeline Oracle/Cognitive/Learning
              </li>
              <li>
                → <Code>CONTRACTS.md</Code> — daftar address contract terdeploy
              </li>
            </ul>
          </Section>

          <Section id="contact" number="24" title="Contact & Resources">
            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href="mailto:contact@elstand-intellegence.my.id"
                className="panel flex items-center gap-2.5 p-3 hover:border-amber/40"
              >
                <Mail size={15} className="text-amber" />
                <span className="text-xs text-ink-muted">contact@elstand-intellegence.my.id</span>
              </a>
              <a
                href="https://github.com/standstillel-store/Elstand-intellegensi-"
                target="_blank"
                rel="noopener noreferrer"
                className="panel flex items-center gap-2.5 p-3 hover:border-amber/40"
              >
                <Github size={15} className="text-amber" />
                <span className="text-xs text-ink-muted">GitHub Repository</span>
                <ExternalLink size={12} className="ml-auto text-ink-faint" />
              </a>
              <div className="panel p-3 text-xs text-ink-muted">
                Website:{" "}
                <a href="https://www.elstand-intellegence.my.id" className="text-amber hover:underline">
                  elstand-intellegence.my.id
                </a>
              </div>
              <Link href="/methodology" className="panel flex items-center p-3 text-xs text-ink-muted hover:border-amber/40">
                Methodology →
              </Link>
            </div>
          </Section>
        </div>
      </div>

      <Footer />
    </main>
  );
}
