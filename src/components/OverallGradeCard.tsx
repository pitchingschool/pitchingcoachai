"use client";

import { useState, useEffect } from "react";
import { type OverallGrade, PHASE_SHORT_LABELS } from "@/lib/types";

const COLOR_MAP: Record<string, string> = {
  green: "text-green-400 border-green-500/30",
  yellowGreen: "text-lime-400 border-lime-500/30",
  yellow: "text-yellow-400 border-yellow-500/30",
  orange: "text-orange-400 border-orange-500/30",
  red: "text-red-400 border-red-500/30",
  injury: "text-red-500 border-red-500/50",
};

const RING_COLORS: Record<string, string> = {
  green: "#22c55e",
  yellowGreen: "#a3e635",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  injury: "#ff0044",
};

const GRADE_BG: Record<string, string> = {
  green: "bg-green-500/15",
  yellowGreen: "bg-lime-500/15",
  yellow: "bg-yellow-500/15",
  orange: "bg-orange-500/15",
  red: "bg-red-500/15",
  injury: "bg-red-500/20",
};

const GRADE_TEXT: Record<string, string> = {
  green: "text-green-400",
  yellowGreen: "text-lime-400",
  yellow: "text-yellow-400",
  orange: "text-orange-400",
  red: "text-red-400",
  injury: "text-red-400",
};

export default function OverallGradeCard({
  grade,
  firstName,
}: {
  grade: OverallGrade;
  firstName?: string;
}) {
  const ringColor = RING_COLORS[grade.color] || "#eab308";
  const circumference = 2 * Math.PI * 54;
  const progress = (grade.score / 100) * circumference;

  // Animated score counter
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200; // 1.2 seconds
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(eased * grade.score));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [grade.score]);

  return (
    <div className={`bg-white/5 border ${COLOR_MAP[grade.color] || ""} rounded-2xl p-6 text-center`}>
      <p className="text-sm text-white/40 mb-4">
        {firstName ? `${firstName}\u2019s ` : ""}Mechanics Report
      </p>

      {/* Circular progress ring */}
      <div className="relative w-36 h-36 mx-auto mb-5">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          {/* Background ring */}
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          {/* Progress ring */}
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={ringColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-black tabular-nums" style={{ color: ringColor }}>
            {displayScore}
          </span>
          <span className="text-sm text-white/40 font-bold -mt-1">{grade.grade}</span>
        </div>
      </div>

      {/* Phase grades row */}
      <div className="grid grid-cols-5 gap-1.5 mb-4">
        {grade.phaseGrades.map((pg) => (
          <div
            key={pg.phase}
            className={`${GRADE_BG[pg.color] || "bg-white/5"} rounded-lg py-2 text-center`}
          >
            <div className="text-[10px] text-white/40 uppercase tracking-wider">
              {PHASE_SHORT_LABELS[pg.phase]}
            </div>
            <div className={`text-lg font-black ${GRADE_TEXT[pg.color] || "text-white"}`}>
              {pg.grade}
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed">
        {grade.verdict}
      </p>
    </div>
  );
}
