"use client";

import { type PhaseName, type DetectedPhases, PHASE_LABELS } from "@/lib/types";

export default function PhaseFreeze({
  phase,
  imageDataUrl,
  confidence,
  phases,
}: {
  phase: PhaseName;
  imageDataUrl: string | null;
  confidence: number;
  phases: DetectedPhases;
}) {
  const phaseResult = phases[phase];

  return (
    <div className="rounded-xl overflow-hidden bg-black border border-white/10">
      {imageDataUrl ? (
        <img
          src={imageDataUrl}
          alt={`${PHASE_LABELS[phase]} freeze frame`}
          className="w-full aspect-video object-contain bg-black"
        />
      ) : (
        <div className="w-full aspect-video bg-white/5 flex items-center justify-center text-white/30 text-sm">
          No capture available
        </div>
      )}
      <div className="px-3 py-2 flex items-center justify-between bg-white/5">
        <span className="text-xs text-white/50">
          Frame {phaseResult.frameIndex} &middot; {(phaseResult.timestampMs / 1000).toFixed(2)}s
        </span>
        <span className={`text-xs font-medium ${confidence >= 70 ? "text-green-400" : confidence >= 40 ? "text-yellow-400" : "text-red-400"}`}>
          {confidence}% confidence
        </span>
      </div>
    </div>
  );
}
