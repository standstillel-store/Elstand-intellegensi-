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
  { id: "philosophy", label: "03 · Intelligence Philosophy & Loop" },
  { id: "ecosystem", label: "04 · Intelligence Ecosystem" },
  { id: "elstand-x-elvoid", label: "05 · ELSTAND × ELVOID" },
  { id: "iceberg", label: "06 · System Iceberg" },
  { id: "architecture", label: "07 · System Architecture & Data Flow" },
  { id: "oracle", label: "08 · ELVOID PRO Oracle Pipeline" },
  { id: "evidence", label: "09 · Evidence, Confluence, Conflict & Risk" },
  { id: "cognitive-layer", label: "10 · Cognitive Layer" },
  { id: "decision-trace", label: "11 · Decision Trace" },
  { id: "autonomous-runtime", label: "12 · Autonomous Runtime" },
  { id: "outcome-evaluation", label: "13 · Outcome Evaluation" },
  { id: "learning", label: "14 · Learning Loop" },
  { id: "self-evolution", label: "15 · Controlled Self-Evolution" },
  { id: "data-sources", label: "16 · Data Sources" },
  { id: "database", label: "17 · Database Architecture" },
  { id: "api", label: "18 · API Documentation" },
  { id: "binance", label: "19 · Binance Integration" },
  { id: "web3", label: "20 · Web3 / BNB Chain" },
  { id: "security", label: "21 · Security & Data Integrity" },
  { id: "failure-modes", label: "22 · Failure & Degraded-State Behavior" },
  { id: "repo-structure", label: "23 · Repository Structure" },
  { id: "engineering", label: "24 · Engineering Principles" },
  { id: "status", label: "25 · Implementation Status" },
  { id: "glossary", label: "26 · Glossary" },
  { id: "changelog", label: "27 · Changelog & Resources" },
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

function SubHead({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">{children}</h3>;
}

function Callout({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "violet" }) {
  const cls =
    tone === "violet"
      ? "border-violet-400/30 bg-violet-400/5 text-violet-200"
      : "border-amber/30 bg-amber/5 text-amber";
  return <div className={`rounded-lg border px-4 py-3 text-xs leading-relaxed ${cls}`}>{children}</div>;
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
          <span className="text-violet-300">ELVOID</span> — dari konsep paling atas sampai implementasi teknis
          paling dalam.
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

      <div className="mt-8 grid gap-8 sm:grid-cols-[220px_1fr]">
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
              <em>di dalam</em> ELSTAND — bagian yang mengubah evidence menjadi keputusan trading yang graded dan
              risk-aware. ELVOID bukan keseluruhan produk; ia adalah reasoning core dari platform yang juga
              menangani agregasi data, paper &amp; live trading, membership, dan lapisan wallet/token on-chain (BSC
              Testnet).
            </p>
            <Table
              head={["", "ELSTAND Intelligence", "ELVOID"]}
              rows={[
                ["Apa itu", "Ecosystem / product surface", "Decision-intelligence layer di dalamnya"],
                [
                  "Cakupan",
                  "Macro, market, order flow, Web3, external data, membership, wallet",
                  "Oracle pipeline, cognitive layer, evaluasi &amp; learning",
                ],
                [
                  "Output",
                  "Seluruh product surface (dashboard, journal, portfolio, wallet)",
                  "Satu OracleAssessment: side, grade, confidence, risk plan",
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
              terstruktur dan bisa ditelusuri balik ke sumbernya.
            </p>
          </Section>

          <Section id="philosophy" number="03" title="Intelligence Philosophy & Loop">
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
            <p>
              Ini adalah <strong className="text-ink">Intelligence Loop</strong> ELSTAND — satu siklus tertutup, bukan
              pipeline satu arah. Outcome dari sebuah keputusan mengalir balik lewat evaluation menjadi input untuk
              reasoning berikutnya (lihat{" "}
              <a href="#learning" className="text-amber hover:underline">
                Learning Loop
              </a>
              ).
            </p>
            <ul className="space-y-2">
              <li>
                <strong className="font-medium text-ink">Data → Evidence</strong> — data mentah dinormalisasi,
                ditag sumbernya, dengan fallback jujur kalau sumber tidak tersedia (weight 0, bukan nilai dikarang).
              </li>
              <li>
                <strong className="font-medium text-ink">Evidence → Intelligence</strong> — evidence disilangkan
                lintas sumber &amp; timeframe untuk mencari confluence dan mendeteksi conflict.
              </li>
              <li>
                <strong className="font-medium text-ink">Intelligence → Reasoning</strong> — Oracle dan Cognitive
                Layer ELVOID mengubah intelligence jadi pembacaan graded yang bisa dijelaskan.
              </li>
              <li>
                <strong className="font-medium text-ink">Reasoning → Decision</strong> — side, grade, confidence,
                risk plan — satu keputusan kanonik, bisa ditelusuri balik ke evidence yang membentuknya.
              </li>
              <li>
                <strong className="font-medium text-ink">Decision → Outcome → Evaluation → Learning</strong> — apa
                yang benar-benar terjadi dinilai objektif, lalu dikembalikan sebagai konteks untuk reasoning masa
                depan.
              </li>
            </ul>
          </Section>

          <Section id="ecosystem" number="04" title="Intelligence Ecosystem">
            <p>Komponen yang benar-benar ada di repository, masing-masing menyumbang evidence ke ELVOID:</p>
            <Table
              head={["Komponen", "Tujuan", "Input", "Output"]}
              rows={[
                ["Macro Context", "Konteks regime market secara luas", "FRED (DXY, M2), Fear & Greed, economic calendar", "Tag bias/konteks makro"],
                ["ELVOID Quant", "Konteks harga, volume, derivatif", "CoinGecko, Binance (spot/futures), GeckoTerminal", "Input confluence"],
                ["Order Flow", "Pembacaan flow gaya footprint/CVD", "Binance klines, order book, funding", "Evidence bias flow"],
                ["Intelligence Map", "Agregasi cross-source", "Semua sumber di atas", "Permukaan evidence terpadu untuk ELVOID"],
                ["External Intelligence", "Berita dan sentimen", "NewsAPI.org", "Tag sentimen, flag rugpull \"negative press\""],
                ["Web3 Utility", "Aktivitas on-chain", "Alchemy (whale transfer), DefiLlama (stablecoin supply)", "Evidence whale/liquidity"],
                ["ELVOID Pro", "Decision-intelligence layer", "Semua evidence di atas", "OracleAssessment graded"],
                ["Evidence Ledger / Methodology", "Transparansi metodologi & histori", "—", "Halaman /methodology, /ai-journal"],
              ]}
            />
          </Section>

          <Section id="elstand-x-elvoid" number="05" title="ELSTAND × ELVOID">
            <EcosystemRelationDiagram />
            <p>
              ELVOID tidak punya akses langsung ke user, wallet, atau membership — semua itu domain ELSTAND. ELVOID
              hanya menerima evidence yang sudah dinormalisasi dan mengembalikan satu <Code>OracleAssessment</Code>{" "}
              per permintaan. Batas ini konsisten di seluruh kode: modul Oracle/Cognitive tidak pernah mengimpor
              logic trading/wallet, dan sebaliknya.
            </p>
          </Section>

          <Section id="iceberg" number="06" title="System Iceberg" subtitle="UI hanyalah permukaan sistem">
            <SystemIcebergDiagram />
          </Section>

          <Section id="architecture" number="07" title="System Architecture & Data Flow">
            <FlowDiagram
              direction="vertical"
              steps={[
                { label: "External Sources (market/makro/on-chain/news)" },
                { label: "Data / Cache Layer" },
                { label: "Evidence Normalization" },
                { label: "Confluence & Order Flow (Intelligence Layer)" },
                { label: "ELVOID Oracle Pipeline", tone: "violet" },
                { label: "Cognitive Layer", tone: "violet" },
                { label: "Decision (grade, confidence, risk plan)" },
                { label: "Execution (paper / live Binance)" },
                { label: "Outcome Capture" },
                { label: "Evaluation → Learning (Learning DB terisolasi)" },
                { label: "Future Reasoning" },
              ]}
            />
            <SubHead>Tiga project Supabase yang terpisah</SubHead>
            <p>
              Arsitektur data dipisah jadi tiga project Supabase independen, masing-masing dengan env var
              kredensialnya sendiri — bukan satu database besar yang dibagi-bagi secara logis:
            </p>
            <Table
              head={["Project", "Env var", "Isi"]}
              rows={[
                ["Main", <Code key="1">NEXT_PUBLIC_SUPABASE_URL</Code>, "Auth, user, journal, wallet, membership, ai_signals, bn_* (Binance audit trail)"],
                ["Market Data", <Code key="2">DATA_SUPABASE_URL</Code>, "Data market ter-cache (whale-tracker-schema.sql, data-engine-schema.sql)"],
                ["ELVOID Learning", <Code key="3">ELVOID_LEARNING_SUPABASE_URL</Code>, "decision_experiences, failure patterns, adaptive constraints, autonomous runtime lock"],
              ]}
            />
            <p>
              Alasan pemisahan: masing-masing project bisa di-scale dan direset secara independen. Learning DB
              secara eksplisit tidak punya foreign key SQL ke Main DB — <Code>source_signal_id</Code> hanyalah
              referensi logis ke <Code>ai_signals.id</Code>, karena foreign key lintas-project memang tidak mungkin
              di Postgres/Supabase.
            </p>
          </Section>

          <Section id="oracle" number="08" title="ELVOID PRO Oracle Pipeline">
            <p>
              Oracle adalah <strong className="text-ink">deterministic pipeline</strong> bertahap, bukan satu
              panggilan LLM. Setiap tahap adalah modul terpisah di <Code>lib/ai/oracle/</Code>, dan sebagian besar
              secara eksplisit didokumentasikan sebagai <Code>PURE / READ-ONLY</Code> — tidak fetch baru, tidak
              scoring baru, tidak mengubah keputusan yang sudah dibuat tahap sebelumnya.
            </p>
            <FlowDiagram
              direction="vertical"
              steps={[
                { label: "Evidence Adapter — normalisasi ConfluenceResult (Phase 7.1)" },
                { label: "Confluence Engine — evidence LONG/SHORT per sumber (Phase 2)" },
                { label: "Grading — SATU-SATUNYA otoritas side/grade/confidence/riskStatus (Phase 3)" },
                { label: "Contradiction Classifier — reklasifikasi konflik yang sudah ada (Phase 7.6)" },
                { label: "Scenario Engine — PRIMARY/ALTERNATIVE, tidak menentukan arah ulang (Phase 7.5)" },
                { label: "Arbitration — anotasi kekuatan konteks, tidak pernah override grade (Phase 7.7)" },
                { label: "Risk Plan — entry/SL/TP dari S/R + ATR nyata" },
                { label: "Execute — tulis ai_signals, panggil paperTrader.executeSignal() (Phase 5)" },
              ]}
            />
            <SubHead>Otoritas tunggal</SubHead>
            <p>
              <Code>gradeConfluence()</Code> (grading.ts) adalah satu-satunya sumber kebenaran untuk{" "}
              <Code>side</Code>/<Code>grade</Code>/<Code>confidence</Code>/<Code>riskStatus</Code>. Contradiction,
              Scenario, dan Arbitration semuanya membaca hasil ini dan menambah konteks — tidak satu pun boleh
              menghitung ulang atau menimpanya. Ini prinsip arsitektural yang ditegakkan di komentar kode setiap
              modul, bukan konvensi yang tidak tertulis.
            </p>
            <Callout>
              LLM <strong>bukan</strong> sumber keputusan. Ada satu LLM narrative pass opsional di paling akhir
              (Phase 7.9) yang mengubah keputusan yang sudah dihitung menjadi penjelasan bahasa natural — LLM tidak
              membaca ulang evidence maupun mengubah side/grade.
            </Callout>
            <p>
              Grade final: <Code>NO_TRADE | B+ | A | A+</Code>. <Code>A+</Code> membutuhkan dominant score ≥ 35 dan
              minimal 3 cluster evidence independen — dan otomatis diturunkan (ceiling) kalau risk plan tidak
              tersedia (S/R protective level tidak ditemukan dari histori candle).
            </p>
            <p>
              Endpoint: <Code>GET /api/elvoid-pro/oracle</Code> untuk satu symbol/timeframe, <Code>GET /api/elvoid-pro/insights</Code> untuk insight tambahan.
            </p>
          </Section>

          <Section id="evidence" number="09" title="Evidence, Confluence, Conflict & Risk">
            <SubHead>Evidence &amp; Confluence</SubHead>
            <ul className="space-y-2">
              <li>Setiap angka pada satu evidence factor berasal dari sesuatu yang benar-benar terukur di <Code>OracleContext</Code> — tidak ada bobot hardcode karena "sinyal seharusnya ada".</li>
              <li>Sumber yang tidak tersedia (<Code>quality: &quot;unavailable&quot;</Code>) selalu diberi weight 0 — tidak pernah diperlakukan sebagai vote netral atau default ke satu sisi.</li>
              <li>Data proxy (mis. Liquidity Volume Map, atau Microstructure untuk symbol selain BTC) weight-nya dibatasi <Code>PROXY_WEIGHT_CAP = 0.5</Code> — proxy read tidak pernah bisa mengalahkan skor orderbook/data real.</li>
              <li>Confluence dihitung lintas sumber independen — grade <Code>A+</Code> butuh minimal 3 cluster, bukan satu sinyal kuat sendirian.</li>
            </ul>
            <SubHead>Contradiction (Conflict)</SubHead>
            <p>
              Contradiction Classifier (Phase 7.6) adalah lapisan <strong className="text-ink">reklasifikasi</strong>,
              bukan detector baru — setiap entri di laporannya menelusuri balik ke deskripsi yang sudah dihasilkan
              modul lain (confluence.contradictions, mtf.ts, scenario.primary.opposingEvidence). Setiap kontradiksi
              ditandai genuineness-nya:
            </p>
            <Table
              head={["Genuineness", "Arti"]}
              rows={[
                [<Code key="1">GENUINE</Code>, "Kontradiksi nyata antar-evidence berkualitas real"],
                [<Code key="2">DATA_GAP</Code>, "Setidaknya satu sisi evidence tidak berkualitas real — kontradiksi bisa jadi artefak data yang hilang"],
                [<Code key="3">SAME_CLUSTER</Code>, "Kedua sisi berasal dari cluster evidence yang sama — bukan sinyal independen yang berlawanan"],
              ]}
            />
            <SubHead>Risk Plan</SubHead>
            <p>
              Risk plan (entry/SL/TP/R:R) memakai metodologi yang sama dengan AI Signal biasa — SL dari protective
              S/R terdekat + buffer ATR, TP dari opposing S/R terdekat atau fallback R-multiple tetap — dihitung dari
              candle history nyata. Kalau histori candle tidak cukup untuk menemukan level protective sama sekali,
              risk plan mengembalikan <Code>null</Code> dan grading otomatis menandai <Code>riskStatus: &quot;unavailable&quot;</Code>, menolak grade <Code>A+</Code>.
            </p>
          </Section>

          <Section id="cognitive-layer" number="10" title="Cognitive Layer">
            <p>
              ELVOID Cognitive Layer (Phase 8.0.x) melakukan observation → hypothesis → conflict resolution di atas
              output Oracle yang sudah final.
            </p>
            <Callout>
              Meta-resolution layer, <strong>bukan decision engine kedua</strong>. Pertanyaannya adalah &ldquo;seberapa
              koheren interpretasi sistem saat ini&rdquo; — bukan &ldquo;arah mana yang benar&rdquo;. Tidak ada field
              side/direction/BUY/SELL/execute/reject di output modul ini sama sekali.
            </Callout>
            <ul className="space-y-2">
              <li>
                <strong className="text-ink">Observation</strong> (8.0.1) — strictly downstream/read-only: tidak
                pernah memutasi input, tidak pernah menghitung ulang hasil Phase 2-7.x, tidak melakukan
                network/database/LLM call apa pun. Input yang sama menghasilkan output yang sama persis (kecuali
                timestamp).
              </li>
              <li>
                <strong className="text-ink">Hypothesis Engine</strong> (8.0.3) — thin reframing layer di atas
                Scenario/Contradiction/Arbitration yang sudah dihitung; tidak pernah menurunkan ulang supporting/
                opposing evidence atau confidence sendiri. Bahkan tidak mengimpor <Code>OracleAssessment</Code>{" "}
                secara langsung.
              </li>
              <li>
                <strong className="text-ink">Conflict Resolution</strong> (8.0.4) — pure reuse atas{" "}
                <Code>contradictions.hasUnresolvedGenuineContradiction</Code> dan{" "}
                <Code>arbitration.alignment</Code>; tidak pernah memindai ulang evidence mentah atau membuat sistem
                confidence keduanya.
              </li>
            </ul>
            <p>
              Kalau sebuah sumber evidence hilang, Cognitive Layer melaporkan state <Code>degraded</Code>/
              <Code>unavailable</Code> apa adanya — tidak pernah mengarang untuk menutupi celah data.
            </p>
          </Section>

          <Section id="decision-trace" number="11" title="Decision Trace">
            <FlowDiagram steps={[{ label: "Evidence" }, { label: "Factors" }, { label: "Conflict" }, { label: "Risk" }, { label: "Decision" }, { label: "Outcome" }]} />
            <p>
              Decision Traceability (Phase 8.2.1) saat ini adalah{" "}
              <strong className="text-ink">infrastruktur murni</strong> — bentuk tabel dan fungsi persist, mengikuti
              batas &ldquo;capture only, decide nothing&rdquo; yang sama seperti Phase 8.1.0. Fase ini belum
              memperkenalkan logic autonomous decision, wiring eksekusi, route, atau cron sendiri.
            </p>
            <Callout>
              Hard boundary: tabel trace ini <strong>khusus ELVOID Pro</strong>. Tipe sumbernya (<Code>TraceSource</Code>)
              adalah literal single-value tersendiri, secara struktural belum bisa menerima baris{" "}
              <Code>AI_SIGNAL</Code> biasa — perluasan ke sana adalah fase terpisah di masa depan yang butuh
              persetujuan sendiri, bukan bagian dari fase ini.
            </Callout>
          </Section>

          <Section id="autonomous-runtime" number="12" title="Autonomous Runtime">
            <p>
              Orchestrator (Phase 8.2.9) menjalankan siklus Oracle → Cognitive → Decision per symbol watchlist tanpa
              aksi user, dipicu Vercel cron + heartbeat GitHub Actions setiap 15 menit. Orkestrator ini{" "}
              <strong className="text-ink">tidak menghitung apa pun sendiri</strong> — setiap fungsi
              scoring/grading/qualification/decision yang dipanggilnya adalah modul Phase 7/8.0-8.2.8 yang sudah ada
              dan tidak diubah.
            </p>
            <Table
              head={["File", "Peran"]}
              rows={[
                ["orchestrator.ts", "Urutan langkah per siklus: evidence → validasi pre-entry → keputusan"],
                ["batch.ts", "Menjalankan siklus untuk seluruh watchlist symbol"],
                ["lock.ts", "Advisory lock single-row (Learning DB) — mencegah dua invocation overlap"],
                ["dedup.ts", "Mencegah duplikasi keputusan/snapshot untuk symbol yang sama"],
                ["evaluationBacklog.ts", "Antrean evaluasi outcome yang tertunda"],
                ["learningRefresh.ts", "Sequencing tiga fungsi recompute learning setelah batch (lihat Learning Loop)"],
              ]}
            />
            <ul className="space-y-2">
              <li>
                <strong className="text-ink">Read-only status</strong>: <Code>GET /api/elvoid-pro/autonomous/status</Code> (snapshot terbaru), <Code>GET /api/elvoid-pro/autonomous/snapshots</Code> (histori).
              </li>
              <li>
                <strong className="text-ink">Execution</strong>: <Code>POST /api/elvoid-pro/autonomous/tick</Code> (satu siklus), <Code>POST /api/elvoid-pro/execute-signal</Code> (eksekusi sinyal jadi order).
              </li>
            </ul>
          </Section>

          <Section id="outcome-evaluation" number="13" title="Outcome Evaluation">
            <p>
              Decision Evaluation Engine (Phase 8.1.1) adalah fungsi <strong className="text-ink">pure &amp;
              deterministic</strong> — nol call database/network/LLM/fetch, nol pembangkitan timestamp sendiri, nol
              randomness. Modulnya bahkan tidak mengimpor apa pun dari <Code>lib/ai/oracle/*</Code>,{" "}
              <Code>lib/ai/cognitive/*</Code>, <Code>lib/elvoid/*</Code>, atau modul eksekusi trading manapun —
              hanya bergantung pada satu <Code>DecisionExperienceRecord</Code> yang sudah dibekukan.
            </p>
            <Callout>
              Modul ini <strong>tidak</strong> menyimpulkan kausalitas (&ldquo;X menyebabkan kerugian&rdquo;) dan
              tidak melihat lintas beberapa keputusan sekaligus — ia mengevaluasi satu{" "}
              <Code>DecisionExperienceRecord</Code> pada satu waktu, hanya dari field yang sudah dibekukan Phase
              8.1.0 saat insert.
            </Callout>
          </Section>

          <Section id="learning" number="14" title="Learning Loop">
            <FlowDiagram
              direction="vertical"
              steps={[
                { label: "Decision Experience (frozen at insert, Learning DB terisolasi)" },
                { label: "Decision Evaluation — per-record, pure" },
                { label: "Failure Pattern Detection — frekuensi murni, min. 5 kejadian, spread >1 hari" },
                { label: "Adaptive Constraint Generation — tidak pernah melonggarkan ambang" },
                { label: "Learning Validation" },
                { label: "Decision Memory Retrieval — pure filter, dipakai live per-cycle" },
                { label: "Future Reasoning" },
              ]}
            />
            <p>
              <StatusBadge status="IMPLEMENTED" /> Seluruh rantai ini di-sequence oleh{" "}
              <Code>lib/ai/autonomousRuntime/learningRefresh.ts</Code> dalam urutan tetap:{" "}
              <Code>recomputeFailurePatterns()</Code> → <Code>recomputeAdaptiveConstraints()</Code> →{" "}
              <Code>recomputeConstraintValidations()</Code>, dijaga lock yang sama dengan batch trading. Tidak ada
              logic deteksi/generation/validasi baru di file ini — ia hanya memanggil tiga fungsi yang sudah ada,
              berurutan. Kegagalan di satu langkah menghentikan run tanpa menghapus snapshot sukses sebelumnya.
            </p>
            <ul className="space-y-2">
              <li>
                <strong className="text-ink">Failure Pattern Detection</strong> — melaporkan{" "}
                <em>frequency observation murni</em>: menghitung berapa kali satu evidence tag muncul bersamaan
                dengan evaluasi outcome negatif, untuk satu source, di lebih dari satu hari kalender. Minimal{" "}
                <Code>MIN_OCCURRENCE_COUNT = 5</Code> kejadian sebelum sebuah pattern dianggap kandidat. Tidak pernah
                menyatakan kausalitas.
              </li>
              <li>
                <strong className="text-ink">Adaptive Constraint</strong> — dibangun dari kandidat failure pattern
                yang sudah lolos ambang di atas; tidak pernah menuliskan ulang atau melonggarkan{" "}
                <Code>MIN_OCCURRENCE_COUNT</Code>/aturan spread temporal. Constraint bersifat advisory (menaikkan
                kehati-hatian) — tidak ada jalur yang langsung memblokir eksekusi otonom dari constraint ini.
              </li>
              <li>
                <strong className="text-ink">Decision Memory Retrieval</strong> — <Code>retrieveDecisionMemory()</Code>{" "}
                adalah fungsi pure (nol DB/network/LLM/randomness), dipanggil live setiap cycle di orchestrator{" "}
                <em>sebelum</em> tahap qualification/decision. Sinyal memory negatif membuat status keputusan{" "}
                <Code>CONFLICTED</Code>, yang langsung berujung REJECT — tidak pernah menguatkan EXECUTE, selalu
                fail-safe ke arah WAIT/REJECT. Untuk sub-komponen ini status paling akurat adalah{" "}
                <StatusBadge status="IMPLEMENTED" />, bukan &ldquo;experimental&rdquo; secara umum seperti di
                README — sementara scope penuh <em>autonomous-learning lifecycle</em> di luar retrieval ini tetap{" "}
                <StatusBadge status="EXPERIMENTAL" />.
              </li>
            </ul>
          </Section>

          <Section id="self-evolution" number="15" title="Controlled Self-Evolution">
            <StatusBadge status="ROADMAP" />
            <FlowDiagram steps={[{ label: "Monitor" }, { label: "Detect" }, { label: "Decide" }, { label: "Propose" }, { label: "Test" }, { label: "Protect" }, { label: "Approve" }]} />
            <p>
              Fase ini (Phase 8.6 pada roadmap internal) belum aktif di sistem yang berjalan dan belum menghasilkan
              efek apa pun pada keputusan trading hari ini. Prinsip desainnya: tidak ada direct self-modification
              tanpa validation, regression testing, dan human approval.
            </p>
          </Section>

          <Section id="data-sources" number="16" title="Data Sources">
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
          </Section>

          <Section id="database" number="17" title="Database Architecture">
            <p>Detail penuh sudah dibahas di{" "}
              <a href="#architecture" className="text-amber hover:underline">System Architecture &amp; Data Flow</a>. Ringkasan tabel penting:</p>
            <Table
              head={["Tabel", "Project", "Catatan"]}
              rows={[
                ["ai_signals", "Main", "Baris dibagi AI Signal biasa dan ELVOID_PRO_ORACLE (source terlabel), globally unique ID"],
                ["ai_journal, paper_wallet, ai_statistics", "Main", "Journal paper trading, statistik, wallet simulasi"],
                ["bn_credentials, bn_orders_log, bn_position_meta, bn_emergency_stop", "Main", "Audit trail &amp; kredensial Binance — lihat bagian Binance Integration"],
                ["decision_experiences", "ELVOID Learning", "Snapshot keputusan, frozen at insert, source_signal_id = referensi logis (tanpa FK) ke ai_signals.id"],
                ["autonomous_runtime_lock", "ELVOID Learning", "Advisory lock single-row untuk mencegah batch/learning-refresh overlap"],
              ]}
            />
            <p>
              RLS (Row Level Security) diaktifkan pada seluruh tabel sensitif dengan{" "}
              <strong className="text-ink">nol public policy</strong> — semua akses lewat service-role key sisi
              server. Pola ini konsisten di Main DB maupun Learning DB.
            </p>
          </Section>

          <Section id="api" number="18" title="API Documentation" subtitle="Representatif, bukan exhaustive — lihat app/api/ di repository">
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
                ["GET", "/api/ai-performance/cognitive", "Baca state/performa cognitive layer"],
                ["POST", "/api/bug-hunter/report", "Submit laporan bug ke BugBountyEscrow"],
                ["GET", "/api/leaderboard", "Baca leaderboard"],
              ]}
            />
            <p>
              Method dan path dikutip langsung dari handler route (<Code>app/api/**/route.ts</Code>). Schema
              request/response detail di luar tabel ini: {NOT_VERIFIED}
            </p>
          </Section>

          <Section id="binance" number="19" title="Binance Integration">
            <p>
              Seluruh integrasi Binance hidup di <Code>lib/binance/</Code> — terpisah dari Oracle/Cognitive Layer
              secara arsitektural (Oracle tidak pernah mengeksekusi order sendiri; eksekusi lewat{" "}
              <Code>lib/elvoid/paperTrader.ts</Code> atau modul di bawah ini).
            </p>
            <Table
              head={["File", "Peran"]}
              rows={[
                ["spotClient.ts / futuresClient.ts", "REST client untuk Binance Spot &amp; Futures"],
                ["signer.ts / restClient.ts", "Signing request HMAC &amp; wrapper REST bersama"],
                ["credentials.ts / crypto.ts", "Penyimpanan &amp; dekripsi API key exchange (AES-256-GCM)"],
                ["tradingEngine.ts / autoTrader.ts", "Engine eksekusi order &amp; auto-trader berbasis sinyal"],
                ["riskManager.ts / orderGuard.ts", "Validasi risk sebelum order, guard idempotency/cooldown"],
                ["exitConditions.ts", "Logic exit posisi (SL/TP/manual)"],
                ["newsGate.ts", "Gate berbasis berita sebelum entry"],
                ["signalBridge.ts", "Jembatan dari sinyal AI/Oracle ke order Binance"],
                ["marketData.ts / wsUrl.ts", "Data market &amp; koneksi WebSocket Binance"],
                ["db.ts", "Persistensi audit trail (bn_orders_log, bn_position_meta, dll)"],
              ]}
            />
            <Callout>
              <Code>db.ts</Code> secara eksplisit graceful-degrade: setiap fungsi mengecek koneksi Supabase dulu
              sebelum menulis — Trading Engine tetap bisa menempatkan order nyata di Binance meski Supabase tidak
              terkonfigurasi, hanya saja sistem &ldquo;tidak ingat kenapa&rdquo; antar-request, dan AI Auto Trader
              melaporkan dirinya unconfigured sampai Supabase disiapkan.
            </Callout>
            <p>
              Keamanan order: setiap order punya client order ID unik, cooldown singkat mencegah double-submit, dan
              lock in-process per symbol (<Code>orderGuard.ts</Code>).
            </p>
          </Section>

          <Section id="web3" number="20" title="Web3 / BNB Chain">
            <p>
              ELSTAND memakai <strong className="text-ink">BNB Smart Chain Testnet</strong> (chainId 97) untuk
              ekonomi token dan gating membership on-chain.
            </p>
            <Callout>
              BSC Testnet contract ≠ Binance Spot/Futures API. Satu adalah blockchain tempat token ELS berada; yang
              lain adalah exchange API untuk eksekusi order. Keduanya sistem yang terpisah sepenuhnya.
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
              Address di atas dikutip verbatim dari <Code>CONTRACTS.md</Code> pada repository. Belum ada deployment
              mainnet — status mainnet: <StatusBadge status="ROADMAP" />.
            </p>
          </Section>

          <Section id="security" number="21" title="Security & Data Integrity">
            <ul className="space-y-2">
              <li><StatusBadge status="IMPLEMENTED" /> Autentikasi Supabase Auth (Google OAuth), ditegakkan di <Code>middleware.ts</Code> untuk seluruh route terproteksi — request tanpa autentikasi diarahkan ke <Code>/login</Code>.</li>
              <li><StatusBadge status="IMPLEMENTED" /> Row Level Security aktif di tabel sensitif, nol public policy — akses butuh service role key sisi server.</li>
              <li><StatusBadge status="IMPLEMENTED" /> Exchange API key: env var server-only secara default, atau tersimpan di database terenkripsi AES-256-GCM (<Code>ENCRYPTION_KEY</Code>, server-only).</li>
              <li><StatusBadge status="IMPLEMENTED" /> Keamanan order: client order ID unik, cooldown double-submit, lock in-process per symbol.</li>
              <li><StatusBadge status="DESIGN PRINCIPLE" /> No fabricated data — diterapkan konsisten dari Oracle sampai Binance client: sumber gagal → fallback jujur, bukan nilai dikarang.</li>
              <li><StatusBadge status="DESIGN PRINCIPLE" /> Fail-safe over fail-strong — lock/memory/evidence yang tidak bisa diverifikasi selalu diarahkan ke jalur paling aman (lihat bagian selanjutnya), bukan diasumsikan aman.</li>
            </ul>
            <Callout>ELSTAND tidak pernah mengklaim &ldquo;100% secure&rdquo;. Seluruh contract yang dideploy masih BSC Testnet.</Callout>
          </Section>

          <Section id="failure-modes" number="22" title="Failure & Degraded-State Behavior">
            <p>
              Prinsip konsisten di seluruh codebase: kalau sesuatu tidak bisa diverifikasi, sistem jujur soal itu —
              bukan mengarang nilai pengganti. Beberapa contoh konkret dari kode aktual:
            </p>
            <Table
              head={["Situasi", "Perilaku"]}
              rows={[
                ["Evidence source tidak tersedia", "Weight 0, quality \"unavailable\" — tidak pernah jadi vote netral atau default ke satu sisi (confluence.ts)"],
                ["Risk plan tak bisa dihitung (histori candle kurang)", "Fungsi mengembalikan null → riskStatus \"unavailable\" → grade A+ ditolak otomatis"],
                ["Autonomous runtime lock tidak bisa diverifikasi", "Fails OPEN — dianggap \"belum dikonfigurasi, lanjutkan\", bukan \"blokir semua selamanya\" (lock.ts)"],
                ["Supabase (main atau learning) tidak terkonfigurasi", "Setiap fungsi persistensi mengecek koneksi dulu — Binance tetap bisa eksekusi order, hanya kehilangan memory/audit trail antar-request"],
                ["Sinyal Decision Memory negatif", "Status keputusan CONFLICTED → REJECT — tidak pernah menguatkan EXECUTE, selalu fail-safe ke WAIT/REJECT"],
                ["Learning refresh gagal di satu langkah", "Run dihentikan; snapshot sukses sebelumnya tidak dihapus"],
                ["Kontradiksi yang melibatkan data non-real", "Ditandai genuineness DATA_GAP, bukan otomatis dianggap GENUINE"],
              ]}
            />
          </Section>

          <Section id="repo-structure" number="23" title="Repository Structure">
            <div className="panel overflow-x-auto p-4">
              <pre className="text-[11px] leading-relaxed text-ink-muted">{`app/                    → routes & UI (App Router)
app/api/                → seluruh API route handler
components/             → komponen UI React
lib/ai/oracle/          → Oracle pipeline (confluence, contradiction, arbitration, scenario, risk, execute)
lib/ai/cognitive/       → Cognitive Layer (observation, hypothesis, conflict)
lib/ai/decisionTrace/   → infrastruktur trace keputusan (Phase 8.2.1)
lib/ai/decisionEvaluation/ → evaluasi outcome per-keputusan (pure)
lib/ai/failurePatterns/ → deteksi pola kegagalan (frequency-only)
lib/ai/adaptiveConstraint/ → generator constraint advisory
lib/ai/learningValidation/ → validasi constraint
lib/ai/decisionMemory/  → retrieval memory keputusan (pure filter)
lib/ai/autonomousRuntime/ → orchestrator, batch, lock, dedup, learning refresh
lib/binance/             → integrasi Binance (client, trading engine, risk, guard)
lib/elvoid/              → paper trader & helper ELVOID non-Oracle
supabase/                → schema Main DB
supabase/learning/       → schema ELVOID Learning DB
contracts/                → source smart contract
CONTRACTS.md              → daftar address contract terdeploy
README.md                 → overview & status implementasi
CHANGES.md                 → riwayat perubahan per fase`}</pre>
            </div>
          </Section>

          <Section id="engineering" number="24" title="Engineering Principles">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                "No fabricated data",
                "Evidence-first reasoning",
                "Traceability",
                "Risk-aware decision",
                "Explicit uncertainty",
                "Separation of concerns",
                "Deterministic decision pipeline",
                "Satu otoritas keputusan (gradeConfluence)",
                "LLM sebagai reasoning/narrative layer",
                "Pure/read-only sebagai default untuk lapisan downstream",
                "Fail-safe, bukan fail-strong",
                "Controlled learning, bukan self-modification bebas",
                "Failure isolation antar-langkah",
                "Human approval untuk evolusi high-risk",
              ].map((p) => (
                <li key={p} className="rounded-md border border-line bg-bg-raised px-3 py-2 text-xs text-ink-muted">{p}</li>
              ))}
            </ul>
          </Section>

          <Section id="status" number="25" title="Implementation Status">
            <Table
              head={["Komponen", "Status"]}
              rows={[
                ["Agregasi data Macro / Market / Order Flow / Web3 / External", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["ELVOID PRO Oracle pipeline (confluence → grading → contradiction → scenario → arbitration → risk)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Cognitive Layer (observation, hypothesis, conflict resolution)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision Trace (infrastruktur, capture-only)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision Outcome Capture + Learning DB terisolasi", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision Evaluation / Failure Pattern / Adaptive Constraint / Learning Validation", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Decision Memory Retrieval (live per-cycle)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Autonomous background runtime (cron + heartbeat, lock, dedup)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Paper trading (journal, statistik)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Live trading via Binance Spot/Futures", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Membership on-chain via ELSTestnetPayment", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["ELS token, faucet, reward distributor, Bug Hunter escrow (BSC Testnet)", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["LLM narrative pass di atas keputusan final", <StatusBadge key="s" status="IMPLEMENTED" />],
                ["Autonomous-learning lifecycle penuh (di luar retrieval)", <StatusBadge key="s" status="EXPERIMENTAL" />],
                ["Controlled Self-Evolution (Phase 8.6)", <StatusBadge key="s" status="ROADMAP" />],
                ["Mainnet deployment", <StatusBadge key="s" status="ROADMAP" />],
                ["Cross-chain di luar BNB Smart Chain", <StatusBadge key="s" status="ROADMAP" />],
              ]}
            />
            <p className="text-xs text-ink-faint">
              Disusun dari README.md + audit langsung source code. Baris Decision Memory Retrieval disesuaikan dari
              label README ("experimental" secara umum) berdasarkan bukti kode konkret — lihat{" "}
              <a href="#learning" className="text-amber hover:underline">Learning Loop</a>.
            </p>
          </Section>

          <Section id="glossary" number="26" title="Glossary">
            <Table
              head={["Istilah", "Arti"]}
              rows={[
                ["Oracle", "Deterministic pipeline ELVOID yang mengubah evidence jadi OracleAssessment graded"],
                ["OracleAssessment", "Output kanonik Oracle: side, grade, confidence, riskStatus"],
                ["Confluence", "Kesepakatan evidence LONG/SHORT lintas sumber independen"],
                ["Contradiction", "Kontradiksi antar-evidence, ditandai genuineness GENUINE / DATA_GAP / SAME_CLUSTER"],
                ["Arbitration", "Anotasi seberapa kuat konteks sekitar mendukung keputusan yang sudah dibuat — read-only"],
                ["Scenario (Primary/Alternative)", "Narasi pasar paling plausible mengikuti side yang sudah diputuskan grading"],
                ["Cognitive Layer", "Lapisan meta downstream yang menilai koherensi reasoning — bukan decision engine kedua"],
                ["Decision Trace", "Infrastruktur jejak audit keputusan, capture-only"],
                ["Autonomous Runtime", "Sistem yang menjalankan siklus Oracle→Decision otomatis via cron"],
                ["Decision Experience", "Snapshot satu keputusan yang dibekukan di Learning DB"],
                ["Failure Pattern", "Observasi frekuensi murni: evidence tag yang sering berbarengan dengan outcome negatif"],
                ["Adaptive Constraint", "Aturan advisory hasil failure pattern — menaikkan kehati-hatian, tidak memblokir eksekusi"],
                ["Decision Memory", "Riwayat keputusan yang di-retrieve live sebelum keputusan baru dibuat"],
                ["Grade (NO_TRADE/B+/A/A+)", "Skala kualitas sinyal Oracle; A+ butuh dominant score ≥35 dan ≥3 cluster"],
                ["RLS (Row Level Security)", "Kontrol akses baris Postgres — di sini diaktifkan tanpa public policy sama sekali"],
                ["ELS", "Token ERC-20 native ekosistem ELSTAND di BNB Smart Chain Testnet"],
              ]}
            />
          </Section>

          <Section id="changelog" number="27" title="Changelog & Resources">
            <p>
              <Code>CHANGES.md</Code> pada repository adalah canonical changelog/evolution record — riwayat
              perubahan per fase.
            </p>
            <ul className="space-y-1.5">
              <li>→ <Code>CHANGES.md</Code> — riwayat perubahan lengkap per fase</li>
              <li>→ <Code>CONTRACTS.md</Code> — daftar address contract terdeploy</li>
            </ul>
            <p className="text-xs text-ink-faint">
              Catatan: README merujuk ke <Code>docs/ELVOID_COGNITIVE_LAYER.md</Code> sebagai deep-dive Cognitive
              Layer, namun file tersebut {NOT_VERIFIED.toLowerCase()} ada di repository saat audit ini dilakukan —
              detail Cognitive Layer di halaman ini diambil langsung dari komentar header source code (
              <Code>lib/ai/cognitive/*</Code>) sebagai gantinya.
            </p>

            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <a href="mailto:contact@elstand-intellegence.my.id" className="panel flex items-center gap-2.5 p-3 hover:border-amber/40">
                <Mail size={15} className="text-amber" />
                <span className="text-xs text-ink-muted">contact@elstand-intellegence.my.id</span>
              </a>
              <a href="https://github.com/standstillel-store/Elstand-intellegensi-" target="_blank" rel="noopener noreferrer" className="panel flex items-center gap-2.5 p-3 hover:border-amber/40">
                <Github size={15} className="text-amber" />
                <span className="text-xs text-ink-muted">GitHub Repository</span>
                <ExternalLink size={12} className="ml-auto text-ink-faint" />
              </a>
              <div className="panel p-3 text-xs text-ink-muted">
                Website: <a href="https://www.elstand-intellegence.my.id" className="text-amber hover:underline">elstand-intellegence.my.id</a>
              </div>
              <Link href="/methodology" className="panel flex items-center p-3 text-xs text-ink-muted hover:border-amber/40">Methodology →</Link>
            </div>
          </Section>
        </div>
      </div>

      <Footer />
    </main>
  );
}
