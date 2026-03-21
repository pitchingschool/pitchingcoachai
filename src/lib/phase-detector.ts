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
    const vis = meanVisibility(frames[legLiftIdx], legKeys);
    legLiftConfidence = clamp(Math.round(
      (peakClarity > 0.05 ? 40 : peakClarity > 0.02 ? 25 : 10) +
      (bestLiftScore > 0.12 ? 30 : bestLiftScore > 0.06 ? 20 : 5) +
      vis * 30
    ), 0, 100);
  }

  // ==========================================================
  // 2. DRIFT MOVE — max hip lead while lead foot still elevated
  //
  // Ben Brewster's key concept: hips should begin translating
  // toward the plate BEFORE the lead foot drops. The drift frame
  // is the moment of maximum hip displacement from the back foot
  // while the lead knee is still above mid-hip level.
  // ==========================================================
  let driftIdx = legLiftIdx;
  let bestDriftScore = -Infinity;
  let driftConfidence = 30;

  // Search from leg lift to ~60% of remaining frames
  const driftSearchEnd = Math.min(legLiftIdx + Math.round((n - legLiftIdx) * 0.5), n - 1);

  for (let i = legLiftIdx; i <= driftSearchEnd; i++) {
    const kp = frames[i].keypoints;
    const hipMid = midpoint(kp[S.leadHip] || { x: 0.5, y: 0.5 }, kp[S.backHip] || { x: 0.5, y: 0.5 });
    const backAnkle = kp[S.backAnkle] || { x: 0.5, y: 0.9 };
    const leadAnkle = kp[S.leadAnkle] || { x: 0.5, y: 0.9 };
    const leadKnee = kp[S.leadKnee] || { x: 0.5, y: 0.7 };
    const leadHip = kp[S.leadHip] || { x: 0.5, y: 0.5 };

    // Lead foot must still be elevated (knee above ankle by meaningful amount,
    // or ankle Y significantly less than max ankle Y so far)
    const kneeAboveAnkle = leadAnkle.y - leadKnee.y;
    if (kneeAboveAnkle < 0.03) continue; // foot is too close to ground

    // Hip lead = horizontal distance from hip midpoint to back ankle
    const hipLead = Math.abs(hipMid.x - backAnkle.x);

    // Also factor in forward hip velocity (hips should be moving forward)
    let hipVelocity = 0;
    if (i > 0) {
      const prevHipMid = midpoint(
        frames[i - 1].keypoints[S.leadHip] || { x: 0.5, y: 0.5 },
        frames[i - 1].keypoints[S.backHip] || { x: 0.5, y: 0.5 }
      );
      hipVelocity = Math.abs(hipMid.x - prevHipMid.x);
    }

    const score = hipLead * 3 + hipVelocity * 10 + kneeAboveAnkle * 2;
    if (score > bestDriftScore) {
      bestDriftScore = score;
      driftIdx = i;
    }
  }

  // Drift confidence
  {
    const vis = meanVisibility(frames[driftIdx], [...legKeys, S.backAnkle]);
    const isAfterLift = driftIdx > legLiftIdx;
    const hasHipLead = bestDriftScore > 0.3;
    driftConfidence = clamp(Math.round(
      (isAfterLift ? 30 : 0) +
      (hasHipLead ? 30 : 10) +
      vis * 40
    ), 0, 100);
  }

  // ==========================================================
  // 3. FRONT FOOT STRIKE — lead ankle deceleration spike
  //
  // Primary: velocity-based — find the frame where lead ankle
  // was moving fast then suddenly stops (deceleration spike).
  // Secondary: max stride width + ankle near ground level.
  // ==========================================================
  let footStrikeIdx = Math.round(n * 0.4); // fallback
  let footStrikeConfidence = 20;

  // Find max lead ankle Y (ground level reference)
  let maxLeadAnkleY = 0;
  for (let i = legLiftIdx; i < n; i++) {
    const ay = frames[i].keypoints[S.leadAnkle]?.y ?? 0;
    maxLeadAnkleY = Math.max(maxLeadAnkleY, ay);
  }

  // Method A: Velocity deceleration
  let bestDecelScore = -Infinity;
  let decelFC = -1;
  const fsSearchStart = driftIdx;
  const fsSearchEnd = Math.min(legLiftIdx + Math.round(n * 0.65), n - 2);

  for (let i = fsSearchStart + 1; i < fsSearchEnd; i++) {
    const prevAnkle = frames[i - 1].keypoints[S.leadAnkle];
    const currAnkle = frames[i].keypoints[S.leadAnkle];
    const nextAnkle = frames[i + 1]?.keypoints[S.leadAnkle];
    if (!prevAnkle || !currAnkle || !nextAnkle) continue;

    // Ankle must be near ground
    if (currAnkle.y < maxLeadAnkleY * 0.88) continue;

    // Must have meaningful stride spread
    const backAnkle = frames[i].keypoints[S.backAnkle];
    if (!backAnkle) continue;
    const strideSpread = Math.abs(currAnkle.x - backAnkle.x);
    if (strideSpread < 0.08) continue;

    const prevSpeed = speed(prevAnkle, currAnkle);
    const nextSpeed = speed(currAnkle, nextAnkle);
    const decel = prevSpeed - nextSpeed;

    const score = decel * 5 + strideSpread * 3 + (currAnkle.y / maxLeadAnkleY) * 1;
    if (score > bestDecelScore) {
      bestDecelScore = score;
      decelFC = i;
    }
  }

  // Method B: Max stride spread at ground level
  let bestSpreadScore = -Infinity;
  let spreadFC = -1;
  for (let i = fsSearchStart + 1; i < fsSearchEnd; i++) {
    const currAnkle = frames[i].keypoints[S.leadAnkle];
    const backAnkle = frames[i].keypoints[S.backAnkle];
    if (!currAnkle || !backAnkle) continue;
    if (currAnkle.y < maxLeadAnkleY * 0.92) continue;

    const spread = Math.abs(currAnkle.x - backAnkle.x);
    const groundProximity = currAnkle.y / maxLeadAnkleY;
    const score = spread * 2 + groundProximity;
    if (score > bestSpreadScore) {
      bestSpreadScore = score;
      spreadFC = i;
    }
  }

  // Pick the best method
  if (decelFC > 0 && bestDecelScore > 0.1) {
    footStrikeIdx = decelFC;
    footStrikeConfidence = clamp(Math.round(50 + bestDecelScore * 30), 50, 95);
  } else if (spreadFC > 0) {
    footStrikeIdx = spreadFC;
    footStrikeConfidence = clamp(Math.round(30 + bestSpreadScore * 20), 30, 70);
  }

  // Boost confidence with visibility
  {
    const vis = meanVisibility(frames[footStrikeIdx], legKeys);
    footStrikeConfidence = clamp(Math.round(footStrikeConfidence * 0.7 + vis * 30), 0, 100);
  }

  // ==========================================================
  // 4. MAXIMUM EXTERNAL ROTATION — peak forearm layback
  //
  // After foot strike, the throwing arm cocks back to its maximum
  // layback position. We measure this as the angle of the forearm
  // (elbow→wrist) relative to the upper arm (shoulder→elbow).
  //
  // MER is the frame where the wrist is maximally "behind" the
  // elbow relative to the direction of throw, with the elbow
  // approximately at shoulder height.
  // ==========================================================
  let merIdx = Math.round(n * 0.6); // fallback
  let merConfidence = 20;

  // Calculate "layback score" for each frame after foot strike
  const merSearchStart = footStrikeIdx;
  const merSearchEnd = Math.min(footStrikeIdx + Math.round(n * 0.35), n - 1);
  let bestLaybackScore = -Infinity;

  for (let i = merSearchStart; i <= merSearchEnd; i++) {
    const kp = frames[i].keypoints;
    const shoulder = kp[S.throwShoulder];
    const elbow = kp[S.throwElbow];
    const wrist = kp[S.throwWrist];
    if (!shoulder || !elbow || !wrist) continue;

    // Elbow should be approximately at shoulder height (within tolerance)
    const elbowAboveShoulder = shoulder.y - elbow.y; // positive = elbow above shoulder
    const elbowHeightOk = elbowAboveShoulder > -0.08; // elbow not too far below shoulder

    if (!elbowHeightOk) continue;

    // Calculate forearm layback: how far the wrist is "behind" (in the
    // opposite direction of throw) relative to the elbow.
    // For a right-hander facing left (typical side view), "behind" = wrist to the right
    const shoulderMidX = (kp.leftShoulder?.x ?? 0 + (kp.rightShoulder?.x ?? 0)) / 2;

    // The forearm angle relative to vertical — at MER the forearm
    // should be nearly horizontal or angled back
    const forearmAngle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x) * 180 / Math.PI;

    // Upper arm angle
    const upperArmAngle = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x) * 180 / Math.PI;

    // The "layback" is the difference — at MER, the forearm is rotated
    // maximally back relative to the upper arm
    const layback = Math.abs(forearmAngle - upperArmAngle);

    // Also measure wrist position relative to shoulder midpoint
    // (wrist should be further from plate than shoulder mid)
    const wristBehind = throwingHand === "right"
      ? (wrist.x - shoulderMidX)
      : (shoulderMidX - wrist.x);

    // Elbow height bonus (closer to shoulder height = better)
    const elbowHeightBonus = 1 - Math.abs(elbowAboveShoulder) * 5;

    const score = layback * 0.5 + Math.max(0, wristBehind) * 100 + Math.max(0, elbowHeightBonus) * 20;
    if (score > bestLaybackScore) {
      bestLaybackScore = score;
      merIdx = i;
    }
  }

  // MER confidence
  {
    const vis = meanVisibility(frames[merIdx], armKeys);
    const afterFS = merIdx > footStrikeIdx;
    const temporalOk = merIdx - footStrikeIdx >= 2 && merIdx - footStrikeIdx <= 20;
    merConfidence = clamp(Math.round(
      (afterFS ? 20 : 0) +
      (temporalOk ? 25 : 5) +
      (bestLaybackScore > 30 ? 25 : bestLaybackScore > 10 ? 15 : 5) +
      vis * 30
    ), 0, 100);
  }

  // ==========================================================
  // 5. BALL RELEASE — peak wrist forward velocity after MER
  //
  // The throwing wrist reaches its maximum forward velocity
  // as the arm internally rotates and the ball leaves the hand.
  // ==========================================================
  let releaseIdx = Math.min(merIdx + 6, n - 1); // fallback
  let releaseConfidence = 20;

  const relSearchStart = merIdx + 1;
  const relSearchEnd = Math.min(merIdx + 20, n - 1);
  let bestReleaseScore = -Infinity;

  for (let i = relSearchStart; i < relSearchEnd; i++) {
    const kp = frames[i].keypoints;
    const prevKp = frames[i - 1].keypoints;
    const wrist = kp[S.throwWrist];
    const prevWrist = prevKp[S.throwWrist];
    const elbow = kp[S.throwElbow];
    if (!wrist || !prevWrist || !elbow) continue;

    // Wrist forward velocity (toward plate)
    const wristVx = throwingHand === "right"
      ? (prevWrist.x - wrist.x) // right-hander: decreasing X = toward plate
      : (wrist.x - prevWrist.x);

    // Wrist should be in front of elbow (internal rotation completed)
    const wristInFront = throwingHand === "right"
      ? (elbow.x - wrist.x) // wrist further left = more in front
      : (wrist.x - elbow.x);

    // Wrist should be moving downward (releasing the ball)
    const wristVy = wrist.y - prevWrist.y; // positive = moving down

    const score = wristVx * 50 + Math.max(0, wristInFront) * 30 + Math.max(0, wristVy) * 10;
    if (score > bestReleaseScore) {
      bestReleaseScore = score;
      releaseIdx = i;
    }
  }

  // Release confidence
  {
    const vis = meanVisibility(frames[releaseIdx], armKeys);
    const afterMER = releaseIdx > merIdx;
    const temporalOk = releaseIdx - merIdx >= 1 && releaseIdx - merIdx <= 12;
    releaseConfidence = clamp(Math.round(
      (afterMER ? 20 : 0) +
      (temporalOk ? 25 : 5) +
      (bestReleaseScore > 1 ? 25 : bestReleaseScore > 0.3 ? 15 : 5) +
      vis * 30
    ), 0, 100);
  }

  // ==========================================================
  // TAG FRAMES WITH THEIR PHASE
  // ==========================================================
  if (driftIdx < n) frames[driftIdx].phase = "drift";
  if (footStrikeIdx < n) frames[footStrikeIdx].phase = "footStrike";
  if (merIdx < n) frames[merIdx].phase = "mer";
  if (releaseIdx < n) frames[releaseIdx].phase = "release";

  return {
    legLift: {
      frameIndex: legLiftIdx,
      confidence: legLiftConfidence,
      timestampMs: frames[legLiftIdx]?.timestampMs ?? 0,
    },
    drift: {
      frameIndex: driftIdx,
      confidence: driftConfidence,
      timestampMs: frames[driftIdx]?.timestampMs ?? 0,
    },
    footStrike: {
      frameIndex: footStrikeIdx,
      confidence: footStrikeConfidence,
      timestampMs: frames[footStrikeIdx]?.timestampMs ?? 0,
    },
    mer: {
      frameIndex: merIdx,
      confidence: merConfidence,
      timestampMs: frames[merIdx]?.timestampMs ?? 0,
    },
    release: {
      frameIndex: releaseIdx,
      confidence: releaseConfidence,
      timestampMs: frames[releaseIdx]?.timestampMs ?? 0,
    },
  };
}
