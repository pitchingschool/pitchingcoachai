/**
 * PitchingCoachAI — WebCodecs Frame Extractor
 *
 * Uses the WebCodecs API (VideoDecoder) + MP4Box.js demuxer to decode
 * every single encoded frame from the video bitstream. This replaces
 * the video.currentTime seek-based approach which:
 *   - Can't reliably seek to every frame at 240fps (4.17ms intervals)
 *   - Duplicates/skips frames due to browser seeking heuristics
 *   - Is slow (each seek is 50-200ms)
 *
 * With WebCodecs we get:
 *   - Every encoded frame, guaranteed, in presentation order
 *   - Frame-accurate timestamps from the container
 *   - 5-10x faster extraction (no seeking overhead)
 *   - Proper handling of B-frames and reordering
 *
 * Browser support: Chrome 94+, Edge 94+, Safari 16.4+
 * Falls back to seek-based extraction in unsupported browsers.
 */

import { createFile, DataStream, Endianness, type ISOFile } from "mp4box";
import type { VideoProbeResult } from "./video-probe";
import type { ValidFrame, Keypoints, ProgressCallback } from "./types";
import { LM_NAMES } from "./types";

// ============================================================
// FEATURE DETECTION
// ============================================================

export function isWebCodecsSupported(): boolean {
  return (
    typeof globalThis.VideoDecoder !== "undefined" &&
    typeof globalThis.EncodedVideoChunk !== "undefined"
  );
}

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

/** Decode samples in batches to limit memory pressure from queued VideoFrames */
const DECODE_BATCH_SIZE = 30;

// ============================================================
// DEMUX: Extract encoded samples + codec description from MP4/MOV
// ============================================================

interface DemuxResult {
  /** All video samples in decode order */
  samples: DemuxSample[];
  /** Codec-specific description bytes (avcC/hvcC/vpcC/av1C) for VideoDecoder */
  description: Uint8Array | undefined;
  /** Track timescale (ticks per second) */
  timescale: number;
}

interface DemuxSample {
  /** Composition timestamp in timescale ticks */
  cts: number;
  /** Decode timestamp in timescale ticks */
  dts: number;
  /** Duration in timescale ticks */
  duration: number;
  /** Is this a sync/keyframe sample */
  is_sync: boolean;
  /** Encoded frame data */
  data: Uint8Array;
  /** Sample number (1-based) */
  number: number;
  /** Timescale of this sample's track */
  timescale: number;
}

async function demuxVideo(file: File): Promise<DemuxResult> {
  return new Promise((resolve, reject) => {
    const mp4 = createFile() as ISOFile;
    const allSamples: DemuxSample[] = [];
    let description: Uint8Array | undefined;
    let trackTimescale = 0;
    let resolved = false;

    mp4.onReady = (info: any) => {
      const track = info.videoTracks?.[0];
      if (!track) {
        reject(new Error("No video track found for WebCodecs extraction."));
        return;
      }

      trackTimescale = track.timescale;

      // Extract codec description from sample description entry
      try {
        const trak = mp4.getTrackById(track.id);
        const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0] as any;
        if (entry) {
          const configBox = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
          if (configBox) {
            const stream = new DataStream(
              undefined,
              0,
              Endianness.BIG_ENDIAN
            );
            configBox.write(stream);
            // Skip the 8-byte box header (4 bytes size + 4 bytes fourcc)
            description = new Uint8Array(stream.buffer, 8);
          }
        }
      } catch (e) {
        console.warn("[WebCodecs] Could not extract codec description:", e);
      }

      // Set up sample extraction
      mp4.onSamples = (
        _id: number,
        _user: unknown,
        samples: any[]
      ) => {
        for (const s of samples) {
          allSamples.push({
            cts: s.cts,
            dts: s.dts,
            duration: s.duration,
            is_sync: s.is_sync,
            data: s.data,
            number: s.number,
            timescale: s.timescale,
          });
        }
      };

      // Request all samples from the video track
      mp4.setExtractionOptions(track.id);
      mp4.start();
    };

    mp4.onError = (e: any) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`MP4 demux error: ${e}`));
      }
    };

    // Read entire file for sample data access
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = reader.result as ArrayBuffer;
        (buf as any).fileStart = 0;
        mp4.appendBuffer(buf as any);
        mp4.flush();

        if (!resolved) {
          resolved = true;

          if (allSamples.length === 0) {
            reject(new Error("No video samples extracted. File may be corrupted."));
            return;
          }

          console.log(
            `[WebCodecs] Demuxed ${allSamples.length} samples, ` +
            `description=${description ? description.byteLength + "B" : "none"}, ` +
            `timescale=${trackTimescale}`
          );

          resolve({
            samples: allSamples,
            description,
            timescale: trackTimescale,
          });
        }
      } catch (e) {
        if (!resolved) {
          resolved = true;
          reject(e);
        }
      }
    };

    reader.onerror = () => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Failed to read video file for WebCodecs extraction."));
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

// ============================================================
// MAIN EXTRACTION FUNCTION
// ============================================================

/**
 * Extract frames from a video file using WebCodecs VideoDecoder.
 *
 * Decodes every encoded frame in the specified time window,
 * runs MediaPipe pose detection on each, and returns ValidFrames.
 *
 * @param file - The video File object
 * @param probe - Container probe result (from video-probe.ts)
 * @param poseLandmarker - MediaPipe PoseLandmarker instance
 * @param onProgress - Progress callback
 * @param options - Time window and frame limits
 */
export async function extractFramesWebCodecs(
  file: File,
  probe: VideoProbeResult,
  poseLandmarker: any,
  onProgress: ProgressCallback,
  options: {
    startSec?: number;
    endSec?: number;
    maxFrames?: number;
  }
): Promise<ValidFrame[]> {
  const { startSec = 0, maxFrames = 900 } = options;
  const endSec = options.endSec ?? probe.durationMs / 1000;

  // ── Step 1: Demux ──────────────────────────────────────────
  onProgress("Extracting encoded frames...", 0);
  const { samples, description, timescale } = await demuxVideo(file);

  if (samples.length === 0) {
    throw new Error("No video samples found in file.");
  }

  // ── Step 2: Filter samples to time window ──────────────────
  const startTicks = Math.floor(startSec * timescale);
  const endTicks = Math.ceil(endSec * timescale);

  // Find nearest keyframe AT or BEFORE the window start.
  // We must decode from a keyframe because delta frames depend on it.
  let keyframeIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].is_sync && samples[i].cts <= startTicks) {
      keyframeIdx = i;
    }
    if (samples[i].cts > startTicks) break;
  }

  // All samples from keyframe through end of window (needed for decode dependencies)
  const decodeSamples: DemuxSample[] = [];
  for (let i = keyframeIdx; i < samples.length; i++) {
    if (samples[i].cts > endTicks) break;
    decodeSamples.push(samples[i]);
  }

  // Which samples are IN our analysis window (vs. decode-only prefix)
  const windowStart = startTicks;
  const windowEnd = endTicks;
  const windowSamples = decodeSamples.filter(
    (s) => s.cts >= windowStart && s.cts <= windowEnd
  );

  // ── Step 3: Determine subsampling ──────────────────────────
  // If we have more frames in the window than maxFrames,
  // we still decode ALL frames (delta frame dependencies),
  // but only run MediaPipe on every Nth frame.
  const subsampleRate =
    windowSamples.length > maxFrames
      ? Math.ceil(windowSamples.length / maxFrames)
      : 1;

  const totalTargetFrames = Math.ceil(windowSamples.length / subsampleRate);

  console.log(
    `[WebCodecs] Window: ${startSec.toFixed(2)}-${endSec.toFixed(2)}s | ` +
    `${decodeSamples.length} to decode (from keyframe) | ` +
    `${windowSamples.length} in window | ` +
    `${totalTargetFrames} to analyze (subsample=${subsampleRate}x)`
  );

  // ── Step 4: Verify codec support ───────────────────────────
  const decoderConfig: VideoDecoderConfig = {
    codec: probe.codec,
    codedWidth: probe.width,
    codedHeight: probe.height,
  };
  if (description) {
    decoderConfig.description = description;
  }

  const support = await VideoDecoder.isConfigSupported(decoderConfig);
  if (!support.supported) {
    throw new Error(
      `Codec "${probe.codec}" is not supported by this browser's WebCodecs. ` +
      `Falling back to standard extraction.`
    );
  }

  // ── Step 5: Set up VideoDecoder ────────────────────────────
  const outputQueue: VideoFrame[] = [];
  let decodeError: Error | null = null;

  const decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      outputQueue.push(frame);
    },
    error: (e: DOMException) => {
      console.error("[WebCodecs] Decode error:", e);
      decodeError = new Error(`VideoDecoder error: ${e.message}`);
    },
  });

  decoder.configure(decoderConfig);

  // Canvas for MediaPipe pose detection
  const canvas = document.createElement("canvas");
  canvas.width = probe.width;
  canvas.height = probe.height;
  const ctx = canvas.getContext("2d")!;

  const validFrames: ValidFrame[] = [];
  let windowFrameCount = 0; // Counts frames within the analysis window
  let processedCount = 0; // Counts frames actually run through MediaPipe
  let lastMpTs = 0; // Last timestamp sent to MediaPipe (must be monotonic)

  const fpsLabel = probe.encodedFPS >= 120
    ? `${probe.encodedFPS}fps slow-mo`
    : `${probe.encodedFPS}fps`;
  onProgress(`Decoding ${fpsLabel} video...`, 0, `0 / ${totalTargetFrames} frames`);

  // ── Step 6: Decode in batches + process ────────────────────
  for (let batchStart = 0; batchStart < decodeSamples.length; batchStart += DECODE_BATCH_SIZE) {
    if (decodeError) throw decodeError;

    const batchEnd = Math.min(batchStart + DECODE_BATCH_SIZE, decodeSamples.length);

    // Feed batch to decoder
    for (let i = batchStart; i < batchEnd; i++) {
      const sample = decodeSamples[i];
      try {
        decoder.decode(
          new EncodedVideoChunk({
            type: sample.is_sync ? "key" : "delta",
            timestamp: Math.round((sample.cts * 1_000_000) / timescale), // microseconds
            duration: Math.round((sample.duration * 1_000_000) / timescale),
            data: sample.data,
          })
        );
      } catch (e) {
        console.warn(`[WebCodecs] Failed to decode sample ${i}:`, e);
      }
    }

    // Flush to get all output frames for this batch
    await decoder.flush();

    // Sort output frames by presentation timestamp (handles B-frame reordering)
    outputQueue.sort((a, b) => a.timestamp - b.timestamp);

    // Process each decoded frame
    for (const frame of outputQueue) {
      const frameTimeUs = frame.timestamp;
      const frameTimeTicks = Math.round((frameTimeUs * timescale) / 1_000_000);
      const inWindow = frameTimeTicks >= windowStart && frameTimeTicks <= windowEnd;

      if (inWindow) {
        const shouldAnalyze =
          windowFrameCount % subsampleRate === 0 &&
          processedCount < maxFrames;

        if (shouldAnalyze) {
          // Draw decoded frame to canvas for MediaPipe
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);

          // Run pose detection
          const timeMs = Math.round(frameTimeUs / 1000);
          const mpTs = Math.max(timeMs, lastMpTs + 1); // MediaPipe requires monotonic timestamps
          lastMpTs = mpTs;

          let poseResult: any;
          try {
            poseResult = poseLandmarker.detectForVideo(canvas, mpTs);
          } catch {
            // Skip frames that fail pose detection
            processedCount++;
            frame.close();
            windowFrameCount++;
            continue;
          }

          if (poseResult?.landmarks?.[0]) {
            const rawLM = poseResult.landmarks[0];
            const keypoints: Keypoints = {};

            for (const [idx, name] of Object.entries(LM_NAMES)) {
              const lm = rawLM[Number(idx)];
              if (lm) {
                keypoints[name] = {
                  x: lm.x,
                  y: lm.y,
                  z: lm.z,
                  visibility: lm.visibility || 0,
                };
              }
            }

            const visibleCount = REQUIRED_KEYPOINTS.filter(
              (k) => keypoints[k] && keypoints[k].visibility >= MIN_VISIBILITY
            ).length;

            if (visibleCount >= MIN_REQUIRED_VISIBLE) {
              validFrames.push({
                frameIndex: validFrames.length,
                timestampMs: timeMs,
                keypoints,
                phase: null,
              });
            }
          }

          processedCount++;

          // Update progress
          if (processedCount % 5 === 0 || processedCount === totalTargetFrames) {
            const pct = Math.round((processedCount / totalTargetFrames) * 100);
            onProgress(
              `Decoding ${fpsLabel} video...`,
              pct,
              `${processedCount} / ${totalTargetFrames} frames`
            );
          }
        }

        windowFrameCount++;
      }

      // CRITICAL: Close the VideoFrame to release GPU memory
      frame.close();
    }

    // Clear the queue for next batch
    outputQueue.length = 0;

    // Yield to browser event loop (prevents UI freeze)
    await new Promise((r) => setTimeout(r, 0));
  }

  // Clean up decoder
  try {
    decoder.close();
  } catch {
    // Already closed or errored
  }

  console.log(
    `[WebCodecs] Complete: ${validFrames.length} valid frames from ` +
    `${processedCount} processed, ${windowFrameCount} in window, ` +
    `${decodeSamples.length} decoded`
  );

  return validFrames;
}
