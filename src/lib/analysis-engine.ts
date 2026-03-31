/**
 * PitchingCoachAI — Analysis Engine (v3)
 *
 * Orchestrates the full analysis pipeline:
 *   1. Probe video container for real encoded FPS (MP4Box.js)
 *   2. Extract frames from video + run MediaPipe pose detection
 *   3. For long videos: auto-detect pitching delivery (two-pass)
 *   4. Detect 5 key phases (legLift, drift, footStrike, MER, release)
 *   5. Calculate biomechanical metrics at each phase
 *   6. Grade all metrics based on athlete level
 *   7. Prescribe drills for weak areas
 *   8. Capture freeze frames with overlays
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
import { probeVideoProgressive, type VideoProbeResult } from "./video-probe";
import { isWebCodecsSupported, extractFramesWebCodecs } from "./webcodecs-extractor";

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

const MIN_VISIBILITY = 0.15;
const MIN_REQUIRED_VISIBLE = 4;
const MIN_VALID_FRAMES = 5;

/** Max file size: 500MB */
const MAX_FILE_SIZE = 500 * 1024 * 1024;

/**
 * Max frames to process in full analysis.
 * 900 frames at 240fps = 3.75 seconds — covers any trimmed pitch clip.
 * For longer videos, we use two-pass delivery detection to trim first.
 */
const MAX_ANALYSIS_FRAMES = 900;

/**
 * For the fast scan (delivery detection in long videos),
 * sample at ~30fps regardless of native rate.
 */
const FAST_SCAN_FPS = 30;

/**
 * Delivery window: how much time around the movement peak to capture.
 * 1.5s before + 1.0s after = 2.5s total = 600 frames at 240fps.
 */
const DELIVERY_WINDOW_BEFORE_SEC = 1.5;
const DELIVERY_WINDOW_AFTER_SEC = 1.0;

// ============================================================
// FPS DETECTION (CONTAINER-BASED)
// ============================================================

/**
 * Detect the real encoded frame rate by parsing the MP4/MOV container.
 * Falls back to requestVideoFrameCallback if container parsing fails
 * (e.g., for AVI/WebM files).
 */
async function detectFPS(
  file: File | null,
  video: HTMLVideoElement,
  onProgress: ProgressCallback
): Promise<{ fps: number; probe: VideoProbeResult | null }> {
  // Method 1: Container parsing via MP4Box.js (preferred)
  // This reads the REAL encoded frame count and timescale
  if (file && (file.type.includes("mp4") || file.type.includes("quicktime") ||
      file.name.endsWith(".mov") || file.name.endsWith(".mp4") || file.name.endsWith(".m4v"))) {
    onProgress("Reading video metadata...", 0);
    try {
      const probe = await probeVideoProgressive(file);
      console.log(`[FPS] Container: encoded=${probe.encodedFPS}fps, primary=${probe.primaryFPS}fps, frames=${probe.totalEncodedFrames}, VFR=${probe.isVFR}`);
      return { fps: probe.encodedFPS, probe };
    } catch (err) {
      console.warn("[FPS] Container parsing failed, falling back:", err);
    }
  }

  // Method 2: requestVideoFrameCallback (fallback for non-MP4)
  // NOTE: This reports PLAYBACK rate, not capture rate.
  // For iPhone slo-mo, this will report 30fps (wrong).
  onProgress("Detecting video frame rate...", 0);
  if ("requestVideoFrameCallback" in video) {
    const fps = await measurePlaybackFPS(video);
    console.log(`[FPS] Playback measurement: ${fps}fps (may be wrong for slo-mo)`);
    return { fps, probe: null };
  }

  // Method 3: Default fallback
  console.log("[FPS] No detection method available, defaulting to 30fps");
  return { fps: 30, probe: null };
}

/** Measure playback FPS using requestVideoFrameCallback */
async function measurePlaybackFPS(video: HTMLVideoElement): Promise<number> {
  return new Promise<number>((resolve) => {
    const timestamps: number[] = [];
    let frameCount = 0;
    const maxSamples = 15;
    const savedTime = video.currentTime;
    video.currentTime = 0;
    video.muted = true;
    video.playbackRate = 1;

    const done = () => {
      video.pause();
      video.currentTime = savedTime;
      if (timestamps.length >= 5) {
        const intervals: number[] = [];
        for (let i = 1; i < timestamps.length; i++) {
          const dt = timestamps[i] - timestamps[i - 1];
          if (dt > 0.001 && dt < 0.5) intervals.push(dt);
        }
        if (intervals.length >= 3) {
          intervals.sort((a, b) => a - b);
          const median = intervals[Math.floor(intervals.length / 2)];
          resolve(snapFPS(Math.round(1 / median)));
          return;
        }
      }
      resolve(30);
    };

    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      timestamps.push(meta.mediaTime);
      frameCount++;
      if (frameCount < maxSamples) {
        (video as any).requestVideoFrameCallback(onFrame);
      } else {
        done();
      }
    };

    (video as any).requestVideoFrameCallback(onFrame);
    video.play().catch(() => { video.currentTime = savedTime; resolve(30); });
    setTimeout(done, 3000);
  });
}

function snapFPS(fps: number): number {
  const common = [24, 25, 30, 48, 50, 60, 90, 120, 180, 240];
  let closest = 30;
  let minDist = Infinity;
  for (const c of common) {
    const d = Math.abs(fps - c);
    if (d < minDist) { minDist = d; closest = c; }
  }
  return closest;
}

// ============================================================
// TWO-PASS DELIVERY DETECTION (for long videos)
// ============================================================

/**
 * Fast scan: sample at ~30fps, run MediaPipe, measure total body movement.
 * Returns the time window(s) containing pitching deliveries.
 */
async function detectDeliveryWindows(
  video: HTMLVideoElement,
  poseLandmarker: any,
  duration: number,
  onProgress: ProgressCallback
): Promise<Array<{ startSec: number; endSec: number }>> {
  const scanInterval = 1 / FAST_SCAN_FPS;
  const scanFrames = Math.floor(duration / scanInterval);
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d")!;

  onProgress("Scanning for pitching delivery...", 0, `0 / ${scanFrames} frames`);

  // Collect landmark positions at each scan frame
  const positions: Array<{ time: number; landmarks: Record<string, { x: number; y: number }> | null }> = [];
  let lastTs = 0;

  for (let i = 0; i < scanFrames; i++) {
    const time = i * scanInterval;
    video.currentTime = time;

    await new Promise<void>((resolve) => {
      let d = false;
      const f = () => { if (!d) { d = true; resolve(); } };
      video.onseeked = f;
      setTimeout(f, 2000);
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let result: any;
    try {
      const tsMs = Math.round(time * 1000);
      const ts = Math.max(tsMs, lastTs + 1);
      lastTs = ts;
      result = poseLandmarker.detectForVideo(canvas, ts);
    } catch {
      positions.push({ time, landmarks: null });
      continue;
    }

    if (!result?.landmarks?.[0]) {
      positions.push({ time, landmarks: null });
    } else {
      const rawLM = result.landmarks[0];
      const lm: Record<string, { x: number; y: number }> = {};
      for (const [idx, name] of Object.entries(LM_NAMES)) {
        const l = rawLM[Number(idx)];
        if (l && l.visibility > 0.1) lm[name] = { x: l.x, y: l.y };
      }
      positions.push({ time, landmarks: Object.keys(lm).length >= 4 ? lm : null });
    }

    if (i % 10 === 0) {
      onProgress("Scanning for pitching delivery...", Math.round((i / scanFrames) * 100), `${i} / ${scanFrames}`);
    }
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  // Calculate total body movement between consecutive frames
  const movements: Array<{ time: number; movement: number }> = [];
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1].landmarks;
    const curr = positions[i].landmarks;
    if (!prev || !curr) {
      movements.push({ time: positions[i].time, movement: 0 });
      continue;
    }

    let totalDelta = 0;
    let count = 0;
    for (const key of Object.keys(curr)) {
      if (prev[key]) {
        const dx = curr[key].x - prev[key].x;
        const dy = curr[key].y - prev[key].y;
        totalDelta += Math.sqrt(dx * dx + dy * dy);
        count++;
      }
    }
    movements.push({ time: positions[i].time, movement: count > 0 ? totalDelta / count : 0 });
  }

  // Find movement peaks (pitching deliveries)
  // A pitch creates a spike ~5-10x above baseline movement
  const allMovements = movements.map((m) => m.movement).filter((m) => m > 0);
  if (allMovements.length < 5) {
    // Not enough data — return full video
    return [{ startSec: 0, endSec: duration }];
  }

  allMovements.sort((a, b) => a - b);
  const median = allMovements[Math.floor(allMovements.length / 2)];
  const threshold = Math.max(median * 4, 0.01); // Pitch = 4x median movement

  // Find peaks above threshold
  const peaks: Array<{ time: number; movement: number }> = [];
  for (let i = 1; i < movements.length - 1; i++) {
    const m = movements[i];
    if (m.movement > threshold &&
        m.movement >= movements[i - 1].movement &&
        m.movement >= movements[i + 1].movement) {
      // Merge nearby peaks (within 1 second)
      if (peaks.length === 0 || m.time - peaks[peaks.length - 1].time > 1.0) {
        peaks.push(m);
      } else if (m.movement > peaks[peaks.length - 1].movement) {
        peaks[peaks.length - 1] = m;
      }
    }
  }

  if (peaks.length === 0) {
    console.log("[DeliveryDetect] No clear pitch detected, using full video");
    return [{ startSec: 0, endSec: duration }];
  }

  // Create windows around each peak
  const windows = peaks.map((p) => ({
    startSec: Math.max(0, p.time - DELIVERY_WINDOW_BEFORE_SEC),
    endSec: Math.min(duration, p.time + DELIVERY_WINDOW_AFTER_SEC),
  }));

  console.log(`[DeliveryDetect] Found ${peaks.length} pitch(es):`, windows.map(
    (w) => `${w.startSec.toFixed(2)}s → ${w.endSec.toFixed(2)}s`
  ));

  return windows;
}

// ============================================================
// FRAME EXTRACTION + POSE DETECTION
// ============================================================

export async function extractFrames(
  videoUrl: string,
  poseLandmarker: any,
  onProgress: ProgressCallback,
  options?: {
    file?: File | null;
    startSec?: number;
    endSec?: number;
    targetFPS?: number;
  }
): Promise<{ frames: ValidFrame[]; video: HTMLVideoElement; nativeFPS: number }> {
  onProgress("Loading video...", 0);

  // Always create a video element — needed for freeze frame capture later,
  // even when WebCodecs handles the main extraction.
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

  const fullDuration = video.duration;
  if (fullDuration < 0.5) throw new Error("Video is too short.");

  // Detect real encoded FPS from container
  const { fps: nativeFPS, probe } = await detectFPS(
    options?.file || null, video, onProgress
  );

  // Determine analysis window
  const startSec = options?.startSec ?? 0;
  const endSec = options?.endSec ?? fullDuration;
  const windowDuration = endSec - startSec;

  console.log(`[Analysis] FPS=${nativeFPS}, duration=${fullDuration.toFixed(2)}s, window=${startSec.toFixed(2)}-${endSec.toFixed(2)}s (${windowDuration.toFixed(2)}s)`);
  if (probe) {
    console.log(`[Analysis] Container: ${probe.totalEncodedFrames} encoded frames, VFR=${probe.isVFR}, codec=${probe.codec}`);
  }

  // ── TRY WEBCODECS FIRST ────────────────────────────────────
  // WebCodecs decodes every encoded frame from the bitstream.
  // This is faster and more accurate than video.currentTime seeking,
  // especially for 240fps slo-mo where seeking can't hit every 4.17ms frame.
  // Wrapped in a 60-second overall timeout to prevent hanging.
  if (isWebCodecsSupported() && probe && options?.file) {
    try {
      console.log("[Analysis] Attempting WebCodecs extraction...");

      const webCodecsPromise = extractFramesWebCodecs(
        options.file,
        probe,
        poseLandmarker,
        onProgress,
        {
          startSec,
          endSec,
          maxFrames: MAX_ANALYSIS_FRAMES,
        }
      );

      // Overall 60s timeout for the entire WebCodecs pipeline
      const webcodecFrames = await Promise.race([
        webCodecsPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("WebCodecs extraction timed out after 60s")), 60000)
        ),
      ]);

      if (webcodecFrames.length >= MIN_VALID_FRAMES) {
        console.log(`[Analysis] WebCodecs success: ${webcodecFrames.length} valid frames`);
        return { frames: webcodecFrames, video, nativeFPS };
      }

      console.warn(
        `[Analysis] WebCodecs returned only ${webcodecFrames.length} frames (need ${MIN_VALID_FRAMES}), falling back to seek-based extraction`
      );
    } catch (err) {
      console.warn("[Analysis] WebCodecs failed, falling back to seek-based extraction:", err);
    }

    // Show user that we're falling back
    onProgress("Switching to standard extraction...", 0);
  }

  // ── FALLBACK: SEEK-BASED EXTRACTION ────────────────────────
  // Uses video.currentTime to seek to each frame position.
  // Works for all browsers but can't guarantee every frame at high FPS.
  // Cap at 60fps for seek-based — browsers can't reliably seek faster than ~16ms intervals.
  // Higher FPS videos (120/240) will be subsampled; WebCodecs is needed for full frame access.
  const rawTargetFPS = options?.targetFPS ?? nativeFPS;
  const targetFPS = Math.min(rawTargetFPS, 60);
  let sampleFPS = targetFPS;
  if (rawTargetFPS > 60) {
    console.log(`[Analysis] Seek-based fallback: capping ${rawTargetFPS}fps to ${targetFPS}fps (browser seek limitation)`);
  }
  const nativeFrameCount = Math.floor(windowDuration * targetFPS);

  if (nativeFrameCount > MAX_ANALYSIS_FRAMES) {
    sampleFPS = MAX_ANALYSIS_FRAMES / windowDuration;
    console.log(`[Analysis] Subsampling: ${nativeFrameCount} → ${MAX_ANALYSIS_FRAMES} frames at ${sampleFPS.toFixed(1)}fps`);
  }

  const sampleInterval = 1 / sampleFPS;
  const totalFrames = Math.min(Math.floor(windowDuration / sampleInterval), MAX_ANALYSIS_FRAMES);
  const validFrames: ValidFrame[] = [];
  let lastTs = 0;

  // Create reusable canvas for frame capture
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d")!;

  const fpsLabel = nativeFPS >= 120 ? `${nativeFPS}fps slow-mo` : `${nativeFPS}fps`;
  onProgress(`Analyzing ${fpsLabel} video...`, 0, `0 / ${totalFrames} frames`);

  for (let i = 0; i < totalFrames; i++) {
    const time = startSec + i * sampleInterval;
    video.currentTime = time;

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      video.onseeked = finish;
      // 2s timeout per seek — if browser can't seek in 2s, skip this frame
      setTimeout(finish, 2000);
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let result: any;
    try {
      const tsMs = Math.round(time * 1000);
      const ts = Math.max(tsMs, lastTs + 1);
      lastTs = ts;
      result = poseLandmarker.detectForVideo(canvas, ts);
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
      onProgress(`Analyzing ${fpsLabel} video...`, pct, `${i + 1} / ${totalFrames} frames`);
    }

    // Yield to browser
    if (i % (nativeFPS >= 120 ? 20 : 10) === 0) await new Promise((r) => setTimeout(r, 0));
  }

  if (validFrames.length < MIN_VALID_FRAMES) {
    throw new Error(
      `Only ${validFrames.length} usable frames detected. Film in good lighting with the pitcher fully visible head to toe.`
    );
  }

  console.log(`[Analysis] Extracted ${validFrames.length} valid frames from ${totalFrames} samples (${nativeFPS}fps native, ${sampleFPS.toFixed(1)}fps sampled)`);

  return { frames: validFrames, video, nativeFPS };
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
    file?: File | null;
  }
): Promise<AnalysisResult> {
  const { throwingHand, level, file } = options;

  // Stage 0: Probe container for real FPS (before frame extraction)
  let probedFPS = 30;
  let probe: VideoProbeResult | null = null;
  if (file && (file.type.includes("mp4") || file.type.includes("quicktime") ||
      file.name.endsWith(".mov") || file.name.endsWith(".mp4"))) {
    try {
      onProgress("Reading video metadata...", 0);
      probe = await probeVideoProgressive(file);
      probedFPS = probe.encodedFPS;
      console.log(`[Pipeline] Container FPS: ${probedFPS}, frames: ${probe.totalEncodedFrames}`);
    } catch (err) {
      console.warn("[Pipeline] Container probe failed:", err);
    }
  }

  // Stage 0.5: Load video for duration check
  const tempVideo = document.createElement("video");
  tempVideo.playsInline = true;
  tempVideo.muted = true;
  tempVideo.src = videoUrl;
  await new Promise<void>((resolve, reject) => {
    tempVideo.onloadedmetadata = () => resolve();
    tempVideo.onerror = () => reject(new Error("Could not load video."));
    setTimeout(() => reject(new Error("Video load timed out.")), 20000);
    tempVideo.load();
  });
  const fullDuration = tempVideo.duration;
  tempVideo.remove();

  // Stage 0.75: For long videos, detect delivery window(s)
  let deliveryStart = 0;
  let deliveryEnd = fullDuration;

  // Use actual encoded frame count from the container probe when available,
  // because the video element reports PLAYBACK duration (e.g. 16s for a 2s clip at 240fps played at 30fps).
  const totalEncodedFrames = probe?.totalEncodedFrames
    ? probe.totalEncodedFrames
    : Math.floor(fullDuration * probedFPS);

  // Real capture duration = total encoded frames / encoded FPS.
  // A 240fps slo-mo clip with 480 frames is only 2s of real-time action.
  const realDurationSec = totalEncodedFrames / probedFPS;

  // Only run the slow delivery scan for genuinely long clips (>8s of real action AND >1800 frames).
  // Most pitch clips are 2-4s of real action, even if playback duration is 15-20s due to slo-mo.
  if (totalEncodedFrames > MAX_ANALYSIS_FRAMES && realDurationSec > 8) {
    // Long video — need two-pass approach
    console.log(`[Pipeline] Long video: ${realDurationSec.toFixed(1)}s real (${fullDuration.toFixed(1)}s playback), ~${totalEncodedFrames} frames at ${probedFPS}fps. Running delivery detection.`);

    const scanVideo = document.createElement("video");
    scanVideo.playsInline = true;
    scanVideo.muted = true;
    scanVideo.src = videoUrl;
    await new Promise<void>((resolve, reject) => {
      scanVideo.onloadedmetadata = () => resolve();
      scanVideo.onerror = () => reject(new Error("Could not load video for scan."));
      setTimeout(() => reject(new Error("Scan video load timed out.")), 20000);
      scanVideo.load();
    });

    const windows = await detectDeliveryWindows(scanVideo, poseLandmarker, fullDuration, onProgress);
    scanVideo.remove();

    if (windows.length > 0) {
      // Use the first detected pitch
      deliveryStart = windows[0].startSec;
      deliveryEnd = windows[0].endSec;
      const windowFrames = Math.floor((deliveryEnd - deliveryStart) * probedFPS);
      onProgress(
        `Found pitch — analyzing ${(deliveryEnd - deliveryStart).toFixed(1)}s at full ${probedFPS}fps...`,
        0,
        `~${Math.min(windowFrames, MAX_ANALYSIS_FRAMES)} frames`
      );
    }
  }

  // Stage 1: Extract frames (with container-probed FPS)
  const { frames, video, nativeFPS } = await extractFrames(videoUrl, poseLandmarker, onProgress, {
    file,
    startSec: deliveryStart,
    endSec: deliveryEnd,
    targetFPS: probedFPS,
  });

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
  const phaseKeys: PhaseName[] = ["legLift", "drift", "footStrike", "mer", "release", "deceleration"];
  const phaseFrameCaptures: Record<string, string> = {};

  for (let i = 0; i < phaseKeys.length; i++) {
    const phaseKey = phaseKeys[i];
    const phaseResult = phases[phaseKey];
    const frame = frames[phaseResult.frameIndex];

    if (frame) {
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

  // Use container-probed FPS for quality assessment (not the extraction FPS,
  // which may be capped at 60 when the seek-based fallback runs)
  const estimatedFPS = probedFPS > 0 ? probedFPS : nativeFPS;

  onProgress("Analysis complete!", 100);

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  video.remove();

  const fpsQuality = estimatedFPS >= 200 ? "excellent" as const
    : estimatedFPS >= 100 ? "good" as const
    : estimatedFPS >= 50 ? "mediocre" as const
    : "poor" as const;

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
    fpsQuality,
  };
}
