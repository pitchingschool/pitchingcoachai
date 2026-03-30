/**
 * PitchingCoachAI — Shared Type Definitions
 * All interfaces used across the analysis pipeline.
 */

// ============================================================
// CORE TYPES
// ============================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Landmark extends Point2D {
  z: number;
  visibility: number;
}

export interface Keypoints {
  [name: string]: Landmark;
}

export interface ValidFrame {
  frameIndex: number;
  timestampMs: number;
  keypoints: Keypoints;
  phase: PhaseName | null;
}

// ============================================================
// PHASE DETECTION
// ============================================================

export type PhaseName = "legLift" | "drift" | "footStrike" | "mer" | "release";

export const PHASE_LABELS: Record<PhaseName, string> = {
  legLift: "Leg Lift",
  drift: "Drift",
  footStrike: "Foot Strike",
  mer: "Max External Rotation",
  release: "Ball Release",
};

export const PHASE_SHORT_LABELS: Record<PhaseName, string> = {
  legLift: "Leg Lift",
  drift: "Drift",
  footStrike: "FFS",
  mer: "MER",
  release: "Release",
};

export interface PhaseResult {
  frameIndex: number;
  confidence: number; // 0-100
  timestampMs: number;
}

export interface DetectedPhases {
  legLift: PhaseResult;   // peak knee height — visible to user
  drift: PhaseResult;     // forward momentum initiation
  footStrike: PhaseResult; // front foot plants
  mer: PhaseResult;       // max external rotation (arm cocked back)
  release: PhaseResult;   // ball leaving hand
}

// ============================================================
// BIOMECHANICAL METRICS
// ============================================================

export interface LegLiftMetrics {
  leadKneeHeight: number | null;        // how high knee gets relative to hip
  balancePoint: number | null;          // trunk angle from vertical (0 = balanced)
}

export interface DriftMetrics {
  hipLeadDistance: number | null;       // normalized by estimated height
  backLegDriveAngle: number | null;    // degrees at back knee
  leadKneeHeight: number | null;       // normalized relative to hip
  centerOfMassVelocity: number | null; // px/frame normalized
  armPosition: number | null;          // wrist Y relative to shoulder Y (lower = better)
}

export interface FootStrikeMetrics {
  strideLength: number | null;         // as ratio of estimated height
  hipShoulderSep: number | null;       // degrees
  leadKneeAngle: number | null;        // degrees (full joint angle, 180=straight)
  armCocked: boolean | null;           // is elbow >= shoulder height?
  elbowAngleAtFS: number | null;       // degrees
  forearmVerticalAngle: number | null;  // degrees from vertical (0=perfect, >20=late)
  trunkAngle: number | null;           // degrees from vertical
  glovePosition: number | null;        // glove wrist X relative to lead shoulder X
}

export interface MERMetrics {
  shoulderExternalRotation: number | null; // degrees
  elbowHeight: number | null;              // degrees relative to shoulder line
  elbowFlexion: number | null;             // degrees
  trunkLateralTilt: number | null;         // degrees from vertical
  leadLegBrace: number | null;             // degrees (knee extension)
  shoulderAbduction: number | null;        // degrees
}

export interface ReleaseMetrics {
  trunkForwardFlexion: number | null;  // degrees from vertical
  leadLegExtension: number | null;     // degrees
  releasePointHeight: number | null;   // wrist Y relative to head Y (normalized)
  extension: number | null;            // wrist X - back ankle X (normalized)
  armSlot: number | null;              // degrees from vertical
  trunkRotation: number | null;        // shoulder line change from FS (degrees)
}

export interface AllMetrics {
  legLift: LegLiftMetrics;
  drift: DriftMetrics;
  footStrike: FootStrikeMetrics;
  mer: MERMetrics;
  release: ReleaseMetrics;
}

// ============================================================
// GRADING
// ============================================================

export type AthleteLevel = "12u" | "14u" | "hs" | "college" | "pro";

export const LEVEL_LABELS: Record<AthleteLevel, string> = {
  "12u": "12U Youth",
  "14u": "14U Youth",
  hs: "High School",
  college: "College",
  pro: "Professional",
};

export type LetterGrade = "A+" | "A" | "B" | "C" | "D" | "F";
export type GradeColor = "green" | "yellowGreen" | "yellow" | "orange" | "red" | "injury";

export interface MetricGrade {
  metricKey: string;
  label: string;
  value: number | null;
  unit: string;
  grade: LetterGrade;
  color: GradeColor;
  phase: PhaseName;
  injuryFlag: boolean;
  explanation: string;
}

export interface PhaseGrade {
  phase: PhaseName;
  label: string;
  grade: LetterGrade;
  color: GradeColor;
  score: number; // 0-100
  metrics: MetricGrade[];
}

export interface OverallGrade {
  score: number;       // 0-100
  grade: LetterGrade;
  color: GradeColor;
  verdict: string;
  phaseGrades: PhaseGrade[];
}

// ============================================================
// DRILL PRESCRIPTIONS
// ============================================================

export interface ProductRecommendation {
  name: string;
  url: string;
  campaign: string;
}

export interface DrillPrescription {
  name: string;
  description: string;
  targetMetric: string;
  phase: PhaseName;
  reps: string;
  priority: number; // 1 = highest
  product?: ProductRecommendation;
}

// ============================================================
// OVERLAY RENDERING
// ============================================================

export interface OverlayAngleArc {
  vertex: Point2D;
  startPoint: Point2D;
  endPoint: Point2D;
  angle: number;
  label: string;
  color: string;
  unit?: string;
}

export interface OverlayConfig {
  showSkeleton: boolean;
  showAngles: boolean;
  showMeasurements: boolean;
  skeletonColor: string;
  jointRadius: number;
  lineWidth: number;
  glowEnabled: boolean;
}

// ============================================================
// ANALYSIS RESULT (top-level output)
// ============================================================

export type FPSQuality = "excellent" | "good" | "mediocre" | "poor";

export interface AnalysisResult {
  frames: ValidFrame[];
  phases: DetectedPhases;
  metrics: AllMetrics;
  grade: OverallGrade;
  drills: DrillPrescription[];
  phaseFrameCaptures: Record<PhaseName, string>; // base64 data URLs of freeze frames
  athleteLevel: AthleteLevel;
  throwingHand: "left" | "right";
  estimatedFPS: number;
  totalFrames: number;
  videoWidth: number;
  videoHeight: number;
  fpsQuality: FPSQuality;
}

// ============================================================
// PROGRESS CALLBACK
// ============================================================

export type ProgressCallback = (stage: string, pct: number, detail?: string) => void;

// ============================================================
// LANDMARK INDEX MAP
// ============================================================

export const LM = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

/** Keypoint name map matching LM indices */
export const LM_NAMES: Record<number, string> = {
  0: "nose",
  11: "leftShoulder", 12: "rightShoulder",
  13: "leftElbow", 14: "rightElbow",
  15: "leftWrist", 16: "rightWrist",
  23: "leftHip", 24: "rightHip",
  25: "leftKnee", 26: "rightKnee",
  27: "leftAnkle", 28: "rightAnkle",
  29: "leftHeel", 30: "rightHeel",
  31: "leftFootIndex", 32: "rightFootIndex",
};

/** Skeleton connection pairs for drawing */
export const SKELETON_CONNECTIONS: [number, number][] = [
  // Head to shoulders
  [0, 11], [0, 12],
  // Shoulders
  [11, 12],
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Torso
  [11, 23], [12, 24], [23, 24],
  // Left leg
  [23, 25], [25, 27],
  // Right leg
  [24, 26], [26, 28],
  // Left foot
  [27, 29], [29, 31], [27, 31],
  // Right foot
  [28, 30], [30, 32], [28, 32],
];

/** Helper: get side-specific landmark keys based on throwing hand */
export function getSideKeys(throwingHand: "left" | "right") {
  const isRight = throwingHand === "right";
  return {
    throwShoulder: isRight ? "rightShoulder" : "leftShoulder",
    throwElbow: isRight ? "rightElbow" : "leftElbow",
    throwWrist: isRight ? "rightWrist" : "leftWrist",
    gloveShoulder: isRight ? "leftShoulder" : "rightShoulder",
    gloveElbow: isRight ? "leftElbow" : "rightElbow",
    gloveWrist: isRight ? "leftWrist" : "rightWrist",
    leadHip: isRight ? "leftHip" : "rightHip",
    leadKnee: isRight ? "leftKnee" : "rightKnee",
    leadAnkle: isRight ? "leftAnkle" : "rightAnkle",
    backHip: isRight ? "rightHip" : "leftHip",
    backKnee: isRight ? "rightKnee" : "leftKnee",
    backAnkle: isRight ? "rightAnkle" : "leftAnkle",
    leadHeel: isRight ? "leftHeel" : "rightHeel",
    backHeel: isRight ? "rightHeel" : "leftHeel",
    leadFoot: isRight ? "leftFootIndex" : "rightFootIndex",
    backFoot: isRight ? "rightFootIndex" : "leftFootIndex",
  };
}
