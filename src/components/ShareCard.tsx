"use client";

import { useRef, useCallback } from "react";
import { type OverallGrade, type PhaseName, PHASE_SHORT_LABELS } from "@/lib/types";

const GRADE_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellowGreen: "#a3e635",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  injury: "#ff0044",
};

const GRADE_BG: Record<string, string> = {
  green: "bg-green-500/20",
  yellowGreen: "bg-lime-500/20",
  yellow: "bg-yellow-500/20",
  orange: "bg-orange-500/20",
  red: "bg-red-500/20",
};

const GRADE_TEXT: Record<string, string> = {
  green: "text-green-400",
  yellowGreen: "text-lime-400",
  yellow: "text-yellow-400",
  orange: "text-orange-400",
  red: "text-red-400",
};

export default function ShareCard({
  grade,
  firstName,
}: {
  grade: OverallGrade;
  firstName?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;

    // Try native share (mobile) with text
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${firstName || "My"} PitchingCoachAI Report`,
          text: `I scored ${grade.score}/100 (${grade.grade}) on my pitching mechanics analysis! ${grade.phaseGrades.map(p => `${PHASE_SHORT_LABELS[p.phase]}: ${p.grade}`).join(", ")}. Get your free analysis at pitchingcoachai.com`,
          url: "https://pitchingcoachai.com",
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    // Fallback: copy text to clipboard
    const text = `${firstName || "My"} PitchingCoachAI Report: ${grade.score}/100 (${grade.grade}) | ${grade.phaseGrades.map(p => `${PHASE_SHORT_LABELS[p.phase]}: ${p.grade}`).join(" | ")} | Get yours free at pitchingcoachai.com`;
    try {
      await navigator.clipboard.writeText(text);
      alert("Report summary copied to clipboard!");
    } catch {
      // Last resort
      prompt("Copy this to share:", text);
    }
  }, [grade, firstName]);

  return (
    <div>
      {/* Shareable card (optimized for screenshots) */}
      <div
        ref={cardRef}
        className="bg-gradient-to-br from-[#0f0f0f] to-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5">
              PitchingCoachAI Report
            </p>
            <p className="text-sm font-bold text-white">
              {firstName ? `${firstName}\u2019s Mechanics` : "Mechanics Report"}
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-4xl font-black leading-none"
              style={{ color: GRADE_COLORS[grade.color] || "#eab308" }}
            >
              {grade.score}
            </div>
            <div className="text-xs text-white/40 mt-0.5">
              Overall {grade.grade}
            </div>
          </div>
        </div>

        {/* Phase grades */}
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {grade.phaseGrades.map((pg) => (
            <div
              key={pg.phase}
              className={`${GRADE_BG[pg.color] || "bg-white/5"} rounded-lg py-2 text-center`}
            >
              <div className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">
                {PHASE_SHORT_LABELS[pg.phase]}
              </div>
              <div
                className={`text-xl font-black ${GRADE_TEXT[pg.color] || "text-white"}`}
              >
                {pg.grade}
              </div>
              <div className="text-[10px] text-white/30">{pg.score}</div>
            </div>
          ))}
        </div>

        {/* Verdict */}
        <p className="text-xs text-white/50 leading-relaxed mb-4">
          {grade.verdict}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] text-white/25">
            pitchingcoachai.com &middot; Free AI analysis
          </p>
          <p className="text-[10px] text-brand-red font-bold">
            Get yours free &rarr;
          </p>
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        className="w-full mt-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-medium hover:bg-white/10 hover:text-white transition flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share My Results
      </button>
    </div>
  );
}
