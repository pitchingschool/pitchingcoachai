"use client";

import { type DrillPrescription, PHASE_LABELS } from "@/lib/types";

const PRIORITY_COLORS = [
  "border-red-500/40 bg-red-500/5",
  "border-orange-500/40 bg-orange-500/5",
  "border-yellow-500/40 bg-yellow-500/5",
  "border-lime-500/30 bg-lime-500/5",
  "border-white/10 bg-white/5",
];

export default function DrillCard({ drill }: { drill: DrillPrescription }) {
  const colorClass = PRIORITY_COLORS[Math.min(drill.priority - 1, 4)];

  return (
    <div className={`border rounded-2xl p-5 ${colorClass}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
            #{drill.priority} &middot; {PHASE_LABELS[drill.phase]}
          </span>
          <h4 className="text-base font-bold mt-0.5">{drill.name}</h4>
        </div>
        <span className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded-md flex-shrink-0">
          {drill.targetMetric}
        </span>
      </div>
      <p className="text-sm text-white/60 leading-relaxed mb-3">{drill.description}</p>
      <div className="text-xs text-white/40 bg-white/5 rounded-lg px-3 py-2 inline-block">
        {drill.reps}
      </div>
    </div>
  );
}
