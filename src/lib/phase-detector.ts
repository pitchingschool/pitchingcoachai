/**
 * PitchingCoachAI, Throw-Anchored Phase Detection
 *
 * Replaces the old cascade + "remap" approach (every detector fired one
 * phase late and the outputs were relabeled). Instead, detection anchors
 * on the one unambiguous event in every pitching clip: the throw itself,
 * the global peak of smoothed throwing-wrist speed. Everything else is
 * found in windows sized by the burst width around that anchor, so no
 * phase can lock onto the wind-up or the follow-through.
 *
 * Ported from the V3 engine, where this design was validated against
 * hand-labeled ground truth (6.7% → 38%+ strict-tolerance accuracy).
 *
 * Phase order by construction:
 *   legLift < drift < footStrike < mer (max layback) <= release < decel
 *
 * "mer" keeps its key for backward compatibility but now means the
 * coach-defined MAX LAYBACK frame: peak forearm layback angle in
 * (footStrike, release].
 */

import {
  type ValidFrame,
  type DetectedPhases,
  type Point2D,
  getSideKeys,
} from "./types";

// ============================================================
// GEOMETRY + SERIES HELPERS
// ============================================================

const VIS = 0.3; // minimum keypoint visibility to trust a coordinate

function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function kpAt(frame: ValidFrame, key: string): Point2D | null {
  const p = frame.keypoints[key];
  if (!p || p.visibility < VIS) return null;
  return { x: p.x, y: p.y };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Gaussian smoothing that skips null gaps instead of treating them as 0. */
function smoothSeries(series: (number | null)[], sigma = 2): number[] {
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

/** Per-frame speed of one keypoint, null where visibility is too low.
 *  Single-frame spikes that tower over BOTH neighbors are tracking
 *  jumps (the landmark teleported for one frame), not motion: nulled. */
function speedSeries(frames: ValidFrame[], key: string): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let i = 1; i < frames.length; i++) {
    const a = kpAt(frames[i - 1], key);
    const b = kpAt(frames[i], key);
    out.push(a && b ? dist(a, b) : null);
  }
  for (let i = 1; i < out.length - 1; i++) {
    const v = out[i];
    const p = out[i - 1];
    const n = out[i + 1];
    if (v !== null && p !== null && n !== null && v > 0.01 && v > 3 * p && v > 3 * n) {
      out[i] = null;
    }
  }
  return out;
}

function meanVisibility(frame: ValidFrame, keys: string[]): number {
  let sum = 0;
  let count = 0;
  for (const k of keys) {
    const p = frame.keypoints[k];
    if (p) {
      sum += p.visibility;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Coach-defined layback angle: forearm (elbow→wrist) vs the ground.
 *   90 = forearm straight up.
 *  180 = forearm laid flat back toward second base.
 *    0 = forearm flat forward toward the plate.
 * The coach scale ends at 180: a forearm pointing back AND below the
 * elbow is not "more layback", it is a different position (usually pose
 * noise or the arm swinging), so anything past 195 is invalid (null).
 * Null when either keypoint is not trustworthy.
 */
export function laybackAngle(
  frame: ValidFrame,
  throwElbowKey: string,
  throwWristKey: string,
  throwDirSign: number
): number | null {
  const elbow = kpAt(frame, throwElbowKey);
  const wrist = kpAt(frame, throwWristKey);
  if (!elbow || !wrist) return null;
  const fx = wrist.x - elbow.x;
  const fy = wrist.y - elbow.y;
  if (fx === 0 && fy === 0) return null;
  // "behind": horizontal component pointing away from the throw direction
  const behind = -throwDirSign * fx;
  // "up": screen y grows downward, so up = -fy
  const up = -fy;
  const tilt = (Math.atan2(behind, up) * 180) / Math.PI; // 0 = vertical, +90 = flat back
  const layback = 90 + tilt;
  if (layback > 195) return null;
  return layback;
}

// ============================================================
// MAIN DETECTION
// ============================================================

export function detectPhases(
  frames: ValidFrame[],
  throwingHand: "left" | "right" = "right"
): DetectedPhases {
  const n = frames.length;
  const S = getSideKeys(throwingHand);
  const armKeys = [S.throwShoulder, S.throwElbow, S.throwWrist];
  const legKeys = [S.leadHip, S.leadKnee, S.leadAnkle, S.backHip, S.backKnee, S.backAnkle];

  // ==========================================================
  // 0. THROW ANCHOR, global peak of smoothed throwing-wrist speed
  // ==========================================================
  const wristSpeed = speedSeries(frames, S.throwWrist);
  const wristSm = smoothSeries(wristSpeed, 2);

  let anchorIdx = Math.round(n * 0.6);
  let anchorPeak = -Infinity;
  for (let i = 2; i < n - 1; i++) {
    if (wristSm[i] > anchorPeak) {
      anchorPeak = wristSm[i];
      anchorIdx = i;
    }
  }

  // Burst width: contiguous frames around the anchor above half peak.
  // This is the natural time unit of THIS clip (handles any frame rate).
  let burstLo = anchorIdx;
  let burstHi = anchorIdx;
  while (burstLo > 0 && wristSm[burstLo - 1] > anchorPeak * 0.5) burstLo--;
  while (burstHi < n - 1 && wristSm[burstHi + 1] > anchorPeak * 0.5) burstHi++;
  const scale = clamp(burstHi - burstLo + 1, 3, Math.max(3, Math.round(n * 0.15)));

  // ==========================================================
  // 0.5 THROW DIRECTION, from hip translation across the delivery
  // ==========================================================
  let throwDirSign = throwingHand === "right" ? -1 : 1;
  {
    const early = Math.max(0, anchorIdx - 4 * scale);
    const late = Math.min(n - 1, anchorIdx + scale);
    const hipA =
      kpAt(frames[early], S.leadHip) || kpAt(frames[early], S.backHip);
    const hipB = kpAt(frames[late], S.leadHip) || kpAt(frames[late], S.backHip);
    if (hipA && hipB && Math.abs(hipB.x - hipA.x) > 0.015) {
      throwDirSign = hipB.x - hipA.x > 0 ? 1 : -1;
    }
  }

  // ==========================================================
  // 1. RELEASE, max arm extension near the anchor
  //    Extension ratio = shoulder→wrist / (shoulder→elbow + elbow→wrist).
  //    Approaches 1.0 only when the arm is fully extended at release.
  //    Fallback: first wrist-speed decay below 70% of peak after anchor.
  // ==========================================================
  const relLo = Math.max(1, anchorIdx - scale);
  const relHi = Math.min(n - 1, anchorIdx + 2 * scale);
  let releaseIdx = -1;
  let bestExt = -Infinity;
  const extAt: (number | null)[] = new Array(n).fill(null);
  for (let i = relLo; i <= relHi; i++) {
    const sh = kpAt(frames[i], S.throwShoulder);
    const el = kpAt(frames[i], S.throwElbow);
    const wr = kpAt(frames[i], S.throwWrist);
    if (!sh || !el || !wr) continue;
    const chain = dist(sh, el) + dist(el, wr);
    if (chain < 1e-4) continue;
    // Release happens with the hand out FRONT, not still laid back
    const wristForward = (wr.x - sh.x) * throwDirSign;
    if (wristForward < 0) continue;
    const ext = dist(sh, wr) / chain;
    extAt[i] = ext;
    if (ext > bestExt) {
      bestExt = ext;
      releaseIdx = i;
    }
  }
  // The follow-through also shows a fully extended arm, so take the
  // EARLIEST frame that reaches essentially-max extension: that is the
  // moment the ball leaves; everything after is deceleration.
  if (releaseIdx !== -1) {
    for (let i = relLo; i <= relHi; i++) {
      const e = extAt[i];
      if (e !== null && e >= bestExt - 0.015) {
        releaseIdx = i;
        break;
      }
    }
  }

  let releaseMethod = "extension";
  if (releaseIdx === -1 || releaseIdx === relLo || releaseIdx === relHi) {
    // Extension landed on a window edge (or found nothing): decay fallback.
    releaseMethod = "speed-decay";
    releaseIdx = Math.min(anchorIdx + 1, n - 1);
    for (let i = anchorIdx + 1; i <= relHi; i++) {
      if (wristSm[i] < anchorPeak * 0.7) {
        releaseIdx = i;
        break;
      }
      releaseIdx = i;
    }
  }

  let releaseConfidence: number;
  {
    const vis = meanVisibility(frames[releaseIdx], armKeys);
    releaseConfidence = clamp(
      Math.round(
        (releaseMethod === "extension" ? 35 : 20) +
          (bestExt > 0.92 ? 20 : bestExt > 0.85 ? 12 : 5) +
          (Math.abs(releaseIdx - anchorIdx) <= scale ? 15 : 5) +
          vis * 30
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 2. FRONT FOOT STRIKE, lead ankle goes quiet before release
  //    Method A: onset of ankle stillness (speed-quiet) with stride
  //    spread + ground proximity requirements.
  //    Method B fallback: ankle-height plateau.
  // ==========================================================
  const fsLo = Math.max(1, releaseIdx - 5 * scale);
  const fsHi = Math.max(fsLo + 1, releaseIdx - 1);

  const ankleSpeed = speedSeries(frames, S.leadAnkle);
  const ankleSm = smoothSeries(ankleSpeed, 1.5);

  // Ground level + max stride spread references inside the window
  let maxAnkleY = -Infinity;
  let maxSpread = 0;
  for (let i = fsLo; i <= fsHi; i++) {
    const la = kpAt(frames[i], S.leadAnkle);
    const ba = kpAt(frames[i], S.backAnkle);
    if (la) maxAnkleY = Math.max(maxAnkleY, la.y);
    if (la && ba) maxSpread = Math.max(maxSpread, Math.abs(la.x - ba.x));
  }

  let peakAnkleSpeed = 0;
  for (let i = fsLo; i <= fsHi; i++) peakAnkleSpeed = Math.max(peakAnkleSpeed, ankleSm[i]);
  const quietThreshold = Math.max(0.002, peakAnkleSpeed * 0.18);

  let footStrikeIdx = -1;
  let fsMethod = "none";

  // Method A: ground-arrival. Foot strike is the first frame where the
  // lead ankle reaches ground level after a real descent. All thresholds
  // scale with the ankle's own height range in the window, so this works
  // for any frame rate and any pitcher size in frame. (The planted
  // ankle's TRACKED position keeps moving after the strike as the shank
  // rotates, so speed-based quiet detection is unreliable in 2D.)
  {
    let minAnkleY = Infinity;
    for (let i = fsLo; i <= fsHi; i++) {
      const la = kpAt(frames[i], S.leadAnkle);
      if (la) minAnkleY = Math.min(minAnkleY, la.y);
    }
    const liftRange = maxAnkleY - minAnkleY;
    if (liftRange > 0.008) {
      // The plant is the LOWEST point the lead ankle reaches before
      // release. Find that point, then walk back through its plateau to
      // the plant onset (handles a slow "crawling" final descent).
      let lowIdx = -1;
      let lowY = -Infinity;
      for (let i = fsLo; i <= fsHi; i++) {
        const la = kpAt(frames[i], S.leadAnkle);
        if (la && la.y > lowY) {
          lowY = la.y;
          lowIdx = i;
        }
      }
      // A lowest point at the window's start means the height signal
      // never descends here (bad angle or tracking); defer to Method B.
      if (lowIdx > fsLo + 2) {
        const plateauTol = 0.06 * liftRange;
        let onset = lowIdx;
        while (onset > fsLo) {
          const p = kpAt(frames[onset - 1], S.leadAnkle);
          if (!p || p.y < lowY - plateauTol) break;
          onset--;
        }
        // Must arrive from a real descent
        let highest = lowY;
        for (let j = Math.max(fsLo, onset - Math.max(2, scale)); j < onset; j++) {
          const p = kpAt(frames[j], S.leadAnkle);
          if (p) highest = Math.min(highest, p.y);
        }
        const la = kpAt(frames[onset], S.leadAnkle);
        const ba = kpAt(frames[onset], S.backAnkle);
        const spreadOk =
          la && ba && maxSpread > 0
            ? Math.abs(la.x - ba.x) >= maxSpread * 0.35
            : true;
        if (la && la.y - highest > 0.25 * liftRange && spreadOk) {
          footStrikeIdx = onset;
          fsMethod = "ground-arrival";
        }
      }
    }
  }

  // Method B: ankle speed-quiet onset before release (fallback when the
  // height signal is too flat to trust).
  if (footStrikeIdx === -1) {
    for (let i = fsLo + 2; i <= fsHi; i++) {
      const la = kpAt(frames[i], S.leadAnkle);
      const ba = kpAt(frames[i], S.backAnkle);
      if (!la || !ba) continue;
      if (maxAnkleY > 0 && la.y < maxAnkleY - 0.04) continue;
      if (maxSpread > 0 && Math.abs(la.x - ba.x) < maxSpread * 0.5) continue;
      if (ankleSm[i] >= quietThreshold) continue;
      const prev = ankleSm[Math.max(fsLo, i - 2)];
      if (prev < quietThreshold * 1.2) continue;
      footStrikeIdx = i;
      fsMethod = "speed-quiet";
      break;
    }
  }

  // Last resort: a fixed offset back from release
  if (footStrikeIdx === -1) {
    footStrikeIdx = Math.max(1, releaseIdx - 2 * scale);
    fsMethod = "fallback-offset";
  }

  let footStrikeConfidence: number;
  {
    const vis = meanVisibility(frames[footStrikeIdx], legKeys);
    footStrikeConfidence = clamp(
      Math.round(
        (fsMethod === "speed-quiet" ? 40 : fsMethod === "y-plateau" ? 30 : 10) +
          (releaseIdx - footStrikeIdx >= 2 && releaseIdx - footStrikeIdx <= 5 * scale ? 15 : 5) +
          vis * 40
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 3. MAX LAYBACK, peak coach-defined layback in (FFS, release]
  // ==========================================================
  // Chosen on a lightly smoothed series so a single noisy frame cannot
  // fake the peak.
  let laybackIdx = -1;
  let bestLayback = -Infinity;
  {
    const laybacks: (number | null)[] = [];
    for (let i = footStrikeIdx + 1; i <= releaseIdx; i++) {
      laybacks.push(laybackAngle(frames[i], S.throwElbow, S.throwWrist, throwDirSign));
    }
    for (let k = 0; k < laybacks.length; k++) {
      if (laybacks[k] === null) continue;
      let sum = 0;
      let cnt = 0;
      for (let d = -1; d <= 1; d++) {
        const v = laybacks[k + d];
        if (v !== null && v !== undefined) {
          sum += v;
          cnt++;
        }
      }
      const smoothedLb = sum / cnt;
      if (smoothedLb > bestLayback) {
        bestLayback = smoothedLb;
        laybackIdx = footStrikeIdx + 1 + k;
      }
    }
  }
  if (laybackIdx === -1) {
    laybackIdx = Math.max(footStrikeIdx + 1, releaseIdx - Math.round(scale / 2));
    bestLayback = NaN;
  }

  let laybackConfidence: number;
  {
    const vis = meanVisibility(frames[laybackIdx], armKeys);
    const measured = Number.isFinite(bestLayback);
    laybackConfidence = clamp(
      Math.round(
        (measured ? 30 : 5) +
          (measured && bestLayback > 110 ? 15 : 5) +
          (laybackIdx > footStrikeIdx && laybackIdx <= releaseIdx ? 15 : 0) +
          vis * 40
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 4. LEG LIFT, peak lead-knee height before foot strike
  // ==========================================================
  let legLiftIdx = 0;
  let bestLift = -Infinity;
  for (let i = 0; i < footStrikeIdx; i++) {
    const hip = kpAt(frames[i], S.leadHip);
    const knee = kpAt(frames[i], S.leadKnee);
    if (!hip || !knee) continue;
    const lift = hip.y - knee.y; // positive = knee above hip
    if (lift > bestLift) {
      bestLift = lift;
      legLiftIdx = i;
    }
  }

  let legLiftConfidence: number;
  {
    const vis = meanVisibility(frames[legLiftIdx], legKeys);
    legLiftConfidence = clamp(
      Math.round(
        (bestLift > 0.1 ? 35 : bestLift > 0.04 ? 20 : 8) +
          (legLiftIdx < footStrikeIdx ? 15 : 0) +
          vis * 40
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 5. DRIFT, onset of sustained pelvis travel after leg lift
  // ==========================================================
  let driftIdx = Math.min(legLiftIdx + 1, footStrikeIdx - 1);
  let driftFound = false;
  {
    const MOMENTUM = 0.002;
    const hipX: (number | null)[] = frames.map((f) => {
      const a = kpAt(f, S.leadHip);
      const b = kpAt(f, S.backHip);
      if (a && b) return (a.x + b.x) / 2;
      return a?.x ?? b?.x ?? null;
    });
    for (let i = legLiftIdx + 1; i < footStrikeIdx - 1; i++) {
      let forward = 0;
      for (let j = 0; j < 3 && i + j < n; j++) {
        const x0 = hipX[i + j - 1];
        const x1 = hipX[i + j];
        if (x0 === null || x1 === null) continue;
        if ((x1 - x0) * throwDirSign > MOMENTUM) forward++;
      }
      if (forward >= 2) {
        driftIdx = i;
        driftFound = true;
        break;
      }
    }
  }
  driftIdx = clamp(driftIdx, legLiftIdx + 1, Math.max(legLiftIdx + 1, footStrikeIdx - 1));

  let driftConfidence: number;
  {
    const vis = meanVisibility(frames[driftIdx], legKeys);
    driftConfidence = clamp(
      Math.round((driftFound ? 35 : 12) + (driftIdx > legLiftIdx ? 20 : 0) + vis * 40),
      0,
      100
    );
  }

  // ==========================================================
  // 6. DECELERATION, wrist speed decays after release
  // ==========================================================
  let decelIdx = Math.min(releaseIdx + 2 * scale, n - 1);
  let decelConfidence = 50;
  {
    const relSpeed = wristSm[releaseIdx] || anchorPeak;
    const threshold = relSpeed * 0.3;
    for (let i = releaseIdx + 2; i < Math.min(releaseIdx + 5 * scale, n); i++) {
      if (wristSm[i] < threshold) {
        decelIdx = i;
        decelConfidence = 75;
        break;
      }
    }
  }

  // ==========================================================
  // ORDERING (holds by construction; clamps are a final guard)
  // ==========================================================
  let lift = clamp(legLiftIdx, 0, n - 1);
  let drift = clamp(Math.max(driftIdx, lift + 1), 0, n - 1);
  let fs = clamp(Math.max(footStrikeIdx, drift + 1), 0, n - 1);
  let mer = clamp(Math.max(laybackIdx, fs + 1), 0, n - 1);
  let rel = clamp(Math.max(releaseIdx, mer), 0, n - 1);
  let dec = clamp(Math.max(decelIdx, rel + 1), 0, n - 1);

  // Tag frames
  frames[lift].phase = "legLift";
  frames[drift].phase = "drift";
  frames[fs].phase = "footStrike";
  frames[mer].phase = "mer";
  frames[rel].phase = "release";
  frames[dec].phase = "deceleration";

  if (typeof console !== "undefined") {
    console.log("[PhaseDetector] Throw-anchored results:", {
      anchor: anchorIdx,
      burstScale: scale,
      legLift: lift,
      drift,
      footStrike: fs,
      maxLayback: mer,
      release: rel,
      deceleration: dec,
      fsMethod,
      releaseMethod,
      laybackDeg: Number.isFinite(bestLayback) ? Math.round(bestLayback) : null,
      throwDirection: throwDirSign > 0 ? "→ right" : "← left",
      totalFrames: n,
    });
  }

  const mk = (idx: number, confidence: number) => ({
    frameIndex: idx,
    confidence,
    timestampMs: frames[idx]?.timestampMs ?? 0,
  });

  return {
    legLift: mk(lift, legLiftConfidence),
    drift: mk(drift, driftConfidence),
    footStrike: mk(fs, footStrikeConfidence),
    mer: mk(mer, laybackConfidence),
    release: mk(rel, releaseConfidence),
    deceleration: mk(dec, decelConfidence),
  };
}

/** Exposed for biomechanics: throw direction sign used by the detector. */
export function resolveThrowDirection(
  frames: ValidFrame[],
  throwingHand: "left" | "right",
  aroundIdx: number
): number {
  const n = frames.length;
  const S = getSideKeys(throwingHand);
  let sign = throwingHand === "right" ? -1 : 1;
  const early = Math.max(0, aroundIdx - Math.round(n * 0.3));
  const late = Math.min(n - 1, aroundIdx + Math.round(n * 0.05));
  const hipA = kpAt(frames[early], S.leadHip) || kpAt(frames[early], S.backHip);
  const hipB = kpAt(frames[late], S.leadHip) || kpAt(frames[late], S.backHip);
  if (hipA && hipB && Math.abs(hipB.x - hipA.x) > 0.015) {
    sign = hipB.x - hipA.x > 0 ? 1 : -1;
  }
  return sign;
}
