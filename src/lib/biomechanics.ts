/**
 * PitchingCoachAI, Biomechanical Metrics Calculator
 *
 * Calculates all measurable metrics at each detected phase.
 * All angles in degrees. All distances normalized (0-1 or height ratio).
 *
 * MEASUREMENT CONTRACT (coach measurement model rebuild):
 *   - A keypoint below the visibility threshold is NULL, never a fabricated
 *     fallback coordinate. A metric that needs a null keypoint is NULL
 *     ("not measured") and is excluded from grading.
 *   - No correction / fudge factors anywhere. What we measure is what we
 *     report.
 *   - Hip-shoulder separation comes from MediaPipe WORLD landmarks in the
 *     transverse plane. Without world landmarks it is not measured.
 *   - Max layback uses the coach definition: forearm vs ground, 90 =
 *     vertical, 180 = laid flat back; peak over (FFS, release].
 */

import {
  type ValidFrame,
  type DetectedPhases,
  type LegLiftMetrics,
  type DriftMetrics,
  type FootStrikeMetrics,
  type MERMetrics,
  type ReleaseMetrics,
  type DecelerationMetrics,
  type AllMetrics,
  type Point2D,
  getSideKeys,
} from "./types";
import { laybackAngle, resolveThrowDirection } from "./phase-detector";

// ============================================================
// GEOMETRY HELPERS (all null-tolerant)
// ============================================================

const VIS = 0.3;

/** Safe getter: null when the keypoint is missing or below visibility. */
function kp(frame: ValidFrame | undefined, key: string): Point2D | null {
  if (!frame) return null;
  const p = frame.keypoints[key];
  if (!p || p.visibility < VIS) return null;
  return { x: p.x, y: p.y };
}

/** Visibility of a keypoint (0 when missing). */
function vis(frame: ValidFrame | undefined, key: string): number {
  if (!frame) return 0;
  return frame.keypoints[key]?.visibility ?? 0;
}

/** Angle at vertex B formed by points A-B-C, degrees. Null-tolerant. */
function angle3(a: Point2D | null, b: Point2D | null, c: Point2D | null): number | null {
  if (!a || !b || !c) return null;
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBA === 0 || magBC === 0) return null;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of line A→B vs positive X axis, degrees. Null-tolerant. */
function vecAngle(a: Point2D | null, b: Point2D | null): number | null {
  if (!a || !b) return null;
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function mid(a: Point2D | null, b: Point2D | null): Point2D | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function dist(a: Point2D | null, b: Point2D | null): number | null {
  if (!a || !b) return null;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function round2(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100) / 100;
}

function roundInt(v: number | null): number | null {
  return v === null ? null : Math.round(v);
}

/** Trunk deviation from vertical (0 = stacked). Null-tolerant. */
function trunkFromVertical(frame: ValidFrame | undefined): number | null {
  const hipMid = mid(kp(frame, "leftHip"), kp(frame, "rightHip"));
  const shoulderMid = mid(kp(frame, "leftShoulder"), kp(frame, "rightShoulder"));
  const a = vecAngle(hipMid, shoulderMid);
  if (a === null) return null;
  return Math.abs(-90 - a);
}

/** Pitcher height estimate in normalized units; null when unmeasurable. */
function estimateHeight(frame: ValidFrame | undefined): number | null {
  const shoulderMid = mid(kp(frame, "leftShoulder"), kp(frame, "rightShoulder"));
  const ankleMid = mid(kp(frame, "leftAnkle"), kp(frame, "rightAnkle"));
  const torsoToFeet = dist(shoulderMid, ankleMid);
  if (torsoToFeet === null || torsoToFeet < 1e-4) return null;
  return torsoToFeet * 1.25;
}

// ============================================================
// CONFIDENCE TRACKING
// ============================================================

type ConfidenceMap = Record<string, number>;

/** Min visibility across the keypoints a metric used (0 when unmeasured). */
function conf(frame: ValidFrame | undefined, keys: string[]): number {
  if (!frame) return 0;
  let m = 1;
  for (const k of keys) m = Math.min(m, vis(frame, k));
  return Math.round(m * 100) / 100;
}

// ============================================================
// WORLD-LANDMARK HIP-SHOULDER SEPARATION
// ============================================================

/**
 * Separation in the transverse (overhead) plane from world landmarks:
 * angle between the pelvis line and the shoulder line, folded to 0-90.
 * Windowed median over frame±2 to reject single-frame depth noise.
 */
function worldHipShoulderSep(
  frames: ValidFrame[],
  centerIdx: number
): { value: number | null; confidence: number } {
  const samples: number[] = [];
  let minVis = 1;
  for (let i = Math.max(0, centerIdx - 2); i <= Math.min(frames.length - 1, centerIdx + 2); i++) {
    const w = frames[i]?.worldKeypoints;
    if (!w) continue;
    const lh = w.leftHip;
    const rh = w.rightHip;
    const ls = w.leftShoulder;
    const rs = w.rightShoulder;
    if (!lh || !rh || !ls || !rs) continue;
    const v = Math.min(lh.visibility, rh.visibility, ls.visibility, rs.visibility);
    if (v < VIS) continue;
    const hipAng = (Math.atan2(rh.z - lh.z, rh.x - lh.x) * 180) / Math.PI;
    const shAng = (Math.atan2(rs.z - ls.z, rs.x - ls.x) * 180) / Math.PI;
    let sep = Math.abs(shAng - hipAng);
    if (sep > 180) sep = 360 - sep;
    if (sep > 90) sep = 180 - sep;
    samples.push(sep);
    minVis = Math.min(minVis, v);
  }
  if (samples.length < 2) return { value: null, confidence: 0 };
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  return { value: Math.round(median), confidence: Math.round(minVis * 100) / 100 };
}

// ============================================================
// LEG LIFT METRICS
// ============================================================

function calcLegLiftMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  C: ConfidenceMap
): LegLiftMetrics {
  const f = frames[phases.legLift.frameIndex];
  const leadHipPt = kp(f, S.leadHip);
  const leadKneePt = kp(f, S.leadKnee);
  const leadKneeHeight =
    leadHipPt && leadKneePt ? round2(leadHipPt.y - leadKneePt.y) : null;
  C["legLift.leadKneeHeight"] = conf(f, [S.leadHip, S.leadKnee]);

  const balancePoint = roundInt(trunkFromVertical(f));
  C["legLift.balancePoint"] = conf(f, ["leftHip", "rightHip", "leftShoulder", "rightShoulder"]);

  return { leadKneeHeight, balancePoint };
}

// ============================================================
// DRIFT METRICS
// ============================================================

function calcDriftMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  C: ConfidenceMap
): DriftMetrics {
  const dIdx = phases.drift.frameIndex;
  const f = frames[dIdx];
  const height = estimateHeight(f);

  const hipMid = mid(kp(f, S.leadHip), kp(f, S.backHip));
  const backAnkle = kp(f, S.backAnkle);
  const hipLeadDistance =
    hipMid && backAnkle && height
      ? round2(Math.abs(hipMid.x - backAnkle.x) / height)
      : null;
  C["drift.hipLeadDistance"] = conf(f, [S.leadHip, S.backHip, S.backAnkle]);

  const backLegDriveAngle = roundInt(
    angle3(kp(f, S.backHip), kp(f, S.backKnee), kp(f, S.backAnkle))
  );
  C["drift.backLegDriveAngle"] = conf(f, [S.backHip, S.backKnee, S.backAnkle]);

  const leadHipPt = kp(f, S.leadHip);
  const leadKneePt = kp(f, S.leadKnee);
  const leadKneeHeight =
    leadHipPt && leadKneePt ? round2(leadHipPt.y - leadKneePt.y) : null;
  C["drift.leadKneeHeight"] = conf(f, [S.leadHip, S.leadKnee]);

  let centerOfMassVelocity: number | null = null;
  if (dIdx > 0) {
    const prevHipMid = mid(kp(frames[dIdx - 1], S.leadHip), kp(frames[dIdx - 1], S.backHip));
    if (prevHipMid && hipMid) {
      centerOfMassVelocity = Math.round(Math.abs(hipMid.x - prevHipMid.x) * 1000) / 1000;
    }
  }
  C["drift.centerOfMassVelocity"] = conf(f, [S.leadHip, S.backHip]);

  const throwWrist = kp(f, S.throwWrist);
  const throwShoulder = kp(f, S.throwShoulder);
  const armPosition =
    throwWrist && throwShoulder ? round2(throwShoulder.y - throwWrist.y) : null;
  C["drift.armPosition"] = conf(f, [S.throwWrist, S.throwShoulder]);

  // Back leg tension hold: knee-angle stability drift → foot strike
  let backLegTensionHold: number | null = null;
  const fsIdx = phases.footStrike.frameIndex;
  if (fsIdx > dIdx + 2) {
    const kneeAngles: number[] = [];
    for (let i = dIdx; i <= fsIdx && i < frames.length; i++) {
      const a = angle3(kp(frames[i], S.backHip), kp(frames[i], S.backKnee), kp(frames[i], S.backAnkle));
      if (a !== null) kneeAngles.push(a);
    }
    if (kneeAngles.length >= 3) {
      const startAngle = kneeAngles[0];
      let extensionPoint = 1.0;
      for (let i = 0; i < kneeAngles.length; i++) {
        if (kneeAngles[i] > 160 && startAngle < 160) {
          extensionPoint = i / kneeAngles.length;
          break;
        }
      }
      const midPoint = Math.floor(kneeAngles.length / 2);
      const secondHalfDelta = kneeAngles[kneeAngles.length - 1] - kneeAngles[midPoint];
      const totalDelta = kneeAngles[kneeAngles.length - 1] - kneeAngles[0];
      const extensionScore = Math.max(0, Math.min(100, ((extensionPoint - 0.3) / 0.7) * 100));
      let distributionScore = 50;
      if (totalDelta > 5) {
        distributionScore = Math.max(0, Math.min(100, (Math.max(0, secondHalfDelta) / totalDelta) * 100));
      }
      backLegTensionHold = Math.round(extensionScore * 0.6 + distributionScore * 0.4);
    }
  }
  C["drift.backLegTensionHold"] = conf(f, [S.backHip, S.backKnee, S.backAnkle]);

  return { hipLeadDistance, backLegDriveAngle, backLegTensionHold, leadKneeHeight, centerOfMassVelocity, armPosition };
}

// ============================================================
// FOOT STRIKE METRICS
// ============================================================

function calcFootStrikeMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  C: ConfidenceMap
): FootStrikeMetrics {
  const fsIdx = phases.footStrike.frameIndex;
  const f = frames[fsIdx];
  const height = estimateHeight(f);

  // Stride length (side view, image plane)
  const leadAnkle = kp(f, S.leadAnkle);
  const backAnkle = kp(f, S.backAnkle);
  const strideLength =
    leadAnkle && backAnkle && height
      ? round2(Math.abs(leadAnkle.x - backAnkle.x) / height)
      : null;
  C["footStrike.strideLength"] = conf(f, [S.leadAnkle, S.backAnkle, "leftShoulder", "rightShoulder"]);

  // Hip-shoulder separation: WORLD landmarks only (transverse plane).
  // The old 2D hip-line vs shoulder-line read is meaningless in a side
  // view (the points nearly overlap), so without world data: not measured.
  const sepResult = worldHipShoulderSep(frames, fsIdx);
  const hipShoulderSep = sepResult.value;
  C["footStrike.hipShoulderSep"] = sepResult.confidence;

  // Front knee at FFS (hip-knee-ankle; 180 = straight)
  const leadKneeAngle = roundInt(
    angle3(kp(f, S.leadHip), kp(f, S.leadKnee), kp(f, S.leadAnkle))
  );
  C["footStrike.leadKneeAngle"] = conf(f, [S.leadHip, S.leadKnee, S.leadAnkle]);

  // Arm cocked: throwing elbow at/above shoulder height
  const throwElbow = kp(f, S.throwElbow);
  const throwShoulder = kp(f, S.throwShoulder);
  const armCocked =
    throwElbow && throwShoulder ? throwElbow.y <= throwShoulder.y + 0.02 : null;

  // Elbow bend at FFS (shoulder-elbow-wrist)
  const elbowAngleAtFS = roundInt(
    angle3(kp(f, S.throwShoulder), kp(f, S.throwElbow), kp(f, S.throwWrist))
  );
  C["footStrike.elbowAngleAtFS"] = conf(f, [S.throwShoulder, S.throwElbow, S.throwWrist]);

  // Forearm-to-vertical (arm timing)
  const forearmVec = vecAngle(kp(f, S.throwElbow), kp(f, S.throwWrist));
  const forearmVerticalAngle = forearmVec === null ? null : Math.round(Math.abs(-90 - forearmVec));
  C["footStrike.forearmVerticalAngle"] = conf(f, [S.throwElbow, S.throwWrist]);

  // Trunk angle from vertical
  const trunkAngle = roundInt(trunkFromVertical(f));
  C["footStrike.trunkAngle"] = conf(f, ["leftHip", "rightHip", "leftShoulder", "rightShoulder"]);

  // Glove position
  const gloveWrist = kp(f, S.gloveWrist);
  const gloveShoulder = kp(f, S.gloveShoulder);
  const glovePosition =
    gloveWrist && gloveShoulder ? round2(gloveShoulder.x - gloveWrist.x) : null;
  C["footStrike.glovePosition"] = conf(f, [S.gloveWrist, S.gloveShoulder]);

  // Arm height at FFS (shoulder abduction): trunk line vs upper arm.
  // 90 = elbow level with the shoulder. Coach-defined target metric.
  const hipMidFS = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const shoulderAbductionAtFS = roundInt(angle3(hipMidFS, throwShoulder, throwElbow));
  C["footStrike.shoulderAbductionAtFS"] = conf(f, ["leftHip", "rightHip", S.throwShoulder, S.throwElbow]);

  // DEPRECATED: fudged 2D external-rotation proxy. Kept as null so stored
  // rows keep their shape; never computed, never graded.
  const shoulderERAtFS = null;

  return { strideLength, hipShoulderSep, leadKneeAngle, armCocked, elbowAngleAtFS, forearmVerticalAngle, trunkAngle, glovePosition, shoulderAbductionAtFS, shoulderERAtFS };
}

// ============================================================
// MAX LAYBACK METRICS (phase key "mer" kept for compatibility)
// ============================================================

function calcMERMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  throwDirSign: number,
  C: ConfidenceMap
): MERMetrics {
  const merIdx = phases.mer.frameIndex;
  const fsIdx = phases.footStrike.frameIndex;
  const relIdx = phases.release.frameIndex;
  const f = frames[merIdx];

  // Coach-defined max layback, read at the detected max-layback frame
  // (the detector picks it as the smoothed peak over (FFS, release]).
  // Falls back to the raw window peak if that exact frame is unreadable.
  let maxLayback: number | null = laybackAngle(f, S.throwElbow, S.throwWrist, throwDirSign);
  if (maxLayback === null) {
    for (let i = fsIdx + 1; i <= relIdx && i < frames.length; i++) {
      const lb = laybackAngle(frames[i], S.throwElbow, S.throwWrist, throwDirSign);
      if (lb === null) continue;
      if (maxLayback === null || lb > maxLayback) maxLayback = lb;
    }
  }
  maxLayback = roundInt(maxLayback);
  C["mer.maxLayback"] = conf(f, [S.throwElbow, S.throwWrist]);

  // DEPRECATED fudged proxy: never computed, never graded.
  const shoulderExternalRotation = null;

  const shoulder = kp(f, S.throwShoulder);
  const elbow = kp(f, S.throwElbow);
  const wrist = kp(f, S.throwWrist);

  const shoulderMid = mid(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
  const elbowHeight =
    shoulderMid && elbow ? Math.round((shoulderMid.y - elbow.y) * 180) : null;
  C["mer.elbowHeight"] = conf(f, ["leftShoulder", "rightShoulder", S.throwElbow]);

  const elbowFlexion = roundInt(angle3(shoulder, elbow, wrist));
  C["mer.elbowFlexion"] = conf(f, [S.throwShoulder, S.throwElbow, S.throwWrist]);

  const trunkLateralTilt = roundInt(trunkFromVertical(f));
  C["mer.trunkLateralTilt"] = conf(f, ["leftHip", "rightHip", "leftShoulder", "rightShoulder"]);

  const leadLegBrace = roundInt(
    angle3(kp(f, S.leadHip), kp(f, S.leadKnee), kp(f, S.leadAnkle))
  );
  C["mer.leadLegBrace"] = conf(f, [S.leadHip, S.leadKnee, S.leadAnkle]);

  const hipMid = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const shoulderAbduction = roundInt(angle3(hipMid, shoulder, elbow));
  C["mer.shoulderAbduction"] = conf(f, ["leftHip", "rightHip", S.throwShoulder, S.throwElbow]);

  // Brace progression from FFS (delta form: correlated error cancels)
  let leadLegBraceDelta: number | null = null;
  const fsFrame = frames[fsIdx];
  const fsKnee = angle3(kp(fsFrame, S.leadHip), kp(fsFrame, S.leadKnee), kp(fsFrame, S.leadAnkle));
  if (fsKnee !== null && leadLegBrace !== null) {
    leadLegBraceDelta = Math.round(leadLegBrace - fsKnee);
  }
  C["mer.leadLegBraceDelta"] = Math.min(
    conf(f, [S.leadHip, S.leadKnee, S.leadAnkle]),
    conf(fsFrame, [S.leadHip, S.leadKnee, S.leadAnkle])
  );

  // Rotation sequencing: EXPERIMENTAL, computed but never graded (a 2D
  // side view cannot measure rotation timing reliably).
  let trunkRotationSequencing: number | null = null;
  if (merIdx > fsIdx + 3) {
    let hipPeakVelIdx = fsIdx;
    let shoulderPeakVelIdx = fsIdx;
    let hipPeakVel = 0;
    let shoulderPeakVel = 0;
    for (let i = fsIdx + 1; i <= merIdx && i < frames.length; i++) {
      const prevHip = vecAngle(kp(frames[i - 1], "leftHip"), kp(frames[i - 1], "rightHip"));
      const currHip = vecAngle(kp(frames[i], "leftHip"), kp(frames[i], "rightHip"));
      const prevSh = vecAngle(kp(frames[i - 1], "leftShoulder"), kp(frames[i - 1], "rightShoulder"));
      const currSh = vecAngle(kp(frames[i], "leftShoulder"), kp(frames[i], "rightShoulder"));
      if (prevHip !== null && currHip !== null) {
        const v = Math.abs(currHip - prevHip);
        if (v > hipPeakVel) { hipPeakVel = v; hipPeakVelIdx = i; }
      }
      if (prevSh !== null && currSh !== null) {
        const v = Math.abs(currSh - prevSh);
        if (v > shoulderPeakVel) { shoulderPeakVel = v; shoulderPeakVelIdx = i; }
      }
    }
    if (hipPeakVel > 0 && shoulderPeakVel > 0) {
      trunkRotationSequencing = shoulderPeakVelIdx - hipPeakVelIdx;
    }
  }

  return { maxLayback, shoulderExternalRotation, elbowHeight, elbowFlexion, trunkLateralTilt, leadLegBrace, shoulderAbduction, leadLegBraceDelta, trunkRotationSequencing };
}

// ============================================================
// BALL RELEASE METRICS
// ============================================================

function calcReleaseMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  C: ConfidenceMap
): ReleaseMetrics {
  const f = frames[phases.release.frameIndex];
  const fsFrame = frames[phases.footStrike.frameIndex];

  const trunkForwardFlexion = roundInt(trunkFromVertical(f));
  C["release.trunkForwardFlexion"] = conf(f, ["leftHip", "rightHip", "leftShoulder", "rightShoulder"]);

  const leadLegExtension = roundInt(
    angle3(kp(f, S.leadHip), kp(f, S.leadKnee), kp(f, S.leadAnkle))
  );
  C["release.leadLegExtension"] = conf(f, [S.leadHip, S.leadKnee, S.leadAnkle]);

  const nose = kp(f, "nose");
  const wrist = kp(f, S.throwWrist);
  const releasePointHeight = nose && wrist ? round2(nose.y - wrist.y) : null;
  C["release.releasePointHeight"] = conf(f, ["nose", S.throwWrist]);

  const backAnkle = kp(f, S.backAnkle);
  const height = estimateHeight(f);
  const extension =
    wrist && backAnkle && height ? round2(Math.abs(wrist.x - backAnkle.x) / height) : null;
  C["release.extension"] = conf(f, [S.throwWrist, S.backAnkle]);

  const shoulder = kp(f, S.throwShoulder);
  const armSlotRaw = vecAngle(shoulder, wrist);
  const armSlot = armSlotRaw === null ? null : Math.round(Math.abs(armSlotRaw + 90));
  C["release.armSlot"] = conf(f, [S.throwShoulder, S.throwWrist]);

  let trunkRotation: number | null = null;
  const fsShoulderAngle = vecAngle(kp(fsFrame, "leftShoulder"), kp(fsFrame, "rightShoulder"));
  const relShoulderAngle = vecAngle(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
  if (fsShoulderAngle !== null && relShoulderAngle !== null) {
    trunkRotation = Math.round(Math.abs(relShoulderAngle - fsShoulderAngle));
    if (trunkRotation > 90) trunkRotation = 180 - trunkRotation;
  }
  C["release.trunkRotation"] = Math.min(
    conf(f, ["leftShoulder", "rightShoulder"]),
    conf(fsFrame, ["leftShoulder", "rightShoulder"])
  );

  let leadLegBraceTotal: number | null = null;
  const fsKnee = angle3(kp(fsFrame, S.leadHip), kp(fsFrame, S.leadKnee), kp(fsFrame, S.leadAnkle));
  if (fsKnee !== null && leadLegExtension !== null) {
    leadLegBraceTotal = Math.round(leadLegExtension - fsKnee);
  }
  C["release.leadLegBraceTotal"] = Math.min(
    conf(f, [S.leadHip, S.leadKnee, S.leadAnkle]),
    conf(fsFrame, [S.leadHip, S.leadKnee, S.leadAnkle])
  );

  return { trunkForwardFlexion, leadLegExtension, releasePointHeight, extension, armSlot, trunkRotation, leadLegBraceTotal };
}

// ============================================================
// DECELERATION / FOLLOW-THROUGH METRICS
// ============================================================

function calcDecelerationMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  C: ConfidenceMap
): DecelerationMetrics {
  const f = frames[phases.deceleration.frameIndex];
  const relFrame = frames[phases.release.frameIndex];
  const height = estimateHeight(f);

  let followThroughLength: number | null = null;
  const relWrist = kp(relFrame, S.throwWrist);
  const decelWrist = kp(f, S.throwWrist);
  const ftDist = dist(relWrist, decelWrist);
  if (ftDist !== null && height) {
    followThroughLength = round2(ftDist / height);
  }
  C["deceleration.followThroughLength"] = Math.min(
    conf(f, [S.throwWrist]),
    conf(relFrame, [S.throwWrist])
  );

  let trunkFlexionDelta: number | null = null;
  const relTrunk = trunkFromVertical(relFrame);
  const decelTrunk = trunkFromVertical(f);
  if (relTrunk !== null && decelTrunk !== null) {
    trunkFlexionDelta = Math.round(decelTrunk - relTrunk);
  }
  C["deceleration.trunkFlexionDelta"] = Math.min(
    conf(f, ["leftHip", "rightHip", "leftShoulder", "rightShoulder"]),
    conf(relFrame, ["leftHip", "rightHip", "leftShoulder", "rightShoulder"])
  );

  const nose = kp(f, "nose");
  const leadAnkle = kp(f, S.leadAnkle);
  const backAnkle = kp(f, S.backAnkle);
  let bodyBalance: number | null = null;
  if (nose && leadAnkle && backAnkle && height) {
    const baseMidX = (leadAnkle.x + backAnkle.x) / 2;
    bodyBalance = Math.round((Math.abs(nose.x - baseMidX) / height) * 100);
  }
  C["deceleration.bodyBalance"] = conf(f, ["nose", S.leadAnkle, S.backAnkle]);

  let armDecelerationPath: number | null = null;
  const relIdx = phases.release.frameIndex;
  const decelIdx = phases.deceleration.frameIndex;
  if (decelIdx > relIdx + 2) {
    const speeds: number[] = [];
    for (let i = relIdx + 1; i <= decelIdx && i < frames.length; i++) {
      const spd = dist(kp(frames[i - 1], S.throwWrist), kp(frames[i], S.throwWrist));
      if (spd !== null) speeds.push(spd);
    }
    if (speeds.length >= 2) {
      let smoothFrames = 0;
      for (let i = 1; i < speeds.length; i++) {
        if (speeds[i] <= speeds[i - 1] * 1.3) smoothFrames++;
      }
      armDecelerationPath = Math.round((smoothFrames / (speeds.length - 1)) * 100);
    }
  }
  C["deceleration.armDecelerationPath"] = conf(f, [S.throwWrist]);

  return { followThroughLength, trunkFlexionDelta, bodyBalance, armDecelerationPath };
}

// ============================================================
// MAIN ENTRY POINTS
// ============================================================

export function calculateAllMetricsWithConfidence(
  frames: ValidFrame[],
  phases: DetectedPhases,
  throwingHand: "left" | "right" = "right"
): { metrics: AllMetrics; confidence: Record<string, number> } {
  const S = getSideKeys(throwingHand);
  const C: ConfidenceMap = {};
  const throwDirSign = resolveThrowDirection(frames, throwingHand, phases.release.frameIndex);

  const metrics: AllMetrics = {
    legLift: calcLegLiftMetrics(frames, phases, S, C),
    drift: calcDriftMetrics(frames, phases, S, C),
    footStrike: calcFootStrikeMetrics(frames, phases, S, C),
    mer: calcMERMetrics(frames, phases, S, throwDirSign, C),
    release: calcReleaseMetrics(frames, phases, S, C),
    deceleration: calcDecelerationMetrics(frames, phases, S, C),
  };

  return { metrics, confidence: C };
}

export function calculateAllMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  throwingHand: "left" | "right" = "right"
): AllMetrics {
  return calculateAllMetricsWithConfidence(frames, phases, throwingHand).metrics;
}
