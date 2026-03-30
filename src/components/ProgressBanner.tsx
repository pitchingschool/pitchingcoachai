"use client";

import { type ProgressComparison } from "@/lib/progress-tracker";

export default function ProgressBanner({
  comparison,
}: {
  comparison: ProgressComparison;
}) {
  const { scoreDelta, overallImproved, overallDeclined, phaseChanges, analysisCount, daysSinceLast } = comparison;
  const improved = phaseChanges.filter((p) => p.improved);
  const declined = phaseChanges.filter((p) => p.declined);

  return (
    <div
      className={`rounded-2xl p-5 border animate-fade-in-up ${
        overallImproved
          ? "bg-green-500/10 border-green-500/20"
          : overallDeclined
          ? "bg-orange-500/10 border-orange-500/20"
          : "bg-blue-500/10 border-blue-500/20"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl">
          {overallImproved ? "\u2B06\uFE0F" : overallDeclined ? "\u2B07\uFE0F" : "\u27A1\uFE0F"}
        </div>
        <div>
          <p className="font-bold text-sm">
            {overallImproved
              ? `Score improved by ${Math.abs(scoreDelta)} points!`
              : overallDeclined
              ? `Score dropped ${Math.abs(scoreDelta)} points`
              : "Same score as last time"}
          </p>
          <p className="text-xs text-white/40">
            Analysis #{analysisCount}
            {daysSinceLast > 0 ? ` \u00B7 ${daysSinceLast} day${daysSinceLast > 1 ? "s" : ""} since last analysis` : " \u00B7 Same session"}
          </p>
        </div>
      </div>

      {/* Phase-by-phase changes */}
      {(improved.length > 0 || declined.length > 0) && (
        <div className="flex flex-wrap gap-2 mt-2">
          {improved.map((p) => (
            <div key={p.phase} className="text-xs bg-green-500/15 text-green-300 rounded-full px-3 py-1">
              {p.phase}: {p.previousGrade} &rarr; {p.currentGrade} &uarr;
            </div>
          ))}
          {declined.map((p) => (
            <div key={p.phase} className="text-xs bg-orange-500/15 text-orange-300 rounded-full px-3 py-1">
              {p.phase}: {p.previousGrade} &rarr; {p.currentGrade} &darr;
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
