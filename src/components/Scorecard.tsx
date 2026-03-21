"use client";

import { useState } from "react";
import { type MetricGrade } from "@/lib/types";

const DOT_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellowGreen: "bg-lime-400",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  injury: "bg-red-500 animate-pulse",
};

const TEXT_COLORS: Record<string, string> = {
  green: "text-green-400",
  yellowGreen: "text-lime-400",
  yellow: "text-yellow-400",
  orange: "text-orange-400",
  red: "text-red-400",
  injury: "text-red-400 font-bold",
};

export default function Scorecard({ metrics }: { metrics: MetricGrade[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {metrics.map((m) => {
        const isExpanded = expanded === m.metricKey;
        const isInfoOnly = m.metricKey === "release.armSlot";

        return (
          <div key={m.metricKey}>
            <button
              onClick={() => setExpanded(isExpanded ? null : m.metricKey)}
              className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:bg-white/[0.07] transition text-left"
            >
              {/* Grade dot */}
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${DOT_COLORS[m.color]}`} />

              {/* Label + target */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.label}</div>
                {m.injuryFlag && (
                  <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                    Injury Risk
                  </div>
                )}
              </div>

              {/* Value + grade */}
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold">
                  {m.value !== null ? `${m.value}${m.unit}` : "N/A"}
                </div>
                <div className={`text-xs ${TEXT_COLORS[m.color]}`}>
                  {isInfoOnly ? "Info" : m.grade}
                </div>
              </div>

              {/* Expand chevron */}
              <svg
                className={`w-4 h-4 text-white/30 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expanded explanation */}
            {isExpanded && (
              <div className="mx-2 mt-1 mb-2 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-lg">
                <p className="text-sm text-white/60 leading-relaxed">{m.explanation}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
