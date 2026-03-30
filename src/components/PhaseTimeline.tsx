"use client";

import type { PhaseName, DetectedPhases, PhaseGrade } from "@/lib/types";
import { PHASE_SHORT_LABELS } from "@/lib/types";

interface PhaseTimelineProps {
  phases: DetectedPhases;
  phaseGrades: PhaseGrade[];
  activePhase: PhaseName;
  onSelect: (phase: PhaseName) => void;
  totalDurationMs: number;
}

const GRADE_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellowGreen: "#a3e635",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  injury: "#ef4444",
};

const PHASE_ORDER: PhaseName[] = ["legLift", "drift", "footStrike", "mer", "release"];

export default function PhaseTimeline({
  phases,
  phaseGrades,
  activePhase,
  onSelect,
  totalDurationMs,
}: PhaseTimelineProps) {
  const gradeMap = new Map(phaseGrades.map((pg) => [pg.phase, pg]));

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[480px] px-4 py-3">
        {/* Timeline bar */}
        <div className="relative h-2 rounded-full bg-white/10 mx-6">
          {/* Progress fill up to last detected phase */}
          {(() => {
            const lastPhase = PHASE_ORDER[PHASE_ORDER.length - 1];
            const lastPct =
              totalDurationMs > 0
                ? (phases[lastPhase].timestampMs / totalDurationMs) * 100
                : 100;
            return (
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/20"
                style={{ width: `${Math.min(lastPct + 2, 100)}%` }}
              />
            );
          })()}

          {/* Phase markers on the bar */}
          {PHASE_ORDER.map((name) => {
            const pct =
              totalDurationMs > 0
                ? (phases[name].timestampMs / totalDurationMs) * 100
                : 0;
            const isActive = activePhase === name;

            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-transform duration-150"
                style={{ left: `${pct}%` }}
                aria-label={`Select ${PHASE_SHORT_LABELS[name]} phase`}
              >
                <span
                  className={`block rounded-full border-2 transition-all duration-150 ${
                    isActive
                      ? "w-4 h-4 border-[#dc2626] bg-[#dc2626] scale-125 shadow-[0_0_8px_rgba(220,38,38,0.6)]"
                      : "w-3 h-3 border-white/60 bg-white/30 hover:border-white hover:bg-white/50"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Phase labels row */}
        <div className="relative mt-5 h-16 mx-6">
          {PHASE_ORDER.map((name) => {
            const pct =
              totalDurationMs > 0
                ? (phases[name].timestampMs / totalDurationMs) * 100
                : 0;
            const isActive = activePhase === name;
            const pg = gradeMap.get(name);
            const gradeColor = pg ? GRADE_COLORS[pg.color] ?? "#fff" : "#fff";
            const timestampSec = (phases[name].timestampMs / 1000).toFixed(2);

            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className={`absolute -translate-x-1/2 flex flex-col items-center gap-0.5 transition-opacity duration-150 ${
                  isActive ? "opacity-100" : "opacity-60 hover:opacity-90"
                }`}
                style={{ left: `${pct}%` }}
              >
                {/* Connector line */}
                <span
                  className={`block w-px h-2 ${
                    isActive ? "bg-[#dc2626]" : "bg-white/30"
                  }`}
                />

                {/* Phase name */}
                <span
                  className={`text-[11px] font-semibold leading-tight whitespace-nowrap ${
                    isActive ? "text-white" : "text-white/70"
                  }`}
                >
                  {PHASE_SHORT_LABELS[name]}
                </span>

                {/* Grade badge */}
                {pg && (
                  <span
                    className="text-[10px] font-bold leading-none px-1.5 py-0.5 rounded"
                    style={{
                      color: "#0a0a0a",
                      backgroundColor: gradeColor,
                    }}
                  >
                    {pg.grade}
                  </span>
                )}

                {/* Timestamp */}
                <span className="text-[9px] text-white/40 leading-tight tabular-nums">
                  {timestampSec}s &middot; f{phases[name].frameIndex}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
