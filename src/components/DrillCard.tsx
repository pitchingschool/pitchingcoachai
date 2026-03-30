"use client";

import { useState } from "react";
import { type DrillPrescription, PHASE_LABELS } from "@/lib/types";

const PRIORITY_COLORS = [
  "border-red-500/40 bg-red-500/5",
  "border-orange-500/40 bg-orange-500/5",
  "border-yellow-500/40 bg-yellow-500/5",
  "border-lime-500/30 bg-lime-500/5",
  "border-white/10 bg-white/5",
];

const PRIORITY_BADGES = [
  "bg-red-500 text-white",
  "bg-orange-500 text-white",
  "bg-yellow-500 text-black",
  "bg-lime-500 text-black",
  "bg-white/20 text-white",
];

export default function DrillCard({ drill }: { drill: DrillPrescription }) {
  const [expanded, setExpanded] = useState(drill.priority <= 2);
  const colorClass = PRIORITY_COLORS[Math.min(drill.priority - 1, 4)];
  const badgeClass = PRIORITY_BADGES[Math.min(drill.priority - 1, 4)];

  return (
    <div className={`border rounded-2xl overflow-hidden ${colorClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
                #{drill.priority}
              </span>
              <span className="text-xs text-white/40 uppercase tracking-wider">
                {PHASE_LABELS[drill.phase]}
              </span>
            </div>
            <h4 className="text-base font-bold">{drill.name}</h4>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded-md">
              {drill.targetMetric}
            </span>
            <svg
              className={`w-4 h-4 text-white/30 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 -mt-2 animate-fade-in-up">
          <p className="text-sm text-white/60 leading-relaxed mb-3">{drill.description}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-white/40 bg-white/5 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {drill.reps}
            </div>
          </div>

          {/* GPS Athletics product recommendation */}
          {drill.product && (
            <a
              href={drill.product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 hover:bg-white/[0.06] hover:border-white/[0.15] transition group"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-red/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/30 uppercase tracking-wider">Train with</p>
                <p className="text-sm font-semibold text-white/80 group-hover:text-white transition">
                  {drill.product.name}
                </p>
                <p className="text-[11px] text-white/30">gps-athletics.com</p>
              </div>
              <svg className="w-4 h-4 text-white/20 group-hover:text-white/50 transition flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
