"use client";

import { type OverallGrade } from "@/lib/types";

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

  return (
    <div className={`bg-white/5 border ${COLOR_MAP[grade.color] || ""} rounded-2xl p-6 text-center`}>
      <p className="text-sm text-white/40 mb-4">
        {firstName ? `${firstName}\u2019s ` : ""}Mechanics Report
      </p>

      {/* Circular progress ring */}
      <div className="relative w-32 h-32 mx-auto mb-4">
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
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black" style={{ color: ringColor }}>
            {grade.score}
          </span>
          <span className="text-xs text-white/40 -mt-1">{grade.grade}</span>
        </div>
      </div>

      <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed">
        {grade.verdict}
      </p>
    </div>
  );
}
