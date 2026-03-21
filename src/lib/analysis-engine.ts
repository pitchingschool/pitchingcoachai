/**
 * PitchingCoachAI — Analysis Engine (v2)
 *
 * Orchestrates the full analysis pipeline:
 *   1. Extract frames from video + run MediaPipe pose detection
 *   2. Detect 4 key phases (drift, foot strike, MER, release)
 *   3. Calculate biomechanical metrics at each phase
 *   4. Grade all metrics based on athlete level
 *   5. Prescribe drills for weak areas
 *   6. Capture freeze frames with overlays
 *
 * Video never leaves the browser.
 */

import {
  type ValidFrame,
  type Keypoints,
  type AnalysisResult,
  type PhaseName,
  type AthleteLevel,
  type ProgressCallback,
  LM_NAMES,
  PHASE_LABELS,
} from "./types";
import { detectPhases } from "./phase-detector";
import { calculateAllMetrics } from "./biomechanics";
import { gradeAllMetrics } from "./grading";
import { prescribeDrills } from "./drill-prescriptions";
import { capturePhaseFrame } from "./overlay-renderer";

// ============================================================
// CONSTANTS
// ============================================================

const REQUIRED_KEYPOINTS = [
  "leftShoulder", "rightShoulder",
  "leftElbow", "rightElbow",
  "leftWrist", "rightWrist",
  "leftHip", "rightHip",
  "leftKnee", "rightKnee",
  "leftAnkle", "rightAnkle",
];

const MIN_VISIBILITY = 0.50;
const MIN_REQUIRED_VISIBLE = 8;
const MIN_VALID_FRAMES = 15;

// ============================================================
// FRAME EXTRACTION + POSE DETECTION
// ============================================================

export async function extractFrames(
  videoUrl: string,
  poseLandmarker: any,
  onProgress: ProgressCallback
): Promise<{ frames: ValidFrame[]; video: HTMLVideoElement }> {
  onProgress("Loading video...", 0);

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video file."));
    setTimeout(() => reject(new Error("Video load timed out.")), 20000);
    video.load();
  });

  const duration = video.duration;
  if (duration < 0.5) throw new Error("Video is too short.");
  if (duration > 60) throw new Error("Video is too long. Please trim to under 60 seconds.");

  // Target 30fps sampling, cap at 300 frames
  const targetFPS = 30;
  let sampleInterval = 1 / targetFPS;
  const maxFrames = 300;
  if (duration / sampleInterval > maxFrames) {
    sampleInterval = duration / maxFrames;
  }

  const totalFrames = Math.floor(duration / sampleInterval);
  const validFrames: ValidFrame[] = [];
  let tsCounter = 1;

  onProgress("Detecting pose landmarks...", 0, `0 / ${totalFrames} frames`);

  for (let i = 0; i < totalFrames; i++) {
    const time = i * sampleInterval;
    video.currentTime = time;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      video.onseeked = finish;
      setTimeout(finish, 200);
    });

    let result: any;
    try {
      result = poseLandmarker.detectForVideo(video, tsCounter++);
    } catch {
      continue;
    }

    if (!result?.landmarks?.[0]) continue;

    const rawLM = result.landmarks[0];
    const keypoints: Keypoints = {};
    for (const [idx, name] of Object.entries(LM_NAMES)) {
      const lm = rawLM[Number(idx)];
      if (lm) {
        keypoints[name] = { x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility || 0 };
      }
    }

    // Validate: enough keypoints visible
    const visibleCount = REQUIRED_KEYPOINTS.filter(
      (k) => keypoints[k] && keypoints[k].visibility >= MIN_VISIBILITY
    ).length;

    if (visibleCount >= MIN_REQUIRED_VISIBLE) {
      validFrames.push({
        frameIndex: i,
        timestampMs: Math.round(time * 1000),
        keypoints,
        phase: null,
      });
    }

    const pct = Math.round(((i + 1) / totalFrames) * 100);
    if (i % 5 === 0) {
      onProgress("Detecting pose landmarks...", pct, `${i + 1} / ${totalFrames} frames`);
    }

    // Yield to browser
    if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  if (validFrames.length < MIN_VALID_FRAMES) {
    throw new Error(
      `Only ${validFrames.length} usable frames detected. Film in good lighting with the pitcher fully visible head to toe.`
    );
  }

  return { frames: validFrames, video };
}

// ============================================================
// FULL ANALYSIS PIPELINE
// ============================================================

export async function runAnalysis(
  videoUrl: string,
  poseLandmarker: any,
  onProgress: ProgressCallback,
  options: {
    throwingHand: "left" | "right";
    level: AthleteLevel;
  }
): Promise<AnalysisResult> {
  const { throwingHand, level } = options;

  // Stage 1: Extract frames
  const { frames, video } = await extractFrames(videoUrl, poseLandmarker, onProgress);

  // Stage 2: Detect phases
  onProgress("Identifying pitching phases...", 0);
  const phases = detectPhases(frames, throwingHand);
  onProgress("Identifying pitching phases...", 100);

  // Stage 3: Calculate metrics
  onProgress("Measuring your mechanics...", 0);
  const metrics = calculateAllMetrics(frames, phases, throwingHand);
  onProgress("Measuring your mechanics...", 100);

  // Stage 4: Grade everything
  onProgress("Grading your delivery...", 0);
  const { metricGrades, phaseGrades, overall } = gradeAllMetrics(metrics, level);
  onProgress("Grading your delivery...", 100);

  // Stage 5: Prescribe drills
  const drills = prescribeDrills(metricGrades);

  // Stage 6: Capture freeze frames at each phase
  onProgress("Capturing key positions...", 0);
  const phaseKeys: PhaseName[] = ["drift", "footStrike", "mer", "release"];
  const phaseFrameCaptures: Record<string, string> = {};

  for (let i = 0; i < phaseKeys.length; i++) {
    const phaseKey = phaseKeys[i];
    const phaseResult = phases[phaseKey];
    const frame = frames[phaseResult.frameIndex];

    if (frame) {
      // Seek video to this frame's timestamp
      video.currentTime = phaseResult.timestampMs / 1000;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        video.onseeked = finish;
        setTimeout(finish, 300);
      });

      const pg = phaseGrades.find((p) => p.phase === phaseKey);
      const phaseMetricGrades = metricGrades.filter((m) => m.phase === phaseKey);

      phaseFrameCaptures[phaseKey] = capturePhaseFrame(
        video,
        frame,
        phaseKey,
        PHASE_LABELS[phaseKey],
        pg?.grade || "C",
        pg?.color || "yellow",
        phaseMetricGrades,
        throwingHand
      );
    }

    onProgress("Capturing key positions...", Math.round(((i + 1) / phaseKeys.length) * 100));
  }

  // Estimate FPS
  let estimatedFPS = 30;
  if (frames.length > 5) {
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(frames.length, 50); i++) {
      const dt = frames[i].timestampMs - frames[i - 1].timestampMs;
      if (dt > 1 && dt < 200) intervals.push(dt);
    }
    if (intervals.length > 3) {
      intervals.sort((a, b) => a - b);
      const medianDt = intervals[Math.floor(intervals.length / 2)];
      estimatedFPS = Math.round(1000 / medianDt);
    }
  }

  onProgress("Analysis complete!", 100);

  // Clean up video element
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  video.remove();

  return {
    frames,
    phases,
    metrics,
    grade: overall,
    drills,
    phaseFrameCaptures: phaseFrameCaptures as Record<PhaseName, string>,
    athleteLevel: level,
    throwingHand,
    estimatedFPS,
    totalFrames: frames.length,
    videoWidth,
    videoHeight,
  };
}
