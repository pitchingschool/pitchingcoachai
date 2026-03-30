/**
 * PitchingCoachAI — Advanced Phase Detection
 *
 * Detects 4 key phases + internal leg-lift anchor:
 *   1. Leg Lift (anchor — not shown to user, used to sequence other phases)
 *   2. Drift Move — peak hip lead while lead foot is still elevated
 *   3. Front Foot Strike — lead ankle deceleration + ground contact
 *   4. Maximum External Rotation — peak forearm layback after foot strike
 *   5. Ball Release — peak wrist forward velocity after MER
 *
 * Each phase includes a confidence score (0-100).
 */

import {
  type ValidFrame,
  type DetectedPhases,
  type PhaseResult,
  type Point2D,
  getSideKeys,
} from "./types";

// ============================================================
// GEOMETRY HELPERS
// ============================================================

function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function velocity(prev: Point2D, curr: Point2D): Point2D {
  return { x: curr.x - prev.x, y: curr.y - prev.y };
}

function speed(prev: Point2D, curr: Point2D): number {
  return dist(prev, curr);
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angle3pt(a: Point2D, vertex: Point2D, c: Point2D): number {
  const ba = { x: a.x - vertex.x, y: a.y - vertex.y };
  const bc = { x: c.x - vertex.x, y: c.y - vertex.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Angle of the forearm (elbow→wrist vector) relative to straight up (vertical).
 * 0° = forearm pointing straight up.
 * 90° = forearm horizontal.
 * 140-180° = forearm laid back behind the head (MER territory).
 */
function forearmAngleFromVertical(elbow: Point2D, wrist: Point2D): number {
  const fx = wrist.x - elbow.x;
  const fy = wrist.y - elbow.y;
  // Vertical reference = straight up = (0, -1) in screen coords
  const dot = fy * -1; // dot product with (0, -1)
  const mag = Math.sqrt(fx * fx + fy * fy);
  if (mag === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Angle between the trunk line (hip→shoulder) and the forearm (elbow→wrist).
 * At MER, trunk has rotated toward plate but forearm still points backward
 * = maximum separation angle.
 */
function trunkForearmSeparation(
  hip: Point2D,
  shoulder: Point2D,
  elbow: Point2D,
  wrist: Point2D
): number {
  const tx = shoulder.x - hip.x;
  const ty = shoulder.y - hip.y;
  const fx = wrist.x - elbow.x;
  const fy = wrist.y - elbow.y;
  const dot = tx * fx + ty * fy;
  const magT = Math.sqrt(tx * tx + ty * ty);
  const magF = Math.sqrt(fx * fx + fy * fy);
  if (magT === 0 || magF === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magT * magF)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Project wrist position relative to elbow onto the throwing direction.
 * Negative = wrist is BEHIND elbow (toward second base) = layback.
 * Most negative value = peak MER.
 */
function wristBehindElbow(
  elbow: Point2D,
  wrist: Point2D,
  throwDirSign: number
): number {
  // Horizontal component of elbow-to-wrist in throwing direction
  return (wrist.x - elbow.x) * throwDirSign;
}

/**
 * Simple gaussian-like smoothing of a score array.
 * Uses a weighted average of ±2 neighbors to avoid picking noisy outliers.
 */
function smoothScores(scores: number[], sigma: number = 2): number[] {
  const n = scores.length;
  if (n === 0) return [];
  const result = new Array(n).fill(0);
  const radius = Math.ceil(sigma * 2);
  for (let i = 0; i < n; i++) {
    let weightSum = 0;
    let valSum = 0;
    for (let j = -radius; j <= radius; j++) {
      const idx = i + j;
      if (idx < 0 || idx >= n) continue;
      const w = Math.exp(-(j * j) / (2 * sigma * sigma));
      valSum += scores[idx] * w;
      weightSum += w;
    }
    result[i] = weightSum > 0 ? valSum / weightSum : 0;
  }
  return result;
}

function meanVisibility(frame: ValidFrame, keys: string[]): number {
  let sum = 0;
  let count = 0;
  for (const k of keys) {
    if (frame.keypoints[k]) {
      sum += frame.keypoints[k].visibility;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Get the best visibility score for a frame, checking ±2 neighbors
 * if the target frame's visibility is below threshold.
 * Returns the best mean visibility found.
 */
function bestVisibility(
  frames: ValidFrame[],
  idx: number,
  keys: string[],
  threshold = 0.5
): number {
  const vis = meanVisibility(frames[idx], keys);
  if (vis >= threshold) return vis;

  let best = vis;
  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    const j = idx + offset;
    if (j < 0 || j >= frames.length) continue;
    best = Math.max(best, meanVisibility(frames[j], keys));
  }
  return best;
}

// ============================================================
// MAIN PHASE DETECTION
// ============================================================

export function detectPhases(
  frames: ValidFrame[],
  throwingHand: "left" | "right" = "right"
): DetectedPhases {
  const n = frames.length;
  const S = getSideKeys(throwingHand);

  // Key landmark groups for confidence
  const armKeys = [S.throwShoulder, S.throwElbow, S.throwWrist];
  const legKeys = [S.leadHip, S.leadKnee, S.leadAnkle, S.backHip, S.backKnee, S.backAnkle];
  const allKeys = [...armKeys, ...legKeys, "nose"];

  // ==========================================================
  // 1. LEG LIFT — peak lead knee height (min Y = highest point)
  // ==========================================================
  let bestLiftScore = -Infinity;
  let legLiftIdx = 0;

  // Only search first 60% of frames for leg lift
  const liftSearchEnd = Math.min(Math.round(n * 0.6), n);
  for (let i = 0; i < liftSearchEnd; i++) {
    const kp = frames[i].keypoints;
    const hipY = kp[S.leadHip]?.y ?? 1;
    const kneeY = kp[S.leadKnee]?.y ?? 1;
    // Score = how far knee is above hip (lower Y = higher in frame)
    const liftScore = hipY - kneeY;
    if (liftScore > bestLiftScore) {
      bestLiftScore = liftScore;
      legLiftIdx = i;
    }
  }

  // Leg lift confidence
  let legLiftConfidence = 50;
  {
    const peakScore = bestLiftScore;
    const nearby: number[] = [];
    for (let j = Math.max(0, legLiftIdx - 5); j <= Math.min(n - 1, legLiftIdx + 5); j++) {
      if (j === legLiftIdx) continue;
      const kp = frames[j].keypoints;
      nearby.push((kp[S.leadHip]?.y ?? 1) - (kp[S.leadKnee]?.y ?? 1));
    }
    const avgNearby = nearby.length > 0 ? nearby.reduce((a, b) => a + b, 0) / nearby.length : peakScore;
    const peakClarity = peakScore - avgNearby;
    const vis = bestVisibility(frames, legLiftIdx, legKeys);
    legLiftConfidence = clamp(Math.round(
      (peakClarity > 0.05 ? 40 : peakClarity > 0.02 ? 25 : 10) +
      (bestLiftScore > 0.12 ? 30 : bestLiftScore > 0.06 ? 20 : 5) +
      vis * 30
    ), 0, 100);
  }

  // ==========================================================
  // 2. DRIFT MOVE — first frame of forward momentum initiation
  //
  // Ben Brewster's key concept: the drift is NOT max hip lead,
  // it's the INITIATION of forward movement. We detect the first
  // frame after leg lift where hip midpoint has sustained forward
  // velocity (hips begin translating toward the plate while the
  // lead foot is still elevated).
  // ==========================================================
  let driftIdx = legLiftIdx;
  let driftConfidence = 30;

  // Search from leg lift to ~50% of remaining frames
  const driftSearchEnd = Math.min(legLiftIdx + Math.round((n - legLiftIdx) * 0.5), n - 1);

  // Compute hip midpoints and forward velocities for the search window
  const hipMids: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const kp = frames[i].keypoints;
    hipMids.push(midpoint(
      kp[S.leadHip] || { x: 0.5, y: 0.5 },
      kp[S.backHip] || { x: 0.5, y: 0.5 }
    ));
  }

  // Determine throw direction from hip translation (leg lift → later frames).
  // Hips always move toward the plate during delivery — much more reliable
  // than wrist movement which follows a complex arc.
  let throwDirSign = throwingHand === "right" ? -1 : 1;
  {
    const hipAtLift = hipMids[legLiftIdx];
    // Sample hip position ~60% through clip (should be well past foot strike)
    const laterIdx = Math.min(Math.round(n * 0.6), n - 1);
    const hipLater = hipMids[laterIdx];
    if (Math.abs(hipLater.x - hipAtLift.x) > 0.02) {
      throwDirSign = hipLater.x - hipAtLift.x > 0 ? 1 : -1;
    }
  }

  // Find first frame after leg lift with sustained forward hip velocity
  // "Sustained" = at least 2 of 3 consecutive frames show forward movement
  const MOMENTUM_THRESHOLD = 0.002; // minimum per-frame hip displacement
  let driftFound = false;

  for (let i = legLiftIdx + 1; i <= driftSearchEnd - 2; i++) {
    const kp = frames[i].keypoints;
    const leadKnee = kp[S.leadKnee] || { x: 0.5, y: 0.7 };
    const leadAnkle = kp[S.leadAnkle] || { x: 0.5, y: 0.9 };

    // Lead foot must still be elevated
    const kneeAboveAnkle = leadAnkle.y - leadKnee.y;
    if (kneeAboveAnkle < 0.03) continue;

    // Check 3 consecutive frames for sustained forward velocity
    let forwardCount = 0;
    for (let j = 0; j < 3 && i + j < n; j++) {
      const dx = (hipMids[i + j].x - hipMids[i + j - 1].x) * throwDirSign;
      if (dx > MOMENTUM_THRESHOLD) forwardCount++;
    }

    if (forwardCount >= 2) {
      driftIdx = i;
      driftFound = true;
      break; // First frame of sustained momentum = drift initiation
    }
  }

  // Fallback: if no sustained momentum found, use max hip lead (old method)
  if (!driftFound) {
    let bestDriftScore = -Infinity;
    for (let i = legLiftIdx; i <= driftSearchEnd; i++) {
      const kp = frames[i].keypoints;
      const leadKnee = kp[S.leadKnee] || { x: 0.5, y: 0.7 };
      const leadAnkle = kp[S.leadAnkle] || { x: 0.5, y: 0.9 };
      const kneeAboveAnkle = leadAnkle.y - leadKnee.y;
      if (kneeAboveAnkle < 0.03) continue;

      const backAnkle = kp[S.backAnkle] || { x: 0.5, y: 0.9 };
      const hipLead = Math.abs(hipMids[i].x - backAnkle.x);
      if (hipLead > bestDriftScore) {
        bestDriftScore = hipLead;
        driftIdx = i;
      }
    }
  }

  // Drift confidence
  {
    const vis = bestVisibility(frames, driftIdx, [...legKeys, S.backAnkle]);
    const isAfterLift = driftIdx > legLiftIdx;
    driftConfidence = clamp(Math.round(
      (isAfterLift ? 25 : 0) +
      (driftFound ? 35 : 10) +
      vis * 40
    ), 0, 100);
  }

  // ==========================================================
  // 3. FRONT FOOT STRIKE — ankle Y plateau (first ground contact)
  //
  // Primary: derivative approach — find the first frame where
  // the lead ankle's downward velocity drops to near zero after
  // it was moving downward (ankle Y plateaus at ground level).
  // This is the exact moment the foot plants.
  // Secondary: deceleration spike + stride spread as fallback.
  // ==========================================================
  let footStrikeIdx = Math.round(n * 0.4); // fallback
  let footStrikeConfidence = 20;

  // Find max lead ankle Y (ground level reference)
  let maxLeadAnkleY = 0;
  for (let i = legLiftIdx; i < n; i++) {
    const ay = frames[i].keypoints[S.leadAnkle]?.y ?? 0;
    maxLeadAnkleY = Math.max(maxLeadAnkleY, ay);
  }

  const fsSearchStart = driftIdx;
  const fsSearchEnd = Math.min(legLiftIdx + Math.round(n * 0.65), n - 2);

  // Method A: Ankle Y plateau — find first frame where ankle downward
  // velocity drops to near zero while ankle is near ground level.
  // This catches the EXACT first frame of ground contact.
  let plateauFC = -1;
  const PLATEAU_VY_THRESHOLD = 0.003; // near-zero vertical velocity
  const GROUND_PROXIMITY = 0.88; // ankle must be within 88% of max Y

  for (let i = fsSearchStart + 2; i < fsSearchEnd; i++) {
    const prev2Ankle = frames[i - 2]?.keypoints[S.leadAnkle];
    const prevAnkle = frames[i - 1].keypoints[S.leadAnkle];
    const currAnkle = frames[i].keypoints[S.leadAnkle];
    if (!prev2Ankle || !prevAnkle || !currAnkle) continue;

    // Ankle must be near ground level
    if (currAnkle.y < maxLeadAnkleY * GROUND_PROXIMITY) continue;

    // Must have meaningful stride spread
    const backAnkle = frames[i].keypoints[S.backAnkle];
    if (!backAnkle) continue;
    const strideSpread = Math.abs(currAnkle.x - backAnkle.x);
    if (strideSpread < 0.06) continue;

    // Check that ankle WAS moving down in prior frames
    const prevVy = currAnkle.y - prev2Ankle.y; // positive = was moving down over 2 frames
    if (prevVy < 0.005) continue; // ankle wasn't coming down meaningfully

    // Current vertical velocity (should be near zero = plateau)
    const currVy = Math.abs(currAnkle.y - prevAnkle.y);
    if (currVy < PLATEAU_VY_THRESHOLD) {
      plateauFC = i;
      break; // First plateau = foot strike moment
    }
  }

  // Method B: Velocity deceleration spike (fallback)
  let bestDecelScore = -Infinity;
  let decelFC = -1;

  for (let i = fsSearchStart + 1; i < fsSearchEnd; i++) {
    const prevAnkle = frames[i - 1].keypoints[S.leadAnkle];
    const currAnkle = frames[i].keypoints[S.leadAnkle];
    const nextAnkle = frames[i + 1]?.keypoints[S.leadAnkle];
    if (!prevAnkle || !currAnkle || !nextAnkle) continue;

    if (currAnkle.y < maxLeadAnkleY * GROUND_PROXIMITY) continue;

    const backAnkle = frames[i].keypoints[S.backAnkle];
    if (!backAnkle) continue;
    const strideSpread = Math.abs(currAnkle.x - backAnkle.x);
    if (strideSpread < 0.06) continue;

    const prevSpeed = speed(prevAnkle, currAnkle);
    const nextSpeed = speed(currAnkle, nextAnkle);
    const decel = prevSpeed - nextSpeed;

    const score = decel * 5 + strideSpread * 3 + (currAnkle.y / maxLeadAnkleY) * 1;
    if (score > bestDecelScore) {
      bestDecelScore = score;
      decelFC = i;
    }
  }

  // Pick the best method — prefer plateau (Method A) as it's more precise
  if (plateauFC > 0) {
    footStrikeIdx = plateauFC;
    footStrikeConfidence = 75; // high base confidence for plateau detection
  } else if (decelFC > 0 && bestDecelScore > 0.1) {
    footStrikeIdx = decelFC;
    footStrikeConfidence = clamp(Math.round(45 + bestDecelScore * 30), 45, 85);
  }

  // Boost confidence with visibility (using neighbor-aware check)
  {
    const vis = bestVisibility(frames, footStrikeIdx, legKeys);
    footStrikeConfidence = clamp(Math.round(footStrikeConfidence * 0.7 + vis * 30), 0, 100);
  }

  // ==========================================================
  // 4. OLD MER ANCHOR — wrist at highest point near foot strike
  //
  // This detection consistently finds the FOOT STRIKE frame
  // (user-validated). We keep it solely as the anchor for the
  // remapped foot strike position. The ACTUAL MER is detected
  // via composite scoring after the remap (see below).
  // ==========================================================
  let oldMerIdx = Math.round(n * 0.6); // fallback
  {
    const merSearchStart = Math.max(footStrikeIdx - 2, driftIdx);
    const merSearchEnd = Math.min(footStrikeIdx + Math.round(n * 0.25), n - 1);
    let bestScore = -Infinity;

    for (let i = merSearchStart; i <= merSearchEnd; i++) {
      const kp = frames[i].keypoints;
      const shoulder = kp[S.throwShoulder];
      const elbow = kp[S.throwElbow];
      const wrist = kp[S.throwWrist];
      if (!shoulder || !elbow || !wrist) continue;

      const elbowShoulderDiff = Math.abs(elbow.y - shoulder.y);
      if (elbowShoulderDiff > 0.15) continue;
      if (wrist.y > elbow.y) continue;

      const wristHeightScore = (1 - wrist.y) * 40;
      const elbowAlignScore = (1 - elbowShoulderDiff / 0.15) * 25;
      const elbowAngle = angle3pt(shoulder, elbow, wrist);
      const elbowAngleScore = Math.max(0, 20 - Math.abs(elbowAngle - 90) * 0.4);
      const laybackScore = (elbow.y - wrist.y) * 15;
      const temporalScore = Math.max(0, 10 - Math.abs(i - footStrikeIdx) * 0.5);
      const totalScore = wristHeightScore + elbowAlignScore + elbowAngleScore + laybackScore + temporalScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        oldMerIdx = i;
      }
    }
  }

  // Old release anchor — peak wrist speed after old MER
  // This consistently finds the MER frame (user-validated).
  // Used as a fallback reference for the remap.
  let oldReleaseIdx = Math.min(oldMerIdx + 5, n - 1);
  {
    const relSearchStart = oldMerIdx + 1;
    const relSearchEnd = Math.min(oldMerIdx + 20, n - 1);
    let bestScore = -Infinity;
    const oMerWristY = frames[oldMerIdx]?.keypoints[S.throwWrist]?.y ?? 0.3;
    const oMerShoulderY = frames[oldMerIdx]?.keypoints[S.throwShoulder]?.y ?? 0.5;

    for (let i = relSearchStart; i < relSearchEnd; i++) {
      const kp = frames[i].keypoints;
      const prevKp = frames[i - 1].keypoints;
      const wrist = kp[S.throwWrist];
      const prevWrist = prevKp[S.throwWrist];
      const elbow = kp[S.throwElbow];
      const shoulder = kp[S.throwShoulder];
      if (!wrist || !prevWrist || !elbow || !shoulder) continue;

      if (wrist.y < oMerWristY) continue;
      if (wrist.y > oMerShoulderY + 0.18) continue;

      const wristSpeed = speed(prevWrist, wrist);
      const elbowAngle = angle3pt(shoulder, elbow, wrist);
      const extensionScore = elbowAngle > 150 ? 25 : elbowAngle > 130 ? 20 : elbowAngle > 110 ? 10 : 0;
      const wristForward = (wrist.x - elbow.x) * throwDirSign;
      const forwardScore = wristForward > 0 ? 15 : 0;
      const totalScore = wristSpeed * 120 + extensionScore + forwardScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        oldReleaseIdx = i;
      }
    }
  }

  // ==========================================================
  // REMAP PHASES — detection is consistently one phase behind
  //
  // User validation confirmed:
  //   detected "drift"      → actually shows Leg Lift
  //   detected "footStrike" → actually shows Drift
  //   detected "mer"(old)   → actually shows Foot Strike
  //   detected "release"(old) → actually shows MER (but quality was bad)
  //
  // MER is now re-detected via 5-metric composite scoring for
  // much better accuracy. Release is detected after composite MER.
  // ==========================================================
  const remapped = {
    legLiftIdx: driftIdx,
    legLiftConf: driftConfidence,
    driftIdx: footStrikeIdx,
    driftConf: footStrikeConfidence,
    footStrikeIdx: oldMerIdx,           // old MER → foot strike (user confirmed)
    footStrikeConf: 65,                 // good confidence — user validated this mapping
    merIdx: oldReleaseIdx,              // placeholder — will be overwritten by composite
    merConf: 20,
  };

  // ==========================================================
  // NEW MER via composite scoring — after remapped foot strike
  //
  // Key biomechanical constraints that separate MER from Release:
  //   - At MER: elbow ~90° flexion, wrist BEHIND elbow, arm cocked
  //   - At Release: elbow extending (>130°), wrist AHEAD of elbow
  //
  // Hard gates to exclude release-like frames:
  //   1. Elbow flexion must be < 130° (arm still bent, not extending)
  //   2. Wrist must NOT be significantly ahead of elbow in throw dir
  //
  // Tighter search window: MER happens within ~10 frames of FFS.
  // Rebalanced weights to favor MER-specific signals.
  // ==========================================================
  {
    const compositeMerSearchStart = Math.max(remapped.footStrikeIdx - 2, remapped.driftIdx);
    const compositeMerSearchEnd = Math.min(remapped.footStrikeIdx + 12, n - 1);
    const windowSize = compositeMerSearchEnd - compositeMerSearchStart + 1;
    const rawScores: number[] = new Array(windowSize).fill(0);
    const debugRows: Array<{
      frame: number;
      forearmAngle: number;
      elbowFlex: number;
      elbowHeight: number;
      trunkSep: number;
      wristBehind: number;
      wristAboveElbow: boolean;
      gated: boolean;
      raw: number;
    }> = [];

    for (let i = compositeMerSearchStart; i <= compositeMerSearchEnd; i++) {
      const kp = frames[i].keypoints;
      const shoulder = kp[S.throwShoulder];
      const elbow = kp[S.throwElbow];
      const wrist = kp[S.throwWrist];
      const hip = kp[S.backHip] || kp[S.leadHip];
      if (!shoulder || !elbow || !wrist || !hip) continue;

      // === HARD GATES — exclude release-like frames ===

      // Gate 1: Elbow must still be bent (not extending toward release)
      const elbowFlex = angle3pt(shoulder, elbow, wrist);
      const gateElbow = elbowFlex < 135;

      // Gate 2: Wrist must NOT be far ahead of elbow in throw direction
      // At release, wrist is well ahead. At MER, wrist is behind or near.
      const wbe = wristBehindElbow(elbow, wrist, throwDirSign);
      const gateWrist = wbe < 0.04; // wrist not significantly forward

      // Gate 3: Wrist should be above or near elbow height (arm cocked up)
      // At release, wrist drops below elbow
      const wristAbove = wrist.y <= elbow.y + 0.05;

      const gated = !gateElbow || !gateWrist || !wristAbove;

      // === METRICS ===

      // Metric 1: Forearm angle from vertical (weight 0.20)
      // At MER forearm points up/back. Useful but reduced weight
      // since it can also score high at release.
      const faAngle = forearmAngleFromVertical(elbow, wrist);
      const faScore = faAngle / 180;

      // Metric 2: Elbow flexion near 90° (weight 0.25) — INCREASED
      // The strongest MER-vs-release signal. At MER = ~90°, at release = 150°+
      const flexDiff = Math.abs(elbowFlex - 90);
      const flexScore = Math.max(0, 1 - flexDiff / 60); // sharper falloff

      // Metric 3: Elbow height ≈ shoulder height (weight 0.10)
      const elbowHeightDiff = Math.abs(elbow.y - shoulder.y);
      const heightScore = Math.max(0, 1 - elbowHeightDiff / 0.15);

      // Metric 4: Trunk-forearm separation (weight 0.20)
      const tfs = trunkForearmSeparation(hip, shoulder, elbow, wrist);
      const tfsScore = tfs / 180;

      // Metric 5: Wrist behind elbow (weight 0.25) — INCREASED
      // This is the key MER differentiator. More negative = more layback.
      // At MER: wbe is negative (wrist behind). At release: positive (wrist ahead).
      const wbeScore = clamp(0.5 - wbe * 3.0, 0, 1);

      // === COMPOSITE ===
      let composite =
        faScore * 0.20 +
        flexScore * 0.25 +
        heightScore * 0.10 +
        tfsScore * 0.20 +
        wbeScore * 0.25;

      // Apply gate penalty — gated frames get heavily penalized
      if (gated) {
        composite *= 0.15;
      }

      rawScores[i - compositeMerSearchStart] = composite;
      debugRows.push({
        frame: i,
        forearmAngle: Math.round(faAngle),
        elbowFlex: Math.round(elbowFlex),
        elbowHeight: Math.round(elbowHeightDiff * 1000) / 1000,
        trunkSep: Math.round(tfs),
        wristBehind: Math.round(wbe * 1000) / 1000,
        wristAboveElbow: wristAbove,
        gated,
        raw: Math.round(composite * 1000) / 1000,
      });
    }

    const smoothed = smoothScores(rawScores, 1.5);
    let bestScore = -Infinity;
    let bestIdx = remapped.footStrikeIdx + 2; // fallback
    for (let j = 0; j < windowSize; j++) {
      if (smoothed[j] > bestScore) {
        bestScore = smoothed[j];
        bestIdx = compositeMerSearchStart + j;
      }
    }

    remapped.merIdx = bestIdx;

    // MER confidence
    const vis = bestVisibility(frames, bestIdx, armKeys);
    const afterFS = bestIdx >= remapped.footStrikeIdx - 1;
    const temporalOk = bestIdx - remapped.footStrikeIdx >= 0 && bestIdx - remapped.footStrikeIdx <= 10;
    const goodScore = bestScore > 0.4;
    const greatScore = bestScore > 0.55;

    remapped.merConf = clamp(Math.round(
      (afterFS ? 15 : 0) +
      (temporalOk ? 10 : 5) +
      (goodScore ? 15 : 5) +
      (greatScore ? 15 : 0) +
      vis * 30 +
      15
    ), 0, 100);

    if (typeof console !== "undefined") {
      console.log("[MER Composite] FFS@" + remapped.footStrikeIdx + " → Search:", compositeMerSearchStart, "→", compositeMerSearchEnd);
      for (const d of debugRows) {
        const si = d.frame - compositeMerSearchStart;
        const sm = smoothed[si] ?? 0;
        const marker = d.frame === bestIdx ? " ★ PEAK" : "";
        const gate = d.gated ? " [GATED]" : "";
        const above = d.wristAboveElbow ? "↑" : "↓";
        console.log(
          `  f${d.frame}: EF=${d.elbowFlex}° WB=${d.wristBehind} ${above} FA=${d.forearmAngle}° TS=${d.trunkSep}° raw=${d.raw} sm=${Math.round(sm * 1000) / 1000}${gate}${marker}`
        );
      }
      console.log("[MER Composite] Selected:", bestIdx, "(+" + (bestIdx - remapped.footStrikeIdx) + " from FFS)", "score:", Math.round(bestScore * 1000) / 1000);
    }
  }

  // ==========================================================
  // RELEASE DETECTION — ball leaving hand after composite MER
  //
  // After the composite MER, find the ball release point:
  //   1. Peak wrist speed (arm whip)
  //   2. Wrist has dropped below MER wrist height
  //   3. Arm is extending (elbow angle > 110°)
  //   4. Wrist is still in the release zone (not follow-through)
  // ==========================================================
  let newReleaseIdx = Math.min(remapped.merIdx + 5, n - 1);
  let newReleaseConfidence = 20;

  const newRelSearchStart = remapped.merIdx + 1;
  const newRelSearchEnd = Math.min(remapped.merIdx + 20, n - 1);
  let bestNewReleaseScore = -Infinity;

  const newMerWristY = frames[remapped.merIdx]?.keypoints[S.throwWrist]?.y ?? 0.3;
  const newMerShoulderY = frames[remapped.merIdx]?.keypoints[S.throwShoulder]?.y ?? 0.5;
  const newMerNoseY = frames[remapped.merIdx]?.keypoints.nose?.y ?? 0.25;
  const newMaxWristYForRelease = newMerShoulderY + 0.25;

  for (let i = newRelSearchStart; i < newRelSearchEnd; i++) {
    const kp = frames[i].keypoints;
    const prevKp = frames[i - 1].keypoints;
    const wrist = kp[S.throwWrist];
    const prevWrist = prevKp[S.throwWrist];
    const elbow = kp[S.throwElbow];
    const shoulder = kp[S.throwShoulder];
    if (!wrist || !prevWrist || !elbow || !shoulder) continue;

    // Wrist must have dropped below MER height (arm came forward)
    if (wrist.y < newMerWristY) continue;

    // Wrist must NOT be too low (follow-through)
    if (wrist.y > newMaxWristYForRelease) continue;

    // Wrist speed
    const wristSpeed = speed(prevWrist, wrist);

    // Elbow extension
    const elbowAngle = angle3pt(shoulder, elbow, wrist);
    const extensionScore = elbowAngle > 150 ? 25 : elbowAngle > 130 ? 20 : elbowAngle > 110 ? 10 : 0;

    // Wrist forward of elbow
    const wristForward = (wrist.x - elbow.x) * throwDirSign;
    const forwardScore = wristForward > 0 ? 15 : 0;

    // Height score: prefer wrist near shoulder level
    const idealY = (newMerNoseY + newMerShoulderY) / 2;
    const heightDiff = Math.abs(wrist.y - idealY);
    const heightScore = Math.max(0, 15 - heightDiff * 50);

    const speedScore = wristSpeed * 120;
    const totalScore = speedScore + extensionScore + forwardScore + heightScore;

    if (totalScore > bestNewReleaseScore) {
      bestNewReleaseScore = totalScore;
      newReleaseIdx = i;
    }
  }

  // Release confidence
  {
    const vis = bestVisibility(frames, newReleaseIdx, armKeys);
    const afterMER = newReleaseIdx > remapped.merIdx;
    const temporalOk = newReleaseIdx - remapped.merIdx >= 1 && newReleaseIdx - remapped.merIdx <= 12;

    newReleaseConfidence = clamp(Math.round(
      (afterMER ? 20 : 0) +
      (temporalOk ? 20 : 5) +
      (bestNewReleaseScore > 0.5 ? 20 : 10) +
      vis * 30
    ), 0, 100);
  }

  // ==========================================================
  // ENFORCE TEMPORAL ORDERING on remapped phases
  // ==========================================================
  if (remapped.driftIdx <= remapped.legLiftIdx)
    remapped.driftIdx = Math.min(remapped.legLiftIdx + 1, n - 1);
  if (remapped.footStrikeIdx <= remapped.driftIdx)
    remapped.footStrikeIdx = Math.min(remapped.driftIdx + 1, n - 1);
  if (remapped.merIdx <= remapped.footStrikeIdx)
    remapped.merIdx = Math.min(remapped.footStrikeIdx + 1, n - 1);
  if (newReleaseIdx <= remapped.merIdx)
    newReleaseIdx = Math.min(remapped.merIdx + 1, n - 1);

  // ==========================================================
  // TAG FRAMES WITH THEIR PHASE
  // ==========================================================
  if (remapped.legLiftIdx < n) frames[remapped.legLiftIdx].phase = "legLift";
  if (remapped.driftIdx < n) frames[remapped.driftIdx].phase = "drift";
  if (remapped.footStrikeIdx < n) frames[remapped.footStrikeIdx].phase = "footStrike";
  if (remapped.merIdx < n) frames[remapped.merIdx].phase = "mer";
  if (newReleaseIdx < n) frames[newReleaseIdx].phase = "release";

  // Console debug output for validation
  if (typeof console !== "undefined") {
    console.log("[PhaseDetector] Remapped Results:", {
      legLift: remapped.legLiftIdx,
      drift: remapped.driftIdx,
      footStrike: remapped.footStrikeIdx,
      mer: remapped.merIdx,
      release: newReleaseIdx,
      totalFrames: n,
      throwDirection: throwDirSign > 0 ? "→ right" : "← left",
    });
  }

  return {
    legLift: {
      frameIndex: remapped.legLiftIdx,
      confidence: remapped.legLiftConf,
      timestampMs: frames[remapped.legLiftIdx]?.timestampMs ?? 0,
    },
    drift: {
      frameIndex: remapped.driftIdx,
      confidence: remapped.driftConf,
      timestampMs: frames[remapped.driftIdx]?.timestampMs ?? 0,
    },
    footStrike: {
      frameIndex: remapped.footStrikeIdx,
      confidence: remapped.footStrikeConf,
      timestampMs: frames[remapped.footStrikeIdx]?.timestampMs ?? 0,
    },
    mer: {
      frameIndex: remapped.merIdx,
      confidence: remapped.merConf,
      timestampMs: frames[remapped.merIdx]?.timestampMs ?? 0,
    },
    release: {
      frameIndex: newReleaseIdx,
      confidence: newReleaseConfidence,
      timestampMs: frames[newReleaseIdx]?.timestampMs ?? 0,
    },
  };
}
