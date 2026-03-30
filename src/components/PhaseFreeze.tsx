"use client";

import { type PhaseName, type DetectedPhases, PHASE_LABELS } from "@/lib/types";

const CONFIDENCE_LABELS: Record<string, { text: string; class: string }> = {
  high: { text: "High confidence", class: "text-green-400" },
  medium: { text: "Medium confidence", class: "text-yellow-400" },
  low: { text: "Low confidence", class: "text-red-400" },
};

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
  const level = confidence >= 70 ? "high" : confidence >= 40 ? "medium" : "low";
  const confLabel = CONFIDENCE_LABELS[level];

  return (
    <div className="rounded-xl overflow-hidden bg-black border border-white/10">
      {imageDataUrl ? (
        <div className="relative">
          <img
            src={imageDataUrl}
            alt={`${PHASE_LABELS[phase]} freeze frame`}
            className="w-full aspect-video object-contain bg-black"
          />
          {/* Phase label overlay */}
          <div className="absolute top-3 left-3">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
              <span className="text-xs font-bold text-white">{PHASE_LABELS[phase]}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full aspect-video bg-white/5 flex items-center justify-center text-white/30 text-sm">
          No capture available
        </div>
      )}
      <div className="px-4 py-2.5 flex items-center justify-between bg-white/5">
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 font-mono">
            Frame {phaseResult.frameIndex}
          </span>
          <span className="text-xs text-white/30">&middot;</span>
          <span className="text-xs text-white/50 font-mono">
            {(phaseResult.timestampMs / 1000).toFixed(2)}s
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${level === "high" ? "bg-green-400" : level === "medium" ? "bg-yellow-400" : "bg-red-400"}`} />
          <span className={`text-xs font-medium ${confLabel.class}`}>
            {confidence}%
          </span>
        </div>
      </div>
    </div>
  );
}
