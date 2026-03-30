"use client";

import { useState } from "react";
import { type MetricGrade } from "@/lib/types";

const DOT_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellowGreen: "bg-lime-400",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  injury: "bg-red-500 animate-pulse-dot",
};

const TEXT_COLORS: Record<string, string> = {
  green: "text-green-400",
  yellowGreen: "text-lime-400",
  yellow: "text-yellow-400",
  orange: "text-orange-400",
  red: "text-red-400",
  injury: "text-red-400 font-bold",
};

const BAR_COLORS: Record<string, string> = {
  green: "bg-green-500",
  yellowGreen: "bg-lime-400",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  injury: "bg-red-500",
};

const GRADE_SCORES: Record<string, number> = {
  "A+": 100,
  A: 90,
  B: 75,
  C: 55,
  D: 35,
  F: 15,
};

export default function Scorecard({ metrics }: { metrics: MetricGrade[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {metrics.map((m) => {
        const isExpanded = expanded === m.metricKey;
        const isInfoOnly = m.metricKey === "release.armSlot";
        const barWidth = GRADE_SCORES[m.grade] ?? 50;

        return (
          <div key={m.metricKey}>
            <button
              onClick={() => setExpanded(isExpanded ? null : m.metricKey)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:bg-white/[0.07] transition text-left"
            >
              <div className="flex items-center gap-3">
                {/* Grade dot */}
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${DOT_COLORS[m.color]}`} />

                {/* Label + injury flag */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.label}</div>
                  {m.injuryFlag && (
                    <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Injury Risk
                    </div>
                  )}
                </div>

                {/* Value + grade */}
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold">
                    {m.value !== null ? `${m.value}${m.unit}` : "N/A"}
                  </div>
                  <div className={`text-xs font-bold ${TEXT_COLORS[m.color]}`}>
                    {isInfoOnly ? "Info" : m.grade}
                  </div>
                </div>

                {/* Expand chevron */}
                <svg
                  className={`w-4 h-4 text-white/30 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Mini progress bar */}
              {!isInfoOnly && (
                <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[m.color]}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              )}
            </button>

            {/* Expanded explanation */}
            {isExpanded && (
              <div className="mx-2 mt-1 mb-2 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-lg animate-fade-in-up">
                <p className="text-sm text-white/60 leading-relaxed">{m.explanation}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
