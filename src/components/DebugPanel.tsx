"use client";

import { useState } from "react";
import type { DetectedPhases, ValidFrame, PhaseName, FPSQuality } from "@/lib/types";
import { PHASE_LABELS, getSideKeys } from "@/lib/types";

interface DebugPanelProps {
  phases: DetectedPhases;
  frames: ValidFrame[];
  totalFrames: number;
  estimatedFPS: number;
  videoWidth: number;
  videoHeight: number;
  throwingHand: "left" | "right";
  fpsQuality?: FPSQuality;
}

const PHASE_ORDER: PhaseName[] = ["legLift", "drift", "footStrike", "mer", "release", "deceleration"];

function confidenceColor(confidence: number): string {
  if (confidence >= 70) return "text-green-400";
  if (confidence >= 40) return "text-yellow-400";
  return "text-red-400";
}

function confidenceBg(confidence: number): string {
  if (confidence >= 70) return "bg-green-900/30 border-green-700/40";
  if (confidence >= 40) return "bg-yellow-900/30 border-yellow-700/40";
  return "bg-red-900/30 border-red-700/40";
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(3)}s`;
}

function formatY(val: number | undefined): string {
  if (val === undefined) return "N/A";
  return val.toFixed(4);
}

const FPS_QUALITY_LABELS: Record<string, { label: string; color: string }> = {
  excellent: { label: "Excellent (lab-quality)", color: "text-green-400" },
  good: { label: "Good", color: "text-green-400" },
  mediocre: { label: "Mediocre", color: "text-yellow-400" },
  poor: { label: "Poor (try slo-mo)", color: "text-red-400" },
};

export default function DebugPanel({
  phases,
  frames,
  totalFrames,
  estimatedFPS,
  videoWidth,
  videoHeight,
  throwingHand,
  fpsQuality,
}: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const side = getSideKeys(throwingHand);

  function getLandmarkY(phaseFrameIndex: number, key: string): number | undefined {
    // phases store the index into the frames array, not the video frameIndex
    const frame = frames[phaseFrameIndex];
    return frame?.keypoints?.[key]?.y;
  }

  const isTemporallyOrdered = PHASE_ORDER.every((phase, i) => {
    if (i === 0) return true;
    return phases[phase].frameIndex >= phases[PHASE_ORDER[i - 1]].frameIndex;
  });

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-mono
                   bg-neutral-900 border border-neutral-700 rounded
                   text-neutral-400 hover:text-white hover:border-[#dc2626]
                   transition-colors"
      >
        <span className="text-base leading-none select-none">{"\uD83D\uDD27"}</span>
        <span>Debug Info</span>
        <span className="ml-1 text-xs text-neutral-600">
          {open ? "\u25B2" : "\u25BC"}
        </span>
      </button>

      {open && (
        <div
          className="mt-2 p-4 rounded border border-neutral-700
                     bg-[#0a0a0a] text-white font-mono text-xs
                     space-y-4"
        >
          {/* Video Metadata */}
          <section>
            <h3 className="text-[#dc2626] font-bold text-sm mb-2 tracking-wide uppercase">
              Video Metadata
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-neutral-300">
              <div>
                <span className="text-neutral-500">Frames:</span>{" "}
                {totalFrames}
              </div>
              <div>
                <span className="text-neutral-500">FPS:</span>{" "}
                {estimatedFPS}
                {fpsQuality && (
                  <span className={`ml-1 ${FPS_QUALITY_LABELS[fpsQuality]?.color || ""}`}>
                    ({FPS_QUALITY_LABELS[fpsQuality]?.label})
                  </span>
                )}
              </div>
              <div>
                <span className="text-neutral-500">Dimensions:</span>{" "}
                {videoWidth}&times;{videoHeight}
              </div>
              <div>
                <span className="text-neutral-500">Throwing:</span>{" "}
                {throwingHand === "right" ? "RHP" : "LHP"}
              </div>
            </div>
          </section>

          {/* Phase Details */}
          <section>
            <h3 className="text-[#dc2626] font-bold text-sm mb-2 tracking-wide uppercase">
              Phase Detection
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PHASE_ORDER.map((phase) => {
                const result = phases[phase];
                return (
                  <div
                    key={phase}
                    className={`rounded border p-3 ${confidenceBg(result.confidence)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-white text-sm">
                        {PHASE_LABELS[phase]}
                      </span>
                      <span
                        className={`font-bold ${confidenceColor(result.confidence)}`}
                      >
                        {result.confidence.toFixed(0)}%
                      </span>
                    </div>
                    <div className="space-y-0.5 text-neutral-300">
                      <div>
                        <span className="text-neutral-500">Frame:</span>{" "}
                        {result.frameIndex}
                        <span className="text-neutral-600 ml-2">
                          ({formatMs(result.timestampMs)})
                        </span>
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-neutral-700/50">
                        <span className="text-neutral-500 block mb-0.5">
                          Throw-arm landmarks (Y):
                        </span>
                        <div className="pl-2 space-y-0.5">
                          <div>
                            <span className="text-neutral-500">Shoulder:</span>{" "}
                            {formatY(
                              getLandmarkY(result.frameIndex, side.throwShoulder)
                            )}
                          </div>
                          <div>
                            <span className="text-neutral-500">Elbow:</span>{" "}
                            {formatY(
                              getLandmarkY(result.frameIndex, side.throwElbow)
                            )}
                          </div>
                          <div>
                            <span className="text-neutral-500">Wrist:</span>{" "}
                            {formatY(
                              getLandmarkY(result.frameIndex, side.throwWrist)
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Temporal Ordering */}
          <section>
            <h3 className="text-[#dc2626] font-bold text-sm mb-2 tracking-wide uppercase">
              Phase Sequence
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {PHASE_ORDER.map((phase, i) => (
                <div key={phase} className="flex items-center gap-2">
                  <div className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1">
                    <span className="text-neutral-400">
                      {PHASE_LABELS[phase]}
                    </span>
                    <span className="text-white ml-1.5">
                      #{phases[phase].frameIndex}
                    </span>
                  </div>
                  {i < PHASE_ORDER.length - 1 && (
                    <span className="text-neutral-600">{"\u2192"}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2">
              {isTemporallyOrdered ? (
                <span className="text-green-400 text-xs">
                  {"\u2713"} Temporal order valid
                </span>
              ) : (
                <span className="text-red-400 text-xs font-bold">
                  {"\u2717"} WARNING: Phases are NOT in temporal order
                </span>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
