"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { CognitiveMapSnapshot } from "@/lib/ai/cognitiveMap/contracts";
import { NODE_STATUS_META, CORE_STATE_META } from "./status";

const SIZE = 640;
export const COGNITIVE_GRAPH_SIZE = SIZE;
const CENTER = SIZE / 2;
const CORE_R = 58;
const RING_R = 236;
const NODE_R = 36;

function pointOnRing(index: number, total: number) {
  // Start at the top (12 o'clock), go clockwise — matches the DATA at
  // top / LEARNING feedback looping back visual the spec asks for.
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: CENTER + RING_R * Math.cos(angle), y: CENTER + RING_R * Math.sin(angle) };
}

export function CognitiveGraph({
  snapshot,
  selectedNodeId,
  onSelectNode,
  reducedMotion,
}: {
  snapshot: CognitiveMapSnapshot;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  reducedMotion: boolean;
}) {
  const nodes = snapshot.nodes;
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, i) => map.set(n.id, pointOnRing(i, nodes.length)));
    return map;
  }, [nodes]);

  const coreMeta = CORE_STATE_META[snapshot.core.state];

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="block" role="img" aria-label="ELVOID cognitive intelligence graph">
      <defs>
        <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={coreMeta.color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={coreMeta.color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* faint orchestration spokes — core to every registered module */}
      {nodes.map((n) => {
        const p = positions.get(n.id)!;
        return <line key={`spoke-${n.id}`} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke="#232a35" strokeWidth={1} />;
      })}

      {/* real pipeline connections */}
      {snapshot.connections.map((c) => {
        const a = positions.get(c.from);
        const b = positions.get(c.to);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2 + (CENTER - (a.x + b.x) / 2) * 0.2;
        const my = (a.y + b.y) / 2 + (CENTER - (a.y + b.y) / 2) * 0.2;
        return (
          <path
            key={c.id}
            d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
            fill="none"
            stroke={c.active ? "#22d3ee" : "#333c49"}
            strokeWidth={c.active ? 2 : 1.2}
            strokeOpacity={c.active ? 0.9 : 0.5}
            className={c.active && !reducedMotion ? "cognitive-edge-active" : undefined}
          />
        );
      })}

      {/* core */}
      <circle cx={CENTER} cy={CENTER} r={RING_R * 0.62} fill="url(#core-glow)" />
      <motion.circle
        cx={CENTER}
        cy={CENTER}
        r={CORE_R}
        fill="#0b0f16"
        stroke={coreMeta.color}
        strokeWidth={2}
        animate={reducedMotion ? undefined : { r: [CORE_R, CORE_R + 3, CORE_R] }}
        transition={reducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <text x={CENTER} y={CENTER - 6} textAnchor="middle" className="fill-ink text-[13px] font-semibold tracking-wide">
        ELVOID
      </text>
      <text x={CENTER} y={CENTER + 12} textAnchor="middle" className="fill-ink-muted text-[10px] tracking-widest">
        CORE
      </text>
      <text x={CENTER} y={CENTER + 28} textAnchor="middle" fill={coreMeta.color} className="text-[9px] font-medium tracking-wider">
        {coreMeta.label}
      </text>

      {/* module nodes */}
      {nodes.map((n) => {
        const p = positions.get(n.id)!;
        const meta = NODE_STATUS_META[n.status];
        const selected = n.id === selectedNodeId;
        return (
          <g key={n.id} onClick={() => onSelectNode(n.id)} className="cursor-pointer" role="button" tabIndex={0} aria-label={`${n.label}: ${meta.label}`}>
            <circle cx={p.x} cy={p.y} r={NODE_R + (selected ? 6 : 0)} fill="none" stroke={selected ? meta.color : "transparent"} strokeWidth={2} strokeOpacity={0.6} />
            <circle cx={p.x} cy={p.y} r={NODE_R} fill="#0d1119" stroke={meta.color} strokeWidth={meta.dim ? 1.2 : 2} strokeOpacity={meta.dim ? 0.55 : 1} />
            {!meta.dim && !reducedMotion && <circle cx={p.x} cy={p.y} r={NODE_R} fill="none" stroke={meta.color} strokeWidth={1} className="cognitive-node-ping" />}
            <text x={p.x} y={p.y - 4} textAnchor="middle" className="fill-ink text-[10px] font-semibold">
              {n.label}
            </text>
            <text x={p.x} y={p.y + 10} textAnchor="middle" fill={meta.color} className="text-[8px] tracking-wide">
              {meta.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
