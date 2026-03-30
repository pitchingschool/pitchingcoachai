/**
 * PitchingCoachAI — Video Probe (Container-Level Metadata)
 *
 * Parses MP4/MOV containers using MP4Box.js to extract the REAL
 * encoded frame rate, not the playback rate.
 *
 * WHY THIS EXISTS:
 * iPhone slo-mo videos are 240fps encoded but played back at 30fps.
 * The browser's <video> element reports 30fps. The HTML5 media API
 * reports 30fps. requestVideoFrameCallback fires at 30fps.
 * The ONLY way to know the real rate is to parse the container and
 * read: nb_samples / (duration / timescale).
 *
 * This also detects VFR (variable frame rate) segments — iPhone slo-mo
 * has 30fps bookends around the 240fps middle section.
 */

import { createFile, type ISOFile } from "mp4box";

// ============================================================
// TYPES
// ============================================================

export interface FPSSegment {
  startFrame: number;
  endFrame: number;
  fps: number;
  startTimeMs: number;
  endTimeMs: number;
}

export interface VideoProbeResult {
  /** True encoded frame rate of the video track */
  encodedFPS: number;
  /** Total number of encoded frames in the video track */
  totalEncodedFrames: number;
  /** Video track timescale (ticks per second) */
  timescale: number;
  /** Video duration in milliseconds */
  durationMs: number;
  /** Video dimensions */
  width: number;
  height: number;
  /** Video codec string (e.g., "avc1.64001f") */
  codec: string;
  /** VFR segment map (if variable frame rate detected) */
  segments: FPSSegment[];
  /** Whether this is variable frame rate */
  isVFR: boolean;
  /** The FPS of the segment most likely containing the pitch (longest high-fps segment) */
  primaryFPS: number;
  /** Edit list entries (for slo-mo detection) */
  editList: Array<{
    segmentDuration: number;
    mediaTime: number;
    mediaRateInteger: number;
    mediaRateFraction: number;
  }>;
}

// ============================================================
// SNAP TO COMMON FPS
// ============================================================

const COMMON_FPS = [24, 25, 30, 48, 50, 60, 90, 120, 180, 240, 300, 480];

function snapToCommonFPS(fps: number): number {
  let closest = 30;
  let minDist = Infinity;
  for (const c of COMMON_FPS) {
    const d = Math.abs(fps - c);
    if (d < minDist) {
      minDist = d;
      closest = c;
    }
  }
  // Only snap if within 10% of a common rate
  if (minDist / closest > 0.1) return Math.round(fps);
  return closest;
}

// ============================================================
// MAIN PROBE FUNCTION
// ============================================================

/**
 * Parse a video file's MP4/MOV container to extract the real encoded
 * frame rate, total frame count, and VFR segment map.
 *
 * This works on any MP4/MOV/M4V file. For non-MP4 formats (AVI, WebM),
 * it falls back gracefully.
 */
export function probeVideo(file: File): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const result = parseMP4Container(buffer);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read video file for FPS detection."));
    };

    // Read the first 20MB — enough for all metadata/moov atoms.
    // We don't need the full file for container parsing.
    const sliceSize = Math.min(file.size, 20 * 1024 * 1024);
    reader.readAsArrayBuffer(file.slice(0, sliceSize));
  });
}

/**
 * Parse a video file's container with progressive loading.
 * Handles files where moov atom is at the end (common in MOV files)
 * by loading more data if initial parse doesn't find moov.
 */
export function probeVideoProgressive(file: File): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    const mp4 = createFile() as ISOFile;
    let resolved = false;

    mp4.onReady = (info) => {
      if (resolved) return;
      resolved = true;

      const videoTrack = info.videoTracks?.[0];
      if (!videoTrack) {
        reject(new Error("No video track found in file."));
        return;
      }

      try {
        const result = buildProbeResult(videoTrack, info.timescale);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };

    // Read file in chunks for progressive parsing
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
    let offset = 0;

    function readNextChunk() {
      if (resolved || offset >= file.size) {
        if (!resolved) {
          reject(new Error("Could not parse video container. Try MP4 or MOV format."));
        }
        return;
      }

      const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, file.size));
      const reader = new FileReader();

      reader.onload = () => {
        if (resolved) return;
        const buf = reader.result as ArrayBuffer;
        // MP4Box requires fileStart to be set on the buffer
        (buf as any).fileStart = offset;
        offset += buf.byteLength;

        try {
          mp4.appendBuffer(buf as any);
        } catch {
          // Parse error — try next chunk
        }

        if (!resolved) {
          readNextChunk();
        }
      };

      reader.onerror = () => {
        if (!resolved) reject(new Error("Failed to read video file chunk."));
      };

      reader.readAsArrayBuffer(slice);
    }

    readNextChunk();

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Video container parsing timed out. Try a shorter video."));
      }
    }, 10000);
  });
}

// ============================================================
// CONTAINER PARSING (SYNCHRONOUS)
// ============================================================

function parseMP4Container(buffer: ArrayBuffer): VideoProbeResult {
  const mp4 = createFile() as ISOFile;

  let movieInfo: any = null;

  mp4.onReady = (info: any) => {
    movieInfo = info;
  };

  // Set fileStart on the buffer (required by MP4Box)
  (buffer as any).fileStart = 0;
  mp4.appendBuffer(buffer as any);
  mp4.flush();

  if (!movieInfo) {
    throw new Error(
      "Could not parse video container. The moov atom may be at the end of the file. " +
      "Try trimming the video or converting to MP4."
    );
  }

  const videoTrack = movieInfo.videoTracks?.[0];
  if (!videoTrack) {
    throw new Error("No video track found. Make sure this is a video file.");
  }

  return buildProbeResult(videoTrack, movieInfo.timescale);
}

// ============================================================
// BUILD PROBE RESULT FROM TRACK
// ============================================================

function buildProbeResult(videoTrack: any, movieTimescale: number): VideoProbeResult {
  const nbSamples = videoTrack.nb_samples;
  const timescale = videoTrack.timescale;
  const trackDuration = videoTrack.duration; // in timescale units
  const durationSeconds = trackDuration / timescale;
  const durationMs = durationSeconds * 1000;

  // REAL encoded FPS = total samples / duration in seconds
  const rawFPS = nbSamples / durationSeconds;
  const encodedFPS = snapToCommonFPS(rawFPS);

  // Video dimensions
  const width = videoTrack.video?.width || videoTrack.track_width || 1920;
  const height = videoTrack.video?.height || videoTrack.track_height || 1080;
  const codec = videoTrack.codec || "unknown";

  // Parse edit list for VFR/slo-mo detection
  const editList: VideoProbeResult["editList"] = [];
  const segments: FPSSegment[] = [];
  let isVFR = false;

  if (videoTrack.edits && videoTrack.edits.length > 0) {
    for (const edit of videoTrack.edits) {
      editList.push({
        segmentDuration: edit.segment_duration,
        mediaTime: edit.media_time,
        mediaRateInteger: edit.media_rate_integer,
        mediaRateFraction: edit.media_rate_fraction,
      });
    }

    // Detect VFR from edit list
    // iPhone slo-mo: media_rate_integer varies between segments
    // Normal speed: media_rate = 1, Slo-mo: media_rate < 1 (e.g., 0.125 for 240fps played at 30fps)
    const hasMultipleRates = editList.some(
      (e) => e.mediaRateInteger !== editList[0].mediaRateInteger
    );

    if (hasMultipleRates || editList.length > 1) {
      isVFR = true;
      let frameOffset = 0;
      let timeOffset = 0;

      for (const edit of editList) {
        if (edit.mediaTime < 0) continue; // skip empty edits

        const rate = edit.mediaRateInteger + edit.mediaRateFraction / 65536;
        // Duration of this edit in track timescale
        const editDurationInTrackTime =
          (edit.segmentDuration / movieTimescale) * timescale;
        // Number of source frames in this edit
        const sourceFrames = Math.round(
          (editDurationInTrackTime / trackDuration) * nbSamples
        );
        // Playback FPS for this segment
        const segmentFPS = rate > 0 ? encodedFPS * rate : encodedFPS;
        const segmentDurationMs = (edit.segmentDuration / movieTimescale) * 1000;

        segments.push({
          startFrame: frameOffset,
          endFrame: frameOffset + sourceFrames - 1,
          fps: snapToCommonFPS(segmentFPS),
          startTimeMs: timeOffset,
          endTimeMs: timeOffset + segmentDurationMs,
        });

        frameOffset += sourceFrames;
        timeOffset += segmentDurationMs;
      }
    }
  }

  // If no edit list segments, treat entire video as single segment
  if (segments.length === 0) {
    segments.push({
      startFrame: 0,
      endFrame: nbSamples - 1,
      fps: encodedFPS,
      startTimeMs: 0,
      endTimeMs: durationMs,
    });
  }

  // Primary FPS = the FPS of the longest high-rate segment
  // (for iPhone slo-mo, this is the 240fps middle section)
  let primaryFPS = encodedFPS;
  if (isVFR && segments.length > 1) {
    // Find the segment with the highest encoded frame rate
    // and longest duration (the slo-mo portion)
    let bestSegment = segments[0];
    let bestScore = 0;
    for (const seg of segments) {
      const frameCount = seg.endFrame - seg.startFrame + 1;
      // Score = frame count (we want the segment with the most frames)
      if (frameCount > bestScore) {
        bestScore = frameCount;
        bestSegment = seg;
      }
    }
    primaryFPS = bestSegment.fps;
  }

  const result: VideoProbeResult = {
    encodedFPS,
    totalEncodedFrames: nbSamples,
    timescale,
    durationMs,
    width,
    height,
    codec,
    segments,
    isVFR,
    primaryFPS,
    editList,
  };

  console.log("[VideoProbe] Container analysis:", {
    encodedFPS,
    primaryFPS,
    totalFrames: nbSamples,
    durationSec: durationSeconds.toFixed(2),
    rawFPS: rawFPS.toFixed(2),
    timescale,
    codec,
    isVFR,
    segments: segments.map((s) => `f${s.startFrame}-${s.endFrame} @ ${s.fps}fps`),
    editList: editList.map(
      (e) =>
        `dur=${e.segmentDuration} time=${e.mediaTime} rate=${e.mediaRateInteger}.${e.mediaRateFraction}`
    ),
  });

  return result;
}
