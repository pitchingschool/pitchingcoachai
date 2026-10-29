/**
 * PitchingCoachAI, Effective Handedness Resolution
 *
 * The declared throwing hand can be wrong in two independent ways:
 *   1. The user picked the wrong hand (or left the silent default).
 *   2. MediaPipe mirrors left/right labels on some videos, so the
 *      landmark NAMED "rightWrist" may be the pitcher's left wrist.
 *
 * Either way, all downstream math must use the landmark labels that
 * actually belong to the throwing arm. We call that the EFFECTIVE hand:
 * the hand implied by the motion in this specific landmark stream.
 *
 * Ported from the V3 engine side resolver, which was validated against
 * hand-labeled ground truth clips (including one where the declared
 * hand was simply wrong).
 *
 * Signals (both computed on the landmark labels as given):
 *   A. Throw burst: the throwing wrist produces the fastest motion in
 *      the clip by a wide margin. Compare peak smoothed wrist speed of
 *      leftWrist vs rightWrist.
 *   B. Stride: the lead ankle (opposite the throwing hand) travels much
 *      farther horizontally during the delivery than the back ankle.
 *      Compare total ankle x-travel in the window around the burst.
 */

import type { ValidFrame, Point2D } from "./types";

export interface SideResolution {
  /** Hand (in landmark-label space) to use for ALL measurement. */
  effectiveHand: "left" | "right";
  /** 0-1: how strongly the two signals agree. */
  confidence: number;
  /** True when the resolved hand differs from what the user declared. */
  mismatchWithDeclared: boolean;
  detail: string;
}

function smooth(series: (number | null)[], sigma = 2): number[] {
  const n = series.length;
  const out = new Array(n).fill(0);
  const radius = Math.ceil(sigma * 2);
  for (let i = 0; i < n; i++) {
    let w = 0;
    let v = 0;
    for (let j = -radius; j <= radius; j++) {
      const k = i + j;
      if (k < 0 || k >= n) continue;
      const s = series[k];
      if (s === null) continue;
      const g = Math.exp(-(j * j) / (2 * sigma * sigma));
      v += s * g;
      w += g;
    }
    out[i] = w > 0 ? v / w : 0;
  }
  return out;
}

function wristSpeedSeries(frames: ValidFrame[], key: string): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].keypoints[key];
    const b = frames[i].keypoints[key];
    if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) {
      out.push(null);
      continue;
    }
    out.push(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2));
  }
  return out;
}

function peakOf(series: number[]): { idx: number; value: number } {
  let idx = 0;
  let value = -Infinity;
  // Ignore the very edges, which smoothing leaves unreliable
  for (let i = 2; i < series.length - 2; i++) {
    if (series[i] > value) {
      value = series[i];
      idx = i;
    }
  }
  return { idx, value: value === -Infinity ? 0 : value };
}

function ankleTravel(
  frames: ValidFrame[],
  key: string,
  start: number,
  end: number
): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = Math.max(0, start); i <= Math.min(frames.length - 1, end); i++) {
    const p = frames[i].keypoints[key];
    if (!p || p.visibility < 0.3) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  return maxX > minX ? maxX - minX : 0;
}

export function resolveEffectiveHand(
  frames: ValidFrame[],
  declared: "left" | "right"
): SideResolution {
  if (frames.length < 10) {
    return {
      effectiveHand: declared,
      confidence: 0,
      mismatchWithDeclared: false,
      detail: "Too few frames to resolve; using declared hand.",
    };
  }

  // Signal A: which labeled wrist produces the throw burst
  const leftSm = smooth(wristSpeedSeries(frames, "leftWrist"));
  const rightSm = smooth(wristSpeedSeries(frames, "rightWrist"));
  const leftPeak = peakOf(leftSm);
  const rightPeak = peakOf(rightSm);
  const burstHand: "left" | "right" =
    leftPeak.value > rightPeak.value ? "left" : "right";
  const burstRatio =
    Math.max(leftPeak.value, rightPeak.value) /
    Math.max(1e-6, Math.min(leftPeak.value, rightPeak.value));
  const burstIdx = burstHand === "left" ? leftPeak.idx : rightPeak.idx;

  // Signal B: which labeled ankle strides (lead ankle = opposite the hand)
  const winStart = burstIdx - Math.round(frames.length * 0.3);
  const winEnd = burstIdx + 3;
  const leftTravel = ankleTravel(frames, "leftAnkle", winStart, winEnd);
  const rightTravel = ankleTravel(frames, "rightAnkle", winStart, winEnd);
  // The LEAD ankle travels farther; lead side is opposite the throwing hand.
  const strideHand: "left" | "right" =
    leftTravel > rightTravel ? "right" : "left";
  const strideRatio =
    Math.max(leftTravel, rightTravel) /
    Math.max(1e-6, Math.min(leftTravel, rightTravel));

  let effectiveHand: "left" | "right";
  let confidence: number;
  let detail: string;

  if (burstHand === strideHand) {
    effectiveHand = burstHand;
    confidence = Math.min(
      1,
      0.5 + Math.min(0.25, (burstRatio - 1) * 0.15) + Math.min(0.25, (strideRatio - 1) * 0.15)
    );
    detail = `Burst and stride agree on ${burstHand} (burst x${burstRatio.toFixed(1)}, stride x${strideRatio.toFixed(1)}).`;
  } else {
    // Disagreement: trust the stronger signal; the burst usually wins
    // because the throw is unambiguous, but a weak burst margin means
    // the glove-arm swing may have out-scored a partly occluded wrist.
    if (burstRatio >= 1.5) {
      effectiveHand = burstHand;
      confidence = 0.45;
      detail = `Signals disagree; strong burst picks ${burstHand} (x${burstRatio.toFixed(1)}).`;
    } else if (strideRatio >= 1.5) {
      effectiveHand = strideHand;
      confidence = 0.4;
      detail = `Signals disagree; strong stride picks ${strideHand} (x${strideRatio.toFixed(1)}).`;
    } else {
      effectiveHand = declared;
      confidence = 0.2;
      detail = "Signals disagree and both are weak; keeping declared hand.";
    }
  }

  return {
    effectiveHand,
    confidence,
    mismatchWithDeclared: effectiveHand !== declared,
    detail,
  };
}
