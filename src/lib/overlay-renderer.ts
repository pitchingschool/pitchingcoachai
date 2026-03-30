/**
 * PitchingCoachAI — Canvas Overlay Renderer
 *
 * Draws skeleton, angle arcs, and measurement labels on a canvas
 * overlaid on top of the video element. Supports:
 * - Full skeleton with color-coded limbs
 * - Angle arcs at joints with degree labels
 * - Neon-on-dark aesthetic with glow effects
 * - Phase-specific overlay sets
 */

import {
  type ValidFrame,
  type PhaseName,
  type MetricGrade,
  type Point2D,
  type OverlayAngleArc,
  SKELETON_CONNECTIONS,
  LM,
  LM_NAMES,
  getSideKeys,
} from "./types";

// ============================================================
// COLOR PALETTE
// ============================================================

const COLORS = {
  skeleton: "#00e5ff",        // cyan neon
  skeletonGlow: "rgba(0, 229, 255, 0.3)",
  joint: "#ffffff",
  jointRing: "#00e5ff",
  green: "#22c55e",
  yellowGreen: "#a3e635",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  injury: "#ff0044",
  label: "#ffffff",
  labelBg: "rgba(0, 0, 0, 0.7)",
  phaseBadge: "rgba(0, 0, 0, 0.8)",
};

const GRADE_COLORS: Record<string, string> = {
  green: COLORS.green,
  yellowGreen: COLORS.yellowGreen,
  yellow: COLORS.yellow,
  orange: COLORS.orange,
  red: COLORS.red,
  injury: COLORS.injury,
};

// ============================================================
// SKELETON DRAWING
// ============================================================

/** Convert normalized (0-1) coordinates to canvas pixels */
function toCanvas(pt: Point2D, w: number, h: number): Point2D {
  return { x: pt.x * w, y: pt.y * h };
}

/** Draw the full body skeleton on canvas */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: ValidFrame,
  canvasW: number,
  canvasH: number,
  options?: { color?: string; lineWidth?: number; glow?: boolean }
): void {
  const color = options?.color || COLORS.skeleton;
  const lineWidth = options?.lineWidth || 3;
  const glow = options?.glow !== false;

  ctx.save();

  // Glow effect
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw connections
  for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
    const startName = LM_NAMES[startIdx];
    const endName = LM_NAMES[endIdx];
    if (!startName || !endName) continue;

    const startKp = frame.keypoints[startName];
    const endKp = frame.keypoints[endName];
    if (!startKp || !endKp) continue;
    if (startKp.visibility < 0.3 || endKp.visibility < 0.3) continue;

    const a = toCanvas(startKp, canvasW, canvasH);
    const b = toCanvas(endKp, canvasW, canvasH);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Draw joints
  ctx.shadowBlur = 0;
  const jointKeys = [
    "nose", "leftShoulder", "rightShoulder",
    "leftElbow", "rightElbow", "leftWrist", "rightWrist",
    "leftHip", "rightHip", "leftKnee", "rightKnee",
    "leftAnkle", "rightAnkle",
  ];

  for (const key of jointKeys) {
    const kp = frame.keypoints[key];
    if (!kp || kp.visibility < 0.3) continue;
    const p = toCanvas(kp, canvasW, canvasH);

    // Outer ring
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.jointRing;
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.joint;
    ctx.fill();
  }

  ctx.restore();
}

// ============================================================
// ANGLE ARC DRAWING
// ============================================================

export function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  arc: OverlayAngleArc,
  canvasW: number,
  canvasH: number
): void {
  const vertex = toCanvas(arc.vertex, canvasW, canvasH);
  const start = toCanvas(arc.startPoint, canvasW, canvasH);
  const end = toCanvas(arc.endPoint, canvasW, canvasH);

  const radius = 35;

  // Calculate angles for the arc
  const startAngle = Math.atan2(start.y - vertex.y, start.x - vertex.x);
  const endAngle = Math.atan2(end.y - vertex.y, end.x - vertex.x);

  ctx.save();

  // Draw arc
  ctx.strokeStyle = arc.color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = arc.color;
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.arc(vertex.x, vertex.y, radius, startAngle, endAngle, false);
  ctx.stroke();

  // Draw degree label
  const midAngle = (startAngle + endAngle) / 2;
  const labelX = vertex.x + Math.cos(midAngle) * (radius + 18);
  const labelY = vertex.y + Math.sin(midAngle) * (radius + 18);

  ctx.shadowBlur = 0;
  const text = `${Math.round(arc.angle)}°`;

  // Background pill
  ctx.font = "bold 11px -apple-system, sans-serif";
  const textWidth = ctx.measureText(text).width;
  const pillW = textWidth + 10;
  const pillH = 18;

  ctx.fillStyle = COLORS.labelBg;
  ctx.beginPath();
  ctx.roundRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH, 4);
  ctx.fill();

  // Text
  ctx.fillStyle = arc.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, labelX, labelY);

  ctx.restore();
}

// ============================================================
// MEASUREMENT LABEL DRAWING
// ============================================================

export function drawMeasurementLabel(
  ctx: CanvasRenderingContext2D,
  position: Point2D,
  label: string,
  value: string,
  color: string,
  canvasW: number,
  canvasH: number
): void {
  const p = toCanvas(position, canvasW, canvasH);

  ctx.save();

  const text = `${label}: ${value}`;
  ctx.font = "bold 11px -apple-system, sans-serif";
  const textWidth = ctx.measureText(text).width;
  const pillW = textWidth + 14;
  const pillH = 22;

  // Background
  ctx.fillStyle = COLORS.labelBg;
  ctx.beginPath();
  ctx.roundRect(p.x - pillW / 2, p.y - pillH / 2, pillW, pillH, 6);
  ctx.fill();

  // Color dot
  ctx.beginPath();
  ctx.arc(p.x - pillW / 2 + 10, p.y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Text
  ctx.fillStyle = COLORS.label;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, p.x - pillW / 2 + 18, p.y);

  ctx.restore();
}

// ============================================================
// PHASE BADGE DRAWING
// ============================================================

export function drawPhaseBadge(
  ctx: CanvasRenderingContext2D,
  phaseName: string,
  grade: string,
  gradeColor: string,
  canvasW: number,
  canvasH: number
): void {
  ctx.save();

  const text = `${phaseName} — ${grade}`;
  ctx.font = "bold 14px -apple-system, sans-serif";
  const textWidth = ctx.measureText(text).width;
  const pillW = textWidth + 24;
  const pillH = 32;
  const x = canvasW / 2 - pillW / 2;
  const y = 12;

  // Background
  ctx.fillStyle = COLORS.phaseBadge;
  ctx.beginPath();
  ctx.roundRect(x, y, pillW, pillH, 8);
  ctx.fill();

  // Border
  ctx.strokeStyle = gradeColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = COLORS.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvasW / 2, y + pillH / 2);

  ctx.restore();
}

// ============================================================
// PHASE-SPECIFIC OVERLAY SETS
// ============================================================

/** Build angle arcs for a specific phase based on metric grades */
export function buildPhaseOverlays(
  frame: ValidFrame,
  phase: PhaseName,
  metricGrades: MetricGrade[],
  throwingHand: "left" | "right"
): OverlayAngleArc[] {
  const S = getSideKeys(throwingHand);
  const arcs: OverlayAngleArc[] = [];
  const kp = frame.keypoints;

  const gradeMap = new Map(metricGrades.map((m) => [m.metricKey, m]));
  const getColor = (key: string): string => {
    const g = gradeMap.get(key);
    return g ? (GRADE_COLORS[g.color] || COLORS.yellow) : COLORS.yellow;
  };
  const getValue = (key: string): number => {
    const g = gradeMap.get(key);
    return g?.value ?? 0;
  };

  if (phase === "legLift") {
    // Lead knee angle at leg lift
    if (kp[S.leadHip] && kp[S.leadKnee] && kp[S.leadAnkle]) {
      arcs.push({
        vertex: kp[S.leadKnee],
        startPoint: kp[S.leadHip],
        endPoint: kp[S.leadAnkle],
        angle: getValue("legLift.leadKneeHeight") * 100, // show as visual
        label: "Knee Lift",
        color: getColor("legLift.leadKneeHeight"),
      });
    }
  }

  if (phase === "drift") {
    // Back leg drive angle
    if (kp[S.backHip] && kp[S.backKnee] && kp[S.backAnkle]) {
      arcs.push({
        vertex: kp[S.backKnee],
        startPoint: kp[S.backHip],
        endPoint: kp[S.backAnkle],
        angle: getValue("drift.backLegDriveAngle"),
        label: "Back Leg Drive",
        color: getColor("drift.backLegDriveAngle"),
      });
    }
  }

  if (phase === "footStrike") {
    // Lead knee angle
    if (kp[S.leadHip] && kp[S.leadKnee] && kp[S.leadAnkle]) {
      arcs.push({
        vertex: kp[S.leadKnee],
        startPoint: kp[S.leadHip],
        endPoint: kp[S.leadAnkle],
        angle: getValue("footStrike.leadKneeAngle"),
        label: "Lead Knee",
        color: getColor("footStrike.leadKneeAngle"),
      });
    }
  }

  if (phase === "mer") {
    // Elbow flexion
    if (kp[S.throwShoulder] && kp[S.throwElbow] && kp[S.throwWrist]) {
      arcs.push({
        vertex: kp[S.throwElbow],
        startPoint: kp[S.throwShoulder],
        endPoint: kp[S.throwWrist],
        angle: getValue("mer.elbowFlexion"),
        label: "Elbow",
        color: getColor("mer.elbowFlexion"),
      });
    }

    // Lead leg brace
    if (kp[S.leadHip] && kp[S.leadKnee] && kp[S.leadAnkle]) {
      arcs.push({
        vertex: kp[S.leadKnee],
        startPoint: kp[S.leadHip],
        endPoint: kp[S.leadAnkle],
        angle: getValue("mer.leadLegBrace"),
        label: "Leg Brace",
        color: getColor("mer.leadLegBrace"),
      });
    }
  }

  if (phase === "release") {
    // Lead leg extension
    if (kp[S.leadHip] && kp[S.leadKnee] && kp[S.leadAnkle]) {
      arcs.push({
        vertex: kp[S.leadKnee],
        startPoint: kp[S.leadHip],
        endPoint: kp[S.leadAnkle],
        angle: getValue("release.leadLegExtension"),
        label: "Lead Leg",
        color: getColor("release.leadLegExtension"),
      });
    }
  }

  return arcs;
}

// ============================================================
// FULL FRAME RENDER (skeleton + arcs + labels + badge)
// ============================================================

export function renderPhaseFrame(
  ctx: CanvasRenderingContext2D,
  frame: ValidFrame,
  phase: PhaseName,
  phaseLabel: string,
  grade: string,
  gradeColor: string,
  metricGrades: MetricGrade[],
  throwingHand: "left" | "right",
  canvasW: number,
  canvasH: number
): void {
  // Clear
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Draw skeleton
  drawSkeleton(ctx, frame, canvasW, canvasH);

  // Draw angle arcs
  const arcs = buildPhaseOverlays(frame, phase, metricGrades, throwingHand);
  for (const arc of arcs) {
    drawAngleArc(ctx, arc, canvasW, canvasH);
  }

  // Draw phase badge
  drawPhaseBadge(ctx, phaseLabel, grade, GRADE_COLORS[gradeColor] || COLORS.yellow, canvasW, canvasH);
}

// ============================================================
// CAPTURE FREEZE FRAME
// ============================================================

/** Capture a video frame + overlay to a data URL */
export function capturePhaseFrame(
  video: HTMLVideoElement,
  frame: ValidFrame,
  phase: PhaseName,
  phaseLabel: string,
  grade: string,
  gradeColor: string,
  metricGrades: MetricGrade[],
  throwingHand: "left" | "right"
): string {
  const w = video.videoWidth;
  const h = video.videoHeight;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Draw video frame
  ctx.drawImage(video, 0, 0, w, h);

  // Draw overlays
  renderPhaseFrame(ctx, frame, phase, phaseLabel, grade, gradeColor, metricGrades, throwingHand, w, h);

  return canvas.toDataURL("image/jpeg", 0.85);
}
