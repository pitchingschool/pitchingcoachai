"use client";

import { type PhaseName, type DetectedPhases, type PhaseGrade, PHASE_SHORT_LABELS } from "@/lib/types";

const GRADE_BORDER: Record<string, string> = {
  green: "border-green-500/40",
  yellowGreen: "border-lime-500/40",
  yellow: "border-yellow-500/40",
  orange: "border-orange-500/40",
  red: "border-red-500/40",
  injury: "border-red-500/60",
};

const GRADE_TEXT: Record<string, string> = {
  green: "text-green-400",
  yellowGreen: "text-lime-400",
  yellow: "text-yellow-400",
  orange: "text-orange-400",
  red: "text-red-400",
  injury: "text-red-400",
};

interface PhaseGridProps {
  phaseGrades: PhaseGrade[];
  phaseFrameCaptures: Record<PhaseName, string>;
  phases: DetectedPhases;
  activePhase: PhaseName;
  onSelect: (phase: PhaseName) => void;
}

const PHASE_ORDER: PhaseName[] = ["legLift", "drift", "footStrike", "mer", "release"];

export default function PhaseGrid({
  phaseGrades,
  phaseFrameCaptures,
  phases,
  activePhase,
  onSelect,
}: PhaseGridProps) {
  const gradeMap = new Map(phaseGrades.map((pg) => [pg.phase, pg]));

  return (
    <div>
      <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
        All Phases at a Glance
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {PHASE_ORDER.map((phase) => {
          const pg = gradeMap.get(phase);
          const isActive = phase === activePhase;
          const capture = phaseFrameCaptures[phase];
          const borderColor = pg ? GRADE_BORDER[pg.color] || "border-white/10" : "border-white/10";
          const textColor = pg ? GRADE_TEXT[pg.color] || "text-white" : "text-white";

          return (
            <button
              key={phase}
              onClick={() => onSelect(phase)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                isActive
                  ? `${borderColor} ring-2 ring-brand-red/50 scale-[1.02]`
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              {capture ? (
                <img
                  src={capture}
                  alt={`${PHASE_SHORT_LABELS[phase]} freeze frame`}
                  className="w-full aspect-video object-cover"
                />
              ) : (
                <div className="w-full aspect-video bg-white/5 flex items-center justify-center text-white/20 text-xs">
                  No capture
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {PHASE_SHORT_LABELS[phase]}
                  </span>
                  {pg && (
                    <span className={`text-sm font-black ${textColor}`}>
                      {pg.grade}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
