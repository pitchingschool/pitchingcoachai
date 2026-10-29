"use client";

/**
 * DEV ONLY harness page: runs a fixtures/ clip through the real
 * analysis pipeline (same code as /analyze), shows the detected phases
 * against Coach Grady's labels, and saves the pose stream to
 * fixtures/poses/ for the offline comparison (npm run harness).
 * Renders nothing in production builds.
 */

import { useEffect, useRef, useState } from "react";
import { runAnalysis } from "@/lib/analysis-engine";
import type { AnalysisResult } from "@/lib/types";
import labels from "../../../fixtures/labels.json";

type RunState = {
  status: string;
  pct: number;
  result: AnalysisResult | null;
  saved: string | null;
  error: string | null;
  servedFile: string | null;
};

const LEVEL_MAP: Record<string, string> = {
  "12u": "12u",
  "14u": "14u",
  highschool: "hs",
  hs: "hs",
  college: "college",
  pro: "pro",
};

export default function HarnessPage() {
  const [mpReady, setMpReady] = useState(false);
  const [mpStatus, setMpStatus] = useState("Loading pose model...");
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const poseLandmarkerRef = useRef<any>(null);

  const isProd = process.env.NODE_ENV === "production";

  useEffect(() => {
    if (isProd) return;
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );
        const landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (!cancelled) {
          poseLandmarkerRef.current = landmarker;
          setMpReady(true);
        }
      } catch (e: any) {
        if (!cancelled) setMpStatus("Pose model failed to load: " + (e?.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isProd]);

  if (isProd) return null;

  const clips = Object.entries((labels as any).clips) as Array<[string, any]>;

  async function runClip(clipName: string, clip: any) {
    const EMPTY: RunState = { status: "", pct: 0, result: null, saved: null, error: null, servedFile: null };
    const update = (patch: Partial<RunState>) =>
      setRuns((r) => ({
        ...r,
        [clipName]: { ...EMPTY, ...r[clipName], ...patch },
      }));

    update({ status: "Fetching clip...", error: null, result: null, saved: null });
    try {
      const res = await fetch(`/api/dev-fixture?name=${encodeURIComponent(clipName)}`);
      if (!res.ok) throw new Error(`fixture fetch failed: ${res.status} ${await res.text()}`);
      const servedFile = res.headers.get("X-Served-File") || clipName;
      const blob = await res.blob();
      const file = new File([blob], servedFile, { type: blob.type });
      const url = URL.createObjectURL(blob);
      update({ servedFile });

      const level = (LEVEL_MAP[clip.level] || "hs") as any;
      const hand = clip.throwingHand === "left" ? "left" : "right";

      const result = await runAnalysis(
        url,
        poseLandmarkerRef.current,
        (s, pct) => update({ status: s, pct }),
        { throwingHand: hand, level, file }
      );
      URL.revokeObjectURL(url);
      update({ result, status: "Saving poses..." });

      const save = await fetch("/api/dev-poses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clipName,
          payload: {
            exportedAt: new Date().toISOString(),
            estimatedFPS: result.estimatedFPS,
            videoWidth: result.videoWidth,
            videoHeight: result.videoHeight,
            throwingHand: result.effectiveHand,
            totalFrames: result.totalFrames,
            frames: result.frames,
          },
        }),
      });
      const saveInfo = save.ok ? await save.json() : null;
      update({
        status: "Done",
        saved: saveInfo?.saved || null,
      });
    } catch (e: any) {
      update({ status: "Failed", error: e?.message || String(e) });
    }
  }

  function labelFrame(result: AnalysisResult, idx: number, fps: number): number {
    const ts = result.frames[idx]?.timestampMs ?? 0;
    return Math.round((ts / 1000) * fps);
  }

  return (
    <div className="min-h-screen bg-brand-dark text-white p-8 font-mono text-sm">
      <h1 className="text-xl font-bold mb-1">Coach-label harness (dev)</h1>
      <p className="text-white/50 mb-6">
        {mpReady ? "Pose model ready." : mpStatus} Clips come from fixtures/ and never leave this machine.
      </p>

      {clips.map(([clipName, clip]) => {
        const run = runs[clipName];
        const fps = clip.fps ?? 30;
        return (
          <div key={clipName} className="border border-white/15 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-bold">{clipName}</div>
                <div className="text-white/40 text-xs">{clip.athlete}</div>
              </div>
              <button
                disabled={!mpReady}
                onClick={() => runClip(clipName, clip)}
                className="px-4 py-2 rounded bg-brand-red font-bold disabled:opacity-40"
              >
                Run
              </button>
            </div>

            {run && (
              <div className="mt-3 space-y-1">
                <div className="text-white/60">
                  {run.status} {run.pct > 0 && run.pct < 100 ? `${run.pct}%` : ""}
                  {run.servedFile && run.servedFile !== clipName && (
                    <span className="text-yellow-400"> (using transcoded copy {run.servedFile})</span>
                  )}
                </div>
                {run.error && <div className="text-red-400">{run.error}</div>}
                {run.result && (
                  <div className="space-y-1">
                    <div>
                      hand: declared {run.result.throwingHand}, effective {run.result.effectiveHand}
                      {run.result.handMismatch ? " (MISMATCH)" : ""} | body height{" "}
                      {Math.round(run.result.bodyHeightFraction * 100)}% of frame
                      {run.result.framingWarning ? " (FRAMING WARNING)" : ""}
                    </div>
                    <table className="text-xs">
                      <tbody>
                        {(["footStrike", "mer", "release"] as const).map((p) => {
                          const detected = labelFrame(run.result!, run.result!.phases[p].frameIndex, fps);
                          const labelName = p === "mer" ? "maxLayback" : p;
                          const want = clip.phases?.[labelName];
                          const lo = want ? (want.frameMin ?? want.frame) - 2 : null;
                          const hi = want ? (want.frameMax ?? want.frame) + 2 : null;
                          const pass = want ? detected >= (lo as number) && detected <= (hi as number) : null;
                          return (
                            <tr key={p}>
                              <td className="pr-4">{labelName}</td>
                              <td className="pr-4">coach: {want ? (want.frameMin ? `${want.frameMin}-${want.frameMax}` : want.frame) : "?"}</td>
                              <td className="pr-4">app: {detected}</td>
                              <td className={pass === null ? "" : pass ? "text-green-400" : "text-red-400"}>
                                {pass === null ? "" : pass ? "PASS" : "FAIL"}
                              </td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="pr-4">separation at FFS</td>
                          <td className="pr-4">coach: ~{clip.metrics?.hipShoulderSepAtFFS?.value}</td>
                          <td className="pr-4" colSpan={2}>
                            app: {run.result.metrics.footStrike.hipShoulderSep ?? "not measured"}
                          </td>
                        </tr>
                        <tr>
                          <td className="pr-4">front knee at FFS</td>
                          <td className="pr-4">coach: {clip.metrics?.frontKneeAtFFS?.min}-{clip.metrics?.frontKneeAtFFS?.max}</td>
                          <td className="pr-4" colSpan={2}>app: {run.result.metrics.footStrike.leadKneeAngle ?? "not measured"}</td>
                        </tr>
                        <tr>
                          <td className="pr-4">arm height at FFS</td>
                          <td className="pr-4">coach: ~{clip.metrics?.armHeightAtFFS?.value}</td>
                          <td className="pr-4" colSpan={2}>app: {run.result.metrics.footStrike.shoulderAbductionAtFS ?? "not measured"}</td>
                        </tr>
                        <tr>
                          <td className="pr-4">elbow bend at FFS</td>
                          <td className="pr-4">coach: ~{clip.metrics?.elbowBendAtFFS?.value}</td>
                          <td className="pr-4" colSpan={2}>app: {run.result.metrics.footStrike.elbowAngleAtFS ?? "not measured"}</td>
                        </tr>
                        <tr>
                          <td className="pr-4">max layback</td>
                          <td className="pr-4">coach: ~{clip.metrics?.maxLayback?.value}</td>
                          <td className="pr-4" colSpan={2}>app: {run.result.metrics.mer.maxLayback ?? "not measured"}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="text-white/50">
                      overall score: {run.result.grade.score} ({run.result.grade.grade}) | fps {run.result.estimatedFPS} |{" "}
                      {run.result.totalFrames} frames
                    </div>
                    {run.saved && <div className="text-green-400">saved {run.saved} (run: npm run harness)</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
