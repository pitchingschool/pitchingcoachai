"use client";

import { type PhaseName, type PhaseGrade, PHASE_SHORT_LABELS } from "@/lib/types";

const COLOR_BG: Record<string, string> = {
  green: "bg-green-500/20 border-green-500/40 text-green-400",
  yellowGreen: "bg-lime-500/20 border-lime-500/40 text-lime-400",
  yellow: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400",
  orange: "bg-orange-500/20 border-orange-500/40 text-orange-400",
  red: "bg-red-500/20 border-red-500/40 text-red-400",
  injury: "bg-red-500/30 border-red-500/50 text-red-400",
};

const ACTIVE_BG: Record<string, string> = {
  green: "bg-green-500 border-green-400 text-white",
  yellowGreen: "bg-lime-500 border-lime-400 text-black",
  yellow: "bg-yellow-500 border-yellow-400 text-black",
  orange: "bg-orange-500 border-orange-400 text-white",
  red: "bg-red-500 border-red-400 text-white",
  injury: "bg-red-600 border-red-400 text-white",
};

export default function PhaseTabs({
  phaseGrades,
  activePhase,
  onSelect,
}: {
  phaseGrades: PhaseGrade[];
  activePhase: PhaseName;
  onSelect: (phase: PhaseName) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {phaseGrades.map((pg) => {
        const isActive = pg.phase === activePhase;
        const colorClass = isActive ? ACTIVE_BG[pg.color] : COLOR_BG[pg.color];
        return (
          <button
            key={pg.phase}
            onClick={() => onSelect(pg.phase)}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${colorClass}`}
          >
            <span className="mr-1.5">{PHASE_SHORT_LABELS[pg.phase]}</span>
            <span className="opacity-80">{pg.grade}</span>
          </button>
        );
      })}
    </div>
  );
}
