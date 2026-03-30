/**
 * PitchingCoachAI — Biomechanical Metrics Calculator
 *
 * Calculates all measurable metrics at each of the 4 key phases.
 * All angles in degrees. All distances normalized (0-1 scale or as ratio of height).
 *
 * Research references:
 * - ASMI (Fleisig et al.) normative pitching biomechanics data
 * - Driveline Baseball pitch design / mechanics research
 * - Ben Brewster / Tread Athletics methodology
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

// ============================================================
// GEOMETRY HELPERS
// ============================================================

/** Angle at vertex B formed by points A-B-C, in degrees */
function angle3(a: Point2D, b: Point2D, c: Point2D): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of line from A to B relative to positive X axis, in degrees */
function vecAngle(a: Point2D, b: Point2D): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Midpoint of two points */
function mid(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Euclidean distance */
function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Safe getter — returns fallback if keypoint missing or low visibility */
function kp(frame: ValidFrame, key: string, fallback?: Point2D): Point2D {
  const p = frame.keypoints[key];
  if (p && p.visibility > 0.3) return { x: p.x, y: p.y };
  return fallback || { x: 0.5, y: 0.5 };
}

/** Estimate pitcher height from frame (shoulder-to-ankle distance * ~1.3) */
function estimateHeight(frame: ValidFrame): number {
  const lShoulder = frame.keypoints.leftShoulder;
  const rShoulder = frame.keypoints.rightShoulder;
  const lAnkle = frame.keypoints.leftAnkle;
  const rAnkle = frame.keypoints.rightAnkle;
  if (!lShoulder || !rShoulder || !lAnkle || !rAnkle) return 0.5;

  const shoulderMid = mid(lShoulder, rShoulder);
  const ankleMid = mid(lAnkle, rAnkle);
  const torsoToFeet = dist(shoulderMid, ankleMid);
  // Head is roughly 20% additional height above shoulders
  return torsoToFeet * 1.25;
}

// ============================================================
// LEG LIFT METRICS
// ============================================================

function calcLegLiftMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>
): LegLiftMetrics {
  const f = frames[phases.legLift.frameIndex];
  if (!f) return { leadKneeHeight: null, balancePoint: null };

  // Lead knee height: how high knee gets relative to hip (positive = above hip)
  const leadHipPt = kp(f, S.leadHip);
  const leadKneePt = kp(f, S.leadKnee);
  const leadKneeHeight = Math.round((leadHipPt.y - leadKneePt.y) * 100) / 100;

  // Balance point: trunk angle from vertical (0 = perfectly balanced)
  const hipMid = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const shoulderMid = mid(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
  const trunkVecAngle = vecAngle(hipMid, shoulderMid);
  const balancePoint = Math.round(Math.abs(-90 - trunkVecAngle));

  return { leadKneeHeight, balancePoint };
}

// ============================================================
// DRIFT METRICS
// ============================================================

function calcDriftMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>
): DriftMetrics {
  const f = frames[phases.drift.frameIndex];
  if (!f) return { hipLeadDistance: null, backLegDriveAngle: null, leadKneeHeight: null, centerOfMassVelocity: null, armPosition: null };

  const height = estimateHeight(f);

  // Hip lead distance: hip midpoint X - back ankle X, normalized by height
  const hipMid = mid(kp(f, S.leadHip), kp(f, S.backHip));
  const backAnkle = kp(f, S.backAnkle);
  const hipLeadRaw = Math.abs(hipMid.x - backAnkle.x);
  const hipLeadDistance = height > 0 ? Math.round((hipLeadRaw / height) * 100) / 100 : null;

  // Back leg drive angle: angle at back knee (hip-knee-ankle)
  const backLegDriveAngle = Math.round(angle3(
    kp(f, S.backHip),
    kp(f, S.backKnee),
    kp(f, S.backAnkle)
  ));

  // Lead knee height relative to hip (positive = knee above hip)
  const leadHipPt = kp(f, S.leadHip);
  const leadKneePt = kp(f, S.leadKnee);
  const leadKneeHeight = Math.round((leadHipPt.y - leadKneePt.y) * 100) / 100;

  // Center of mass velocity (hip midpoint frame-to-frame delta)
  let centerOfMassVelocity: number | null = null;
  const dIdx = phases.drift.frameIndex;
  if (dIdx > 0 && dIdx < frames.length) {
    const prevHipMid = mid(
      kp(frames[dIdx - 1], S.leadHip),
      kp(frames[dIdx - 1], S.backHip)
    );
    const currHipMid = hipMid;
    centerOfMassVelocity = Math.round(Math.abs(currHipMid.x - prevHipMid.x) * 1000) / 1000;
  }

  // Arm position: throwing wrist Y relative to shoulder Y
  // Lower value = arm more relaxed/down (preferred during drift)
  const throwWrist = kp(f, S.throwWrist);
  const throwShoulder = kp(f, S.throwShoulder);
  const armPosition = Math.round((throwShoulder.y - throwWrist.y) * 100) / 100;

  return { hipLeadDistance, backLegDriveAngle, leadKneeHeight, centerOfMassVelocity, armPosition };
}

// ============================================================
// FOOT STRIKE METRICS
// ============================================================

function calcFootStrikeMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>
): FootStrikeMetrics {
  const f = frames[phases.footStrike.frameIndex];
  if (!f) return { strideLength: null, hipShoulderSep: null, leadKneeAngle: null, armCocked: null, elbowAngleAtFS: null, forearmVerticalAngle: null, trunkAngle: null, glovePosition: null, shoulderAbductionAtFS: null, shoulderERAtFS: null };

  const height = estimateHeight(f);

  // Stride length: lead ankle to back ankle X distance / height
  const leadAnkle = kp(f, S.leadAnkle);
  const backAnkle = kp(f, S.backAnkle);
  const strideLenRaw = Math.abs(leadAnkle.x - backAnkle.x);
  const strideLength = height > 0 ? Math.round((strideLenRaw / height) * 100) / 100 : null;

  // Hip-shoulder separation: angle between hip line and shoulder line
  // This is the key velocity generator (ASMI/Fleisig)
  const hipAngle = vecAngle(
    kp(f, "leftHip"),
    kp(f, "rightHip")
  );
  const shoulderAngle = vecAngle(
    kp(f, "leftShoulder"),
    kp(f, "rightShoulder")
  );
  let hipShoulderSep = Math.round(Math.abs(hipAngle - shoulderAngle));
  if (hipShoulderSep > 90) hipShoulderSep = 180 - hipShoulderSep;

  // Lead knee angle at foot strike (hip-knee-ankle)
  const leadKneeAngle = Math.round(angle3(
    kp(f, S.leadHip),
    kp(f, S.leadKnee),
    kp(f, S.leadAnkle)
  ));

  // Arm cocked: is throwing elbow at or above shoulder height?
  const throwElbow = kp(f, S.throwElbow);
  const throwShoulder = kp(f, S.throwShoulder);
  const armCocked = throwElbow.y <= throwShoulder.y + 0.02; // elbow at or above shoulder

  // Elbow flexion angle at foot strike
  const elbowAngleAtFS = Math.round(angle3(
    kp(f, S.throwShoulder),
    kp(f, S.throwElbow),
    kp(f, S.throwWrist)
  ));

  // Forearm-to-vertical angle (arm timing)
  // 0° = forearm pointing straight up (ideal cocked position at FFS)
  // >20° = "late arm" — hasn't reached cocked position, injury risk
  const forearmVec = vecAngle(kp(f, S.throwElbow), kp(f, S.throwWrist));
  const forearmVerticalAngle = Math.round(Math.abs(-90 - forearmVec));

  // Trunk angle from vertical
  const hipMid = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const shoulderMid = mid(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
  const trunkAngleRaw = vecAngle(hipMid, shoulderMid);
  // Trunk is vertical when angle is -90° (pointing straight up)
  // Deviation from -90° = forward/backward lean
  const trunkAngle = Math.round(Math.abs(-90 - trunkAngleRaw));

  // Glove position: glove wrist X relative to lead shoulder X
  // Positive = glove in front of chest (good)
  const gloveWrist = kp(f, S.gloveWrist);
  const gloveShoulder = kp(f, S.gloveShoulder);
  const glovePosition = Math.round((gloveShoulder.x - gloveWrist.x) * 100) / 100;

  // Shoulder abduction at SFC: angle of upper arm relative to torso midline
  const hipMidFS = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const shoulderAbductionAtFS = Math.round(angle3(hipMidFS, throwShoulder, throwElbow));

  // Shoulder external rotation at SFC: forearm angle relative to upper arm
  // At SFC, the forearm should be relatively vertical (cocked position)
  // ER estimate: angle between upper arm vector and forearm vector in 2D
  const throwWrist = kp(f, S.throwWrist);
  const forearmAngleFS = vecAngle(throwElbow, throwWrist);
  const upperArmAngleFS = vecAngle(throwShoulder, throwElbow);
  let shoulderERAtFS = Math.round(Math.abs(forearmAngleFS - upperArmAngleFS));
  if (shoulderERAtFS > 180) shoulderERAtFS = 360 - shoulderERAtFS;
  // 2D correction (same as MER calculation)
  shoulderERAtFS = Math.min(180, shoulderERAtFS + 30);

  return { strideLength, hipShoulderSep, leadKneeAngle, armCocked, elbowAngleAtFS, forearmVerticalAngle, trunkAngle, glovePosition, shoulderAbductionAtFS, shoulderERAtFS };
}

// ============================================================
// MER METRICS
// ============================================================

function calcMERMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>
): MERMetrics {
  const f = frames[phases.mer.frameIndex];
  if (!f) return { shoulderExternalRotation: null, elbowHeight: null, elbowFlexion: null, trunkLateralTilt: null, leadLegBrace: null, shoulderAbduction: null, leadLegBraceDelta: null, trunkRotationSequencing: null };

  // Shoulder External Rotation (forearm layback)
  // Measured as angle between upper arm vector and forearm vector
  // At MER, this should be 170-185° for elite pitchers
  const shoulder = kp(f, S.throwShoulder);
  const elbow = kp(f, S.throwElbow);
  const wrist = kp(f, S.throwWrist);

  // External rotation = 180° - angle at elbow (shoulder-elbow-wrist)
  // When forearm is laid back, this approaches 180°
  // Actually, shoulder ER is the angle of forearm rotation relative to
  // the shoulder plane. In 2D side view, we approximate this as:
  const forearmAngle = vecAngle(elbow, wrist);
  const upperArmAngle = vecAngle(shoulder, elbow);
  let shoulderExternalRotation = Math.round(Math.abs(forearmAngle - upperArmAngle));
  // Normalize to 0-180 range
  if (shoulderExternalRotation > 180) shoulderExternalRotation = 360 - shoulderExternalRotation;
  // Add base to approximate full ER (2D underestimates true 3D ER)
  // Typical 2D measurement reads ~100-140°, actual 3D is ~170-185°
  // We add a correction factor
  shoulderExternalRotation = Math.min(190, shoulderExternalRotation + 50);

  // Elbow height relative to shoulder line (degrees)
  const shoulderMid = mid(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
  const elbowHeightRatio = (shoulderMid.y - elbow.y); // positive = above shoulder
  const elbowHeight = Math.round(elbowHeightRatio * 180); // approximate degrees

  // Elbow flexion (shoulder-elbow-wrist angle)
  const elbowFlexion = Math.round(angle3(shoulder, elbow, wrist));

  // Trunk lateral tilt (side view: trunk midline angle from vertical)
  const hipMid = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const trunkVecAngle = vecAngle(hipMid, shoulderMid);
  const trunkLateralTilt = Math.round(Math.abs(-90 - trunkVecAngle));

  // Lead leg brace (knee extension angle at lead leg)
  const leadLegBrace = Math.round(angle3(
    kp(f, S.leadHip),
    kp(f, S.leadKnee),
    kp(f, S.leadAnkle)
  ));

  // Shoulder abduction (upper arm angle relative to torso)
  const shoulderAbduction = Math.round(angle3(hipMid, shoulder, elbow));

  // Lead leg brace delta: knee extension change from SFC to MER
  // Positive value = leg is straightening (bracing), negative = collapsing
  let leadLegBraceDelta: number | null = null;
  const fsFrame = frames[phases.footStrike.frameIndex];
  if (fsFrame) {
    const fsKneeAngle = Math.round(angle3(
      kp(fsFrame, S.leadHip),
      kp(fsFrame, S.leadKnee),
      kp(fsFrame, S.leadAnkle)
    ));
    leadLegBraceDelta = leadLegBrace - fsKneeAngle;
  }

  // Trunk rotation sequencing: measure the timing lag between hip and shoulder rotation
  // We look at frames from SFC to MER and find when hips vs shoulders reach peak rotation velocity
  let trunkRotationSequencing: number | null = null;
  const fsIdx = phases.footStrike.frameIndex;
  const merIdx = phases.mer.frameIndex;

  if (merIdx > fsIdx + 3) {
    // Measure hip line angle and shoulder line angle at each frame
    let hipPeakVelIdx = fsIdx;
    let shoulderPeakVelIdx = fsIdx;
    let hipPeakVel = 0;
    let shoulderPeakVel = 0;

    for (let i = fsIdx + 1; i <= merIdx && i < frames.length; i++) {
      const prevF = frames[i - 1];
      const currF = frames[i];
      if (!prevF || !currF) continue;

      // Hip rotation velocity (change in hip line angle)
      const prevHipAngle = vecAngle(kp(prevF, "leftHip"), kp(prevF, "rightHip"));
      const currHipAngle = vecAngle(kp(currF, "leftHip"), kp(currF, "rightHip"));
      const hipVel = Math.abs(currHipAngle - prevHipAngle);

      // Shoulder rotation velocity
      const prevShoulderAngle = vecAngle(kp(prevF, "leftShoulder"), kp(prevF, "rightShoulder"));
      const currShoulderAngle = vecAngle(kp(currF, "leftShoulder"), kp(currF, "rightShoulder"));
      const shoulderVel = Math.abs(currShoulderAngle - prevShoulderAngle);

      if (hipVel > hipPeakVel) {
        hipPeakVel = hipVel;
        hipPeakVelIdx = i;
      }
      if (shoulderVel > shoulderPeakVel) {
        shoulderPeakVel = shoulderVel;
        shoulderPeakVelIdx = i;
      }
    }

    // Sequencing = shoulder peak comes AFTER hip peak (positive = good sequential timing)
    trunkRotationSequencing = shoulderPeakVelIdx - hipPeakVelIdx;
  }

  return { shoulderExternalRotation, elbowHeight, elbowFlexion, trunkLateralTilt, leadLegBrace, shoulderAbduction, leadLegBraceDelta, trunkRotationSequencing };
}

// ============================================================
// BALL RELEASE METRICS
// ============================================================

function calcReleaseMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>,
  throwingHand: "left" | "right"
): ReleaseMetrics {
  const f = frames[phases.release.frameIndex];
  const fsFrame = frames[phases.footStrike.frameIndex];
  if (!f) return { trunkForwardFlexion: null, leadLegExtension: null, releasePointHeight: null, extension: null, armSlot: null, trunkRotation: null, leadLegBraceTotal: null };

  // Trunk forward flexion (trunk angle from vertical at release)
  const hipMid = mid(kp(f, "leftHip"), kp(f, "rightHip"));
  const shoulderMid = mid(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
  const trunkVecAngle = vecAngle(hipMid, shoulderMid);
  const trunkForwardFlexion = Math.round(Math.abs(-90 - trunkVecAngle));

  // Lead leg extension (hip-knee-ankle angle — near full extension = 160-180°)
  const leadLegExtension = Math.round(angle3(
    kp(f, S.leadHip),
    kp(f, S.leadKnee),
    kp(f, S.leadAnkle)
  ));

  // Release point height: wrist Y relative to head Y
  // Negative = wrist above head (good for overhand)
  const nose = kp(f, "nose");
  const wrist = kp(f, S.throwWrist);
  const releasePointHeight = Math.round((nose.y - wrist.y) * 100) / 100;

  // Extension: wrist X distance from back ankle (how far toward plate)
  const backAnkle = kp(f, S.backAnkle);
  const height = estimateHeight(f);
  const extensionRaw = Math.abs(wrist.x - backAnkle.x);
  const extension = height > 0 ? Math.round((extensionRaw / height) * 100) / 100 : null;

  // Arm slot: angle of shoulder-to-wrist line relative to vertical
  const shoulder = kp(f, S.throwShoulder);
  const armSlotRaw = vecAngle(shoulder, wrist);
  // Convert to angle from vertical (0° = straight overhead, 90° = sidearm)
  const armSlot = Math.round(Math.abs(armSlotRaw + 90));

  // Trunk rotation: change in shoulder line angle from foot strike to release
  let trunkRotation: number | null = null;
  if (fsFrame) {
    const fsShoulderAngle = vecAngle(
      kp(fsFrame, "leftShoulder"),
      kp(fsFrame, "rightShoulder")
    );
    const relShoulderAngle = vecAngle(
      kp(f, "leftShoulder"),
      kp(f, "rightShoulder")
    );
    trunkRotation = Math.round(Math.abs(relShoulderAngle - fsShoulderAngle));
    if (trunkRotation > 90) trunkRotation = 180 - trunkRotation;
  }

  // Lead leg brace total: knee extension change from SFC to release
  let leadLegBraceTotal: number | null = null;
  if (fsFrame) {
    const fsKneeAngle = Math.round(angle3(
      kp(fsFrame, S.leadHip),
      kp(fsFrame, S.leadKnee),
      kp(fsFrame, S.leadAnkle)
    ));
    leadLegBraceTotal = leadLegExtension - fsKneeAngle;
  }

  return { trunkForwardFlexion, leadLegExtension, releasePointHeight, extension, armSlot, trunkRotation, leadLegBraceTotal };
}

// ============================================================
// DECELERATION / FOLLOW-THROUGH METRICS
// ============================================================

function calcDecelerationMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  S: ReturnType<typeof getSideKeys>
): DecelerationMetrics {
  const f = frames[phases.deceleration.frameIndex];
  const relFrame = frames[phases.release.frameIndex];
  if (!f) return { followThroughLength: null, trunkFlexionDelta: null, bodyBalance: null, armDecelerationPath: null };

  const height = estimateHeight(f);

  // Follow-through length: how far the throwing wrist travels after release
  let followThroughLength: number | null = null;
  if (relFrame && height > 0) {
    const relWrist = kp(relFrame, S.throwWrist);
    const decelWrist = kp(f, S.throwWrist);
    followThroughLength = Math.round((dist(relWrist, decelWrist) / height) * 100) / 100;
  }

  // Trunk flexion delta: additional trunk flexion from release to follow-through
  let trunkFlexionDelta: number | null = null;
  if (relFrame) {
    const relHipMid = mid(kp(relFrame, "leftHip"), kp(relFrame, "rightHip"));
    const relShoulderMid = mid(kp(relFrame, "leftShoulder"), kp(relFrame, "rightShoulder"));
    const relTrunkAngle = Math.abs(-90 - vecAngle(relHipMid, relShoulderMid));

    const decelHipMid = mid(kp(f, "leftHip"), kp(f, "rightHip"));
    const decelShoulderMid = mid(kp(f, "leftShoulder"), kp(f, "rightShoulder"));
    const decelTrunkAngle = Math.abs(-90 - vecAngle(decelHipMid, decelShoulderMid));

    trunkFlexionDelta = Math.round(decelTrunkAngle - relTrunkAngle);
  }

  // Body balance: how centered is the head over the base of support at follow-through
  const nose = kp(f, "nose");
  const leadAnkle = kp(f, S.leadAnkle);
  const backAnkle = kp(f, S.backAnkle);
  const baseMidX = (leadAnkle.x + backAnkle.x) / 2;
  // Normalized deviation: 0 = perfectly centered, higher = more off-balance
  const bodyBalance = height > 0
    ? Math.round(Math.abs(nose.x - baseMidX) / height * 100)
    : null;

  // Arm deceleration path smoothness: measure how smooth the wrist path is from release to follow-through
  // Score 0-100 (100 = perfectly smooth arc, lower = jerky/abbreviated)
  let armDecelerationPath: number | null = null;
  const relIdx = phases.release.frameIndex;
  const decelIdx = phases.deceleration.frameIndex;

  if (decelIdx > relIdx + 2) {
    // Measure consistency of wrist speed across post-release frames
    const speeds: number[] = [];
    for (let i = relIdx + 1; i <= decelIdx && i < frames.length; i++) {
      if (i < 1) continue;
      const spd = dist(kp(frames[i - 1], S.throwWrist), kp(frames[i], S.throwWrist));
      speeds.push(spd);
    }

    if (speeds.length >= 2) {
      // Check for smooth deceleration (speeds should decrease monotonically)
      let smoothFrames = 0;
      for (let i = 1; i < speeds.length; i++) {
        if (speeds[i] <= speeds[i - 1] * 1.3) smoothFrames++; // Allow 30% tolerance
      }
      armDecelerationPath = Math.round((smoothFrames / (speeds.length - 1)) * 100);
    }
  }

  return { followThroughLength, trunkFlexionDelta, bodyBalance, armDecelerationPath };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export function calculateAllMetrics(
  frames: ValidFrame[],
  phases: DetectedPhases,
  throwingHand: "left" | "right" = "right"
): AllMetrics {
  const S = getSideKeys(throwingHand);

  return {
    legLift: calcLegLiftMetrics(frames, phases, S),
    drift: calcDriftMetrics(frames, phases, S),
    footStrike: calcFootStrikeMetrics(frames, phases, S),
    mer: calcMERMetrics(frames, phases, S),
    release: calcReleaseMetrics(frames, phases, S, throwingHand),
    deceleration: calcDecelerationMetrics(frames, phases, S),
  };
}
