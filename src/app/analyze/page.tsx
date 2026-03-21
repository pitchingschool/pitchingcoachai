"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { runAnalysis } from "@/lib/analysis-engine";
import {
  type AnalysisResult,
  type ProgressCallback,
  type PhaseName,
  type AthleteLevel,
  PHASE_LABELS,
  LEVEL_LABELS,
} from "@/lib/types";
import OverallGradeCard from "@/components/OverallGradeCard";
import PhaseTabs from "@/components/PhaseTabs";
import PhaseFreeze from "@/components/PhaseFreeze";
import Scorecard from "@/components/Scorecard";
import DrillCard from "@/components/DrillCard";

type Stage = "upload" | "analyzing" | "emailGate" | "results";

export default function AnalyzePage() {
  // Core state
  const [stage, setStage] = useState<Stage>("upload");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mpReady, setMpReady] = useState(false);

  // Analysis progress
  const [progressStage, setProgressStage] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [progressDetail, setProgressDetail] = useState("");

  // Options
  const [throwingHand, setThrowingHand] = useState<"left" | "right">("right");
  const [level, setLevel] = useState<AthleteLevel>("hs");

  // Results state
  const [activePhase, setActivePhase] = useState<PhaseName>("footStrike");

  // Email gate
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const poseLandmarkerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================
  // LOAD MEDIAPIPE
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    async function init() {
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
      } catch {
        try {
          const vision = await import("@mediapipe/tasks-vision");
          const filesetResolver = await vision.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
          );
          const landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
          });
          if (!cancelled) {
            poseLandmarkerRef.current = landmarker;
            setMpReady(true);
          }
        } catch {
          if (!cancelled) setError("Failed to load analysis engine. Please use Chrome or Edge.");
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // ============================================================
  // HANDLERS
  // ============================================================
  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExts = ["mp4", "mov", "avi", "webm"];
    const validTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
    if (!validTypes.includes(file.type) && !validExts.includes(ext || "")) {
      setError("Please upload MP4, MOV, AVI, or WebM video.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("File too large. Maximum 100MB.");
      return;
    }
    setError(null);
    setVideoUrl(URL.createObjectURL(file));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoUrl || !poseLandmarkerRef.current) return;
    setStage("analyzing");
    setError(null);

    const onProgress: ProgressCallback = (s, pct, detail) => {
      setProgressStage(s);
      setProgressPct(pct);
      setProgressDetail(detail || "");
    };

    try {
      const analysisResult = await runAnalysis(
        videoUrl,
        poseLandmarkerRef.current,
        onProgress,
        { throwingHand, level }
      );
      setResult(analysisResult);

      // Default to worst-scoring phase tab
      const worstPhase = [...analysisResult.grade.phaseGrades]
        .sort((a, b) => a.score - b.score)[0];
      setActivePhase(worstPhase?.phase || "footStrike");

      const skipGate = document.cookie.includes("pcai_lead=1");
      setStage(skipGate ? "results" : "emailGate");
    } catch (err: any) {
      setError(err.message || "Analysis failed. Try a different video.");
      setStage("upload");
    }
  }, [videoUrl, throwingHand, level]);

  const submitLead = useCallback(async () => {
    if (!firstName.trim() || !email.trim() || !age) return;
    setSubmitting(true);
    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          age: parseInt(age),
          source: source || null,
          overallScore: result?.grade.score || null,
          metrics: result?.metrics || null,
        }),
      });
    } catch { /* Non-blocking */ }
    document.cookie = "pcai_lead=1; max-age=31536000; path=/";
    setSubmitting(false);
    setStage("results");
  }, [firstName, email, phone, age, source, result]);

  const reset = useCallback(() => {
    setStage("upload");
    setVideoUrl(null);
    setResult(null);
    setError(null);
    setProgressPct(0);
    setProgressStage("");
  }, []);

  // Current phase data
  const currentPhaseGrade = result?.grade.phaseGrades.find((p) => p.phase === activePhase);
  const currentPhaseMetrics = currentPhaseGrade?.metrics || [];

  return (
    <div className="min-h-screen bg-brand-dark">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <Link href="/" className="text-xl font-bold tracking-tight">
          PitchingCoach<span className="text-brand-red">AI</span>
        </Link>
        <a href="https://pitchingcoachai.com" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white">
          Book a Lesson &rarr;
        </a>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* ============ UPLOAD ============ */}
        {stage === "upload" && (
          <div>
            <h1 className="text-2xl font-bold mb-2">Analyze Your Pitching Mechanics</h1>
            <p className="text-white/50 text-sm mb-6">
              Upload a side-view video. AI analyzes your drift, foot strike, MER, and release &mdash; your video never leaves your device.
            </p>

            {!mpReady && !error && (
              <div className="text-center py-12 text-white/40 animate-pulse">
                Loading analysis engine...
              </div>
            )}

            {mpReady && (
              <>
                {/* Options */}
                <div className="flex gap-3 mb-6">
                  <div className="flex-1">
                    <label className="text-xs text-white/40 mb-1 block">Throwing Hand</label>
                    <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                      {(["right", "left"] as const).map((hand) => (
                        <button
                          key={hand}
                          onClick={() => setThrowingHand(hand)}
                          className={`flex-1 py-2 rounded-md text-sm font-medium transition ${throwingHand === hand ? "bg-brand-red text-white" : "text-white/50 hover:text-white/80"}`}
                        >
                          {hand === "right" ? "RHP" : "LHP"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-white/40 mb-1 block">Level</label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value as AthleteLevel)}
                      className="w-full py-2.5 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-red"
                    >
                      {Object.entries(LEVEL_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Upload area */}
                {!videoUrl && (
                  <div
                    className="border-2 border-dashed border-white/20 rounded-2xl p-12 text-center cursor-pointer hover:border-white/40 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]); }}
                  >
                    <div className="text-4xl mb-4">&#127909;</div>
                    <p className="text-lg font-medium mb-2">Drop your video here or tap to upload</p>
                    <p className="text-sm text-white/40">Side view, pitcher head to toe, 2-10 seconds</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,video/*"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                    />
                  </div>
                )}

                {/* Video preview */}
                {videoUrl && (
                  <div className="space-y-4">
                    <div className="rounded-xl overflow-hidden bg-black">
                      <video src={videoUrl} className="w-full max-h-64 object-contain" controls muted playsInline />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={reset} className="px-5 py-3 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition">
                        Different Video
                      </button>
                      <button onClick={handleAnalyze} className="flex-1 px-5 py-3 rounded-xl bg-brand-red text-white font-bold text-sm hover:bg-red-700 transition">
                        Analyze My Mechanics &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
                <button onClick={reset} className="block mt-2 underline text-red-300">Try Again</button>
              </div>
            )}

            <p className="text-xs text-white/30 mt-4 text-center">
              Best results: 60fps side view, full body visible, 3-8 seconds
            </p>
          </div>
        )}

        {/* ============ ANALYZING ============ */}
        {stage === "analyzing" && (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full border-4 border-white/10 border-t-brand-red animate-spin" />
            <p className="text-lg font-semibold mb-2">{progressStage}</p>
            {progressPct > 0 && progressPct < 100 && (
              <div className="max-w-xs mx-auto mb-2">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-red rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}
            <p className="text-sm text-white/40">{progressDetail}</p>
          </div>
        )}

        {/* ============ EMAIL GATE ============ */}
        {stage === "emailGate" && (
          <div className="max-w-sm mx-auto text-center py-8">
            <div className="text-5xl mb-4">&#9989;</div>
            <h2 className="text-2xl font-bold mb-2">Your Analysis Is Ready</h2>
            <p className="text-white/50 text-sm mb-8">Enter your info to unlock your free mechanics report</p>
            <div className="space-y-3 text-left">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First Name *"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-brand-red" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email *"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-brand-red" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone (optional)"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-brand-red" />
              <select value={age} onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-brand-red">
                <option value="">Pitcher&apos;s Age *</option>
                {Array.from({ length: 14 }, (_, i) => i + 9).map((a) => (
                  <option key={a} value={a}>{a === 22 ? "22+" : a}</option>
                ))}
              </select>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-brand-red">
                <option value="">How did you hear about us? (optional)</option>
                <option>Google</option>
                <option>Instagram</option>
                <option>Coach referral</option>
                <option>Friend</option>
                <option>Other</option>
              </select>
              <button
                onClick={submitLead}
                disabled={!firstName.trim() || !email.includes("@") || !age || submitting}
                className="w-full py-3 rounded-xl bg-brand-red text-white font-bold hover:bg-red-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Saving..." : "View My Free Report \u2192"}
              </button>
            </div>
          </div>
        )}

        {/* ============ RESULTS ============ */}
        {stage === "results" && result && (
          <div className="space-y-6 pb-16">

            {/* Overall Grade */}
            <OverallGradeCard grade={result.grade} firstName={firstName || undefined} />

            {/* Phase Tabs */}
            <PhaseTabs
              phaseGrades={result.grade.phaseGrades}
              activePhase={activePhase}
              onSelect={setActivePhase}
            />

            {/* Phase Content */}
            <div className="space-y-4">
              <PhaseFreeze
                phase={activePhase}
                imageDataUrl={result.phaseFrameCaptures[activePhase] || null}
                confidence={result.phases[activePhase].confidence}
                phases={result.phases}
              />

              <div>
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
                  {PHASE_LABELS[activePhase]} Metrics
                </h3>
                <Scorecard metrics={currentPhaseMetrics} />
              </div>
            </div>

            {/* Drill Program */}
            {result.drills.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
                  Your Drill Program
                </h3>
                <div className="space-y-3">
                  {result.drills.map((drill, i) => (
                    <DrillCard key={i} drill={drill} />
                  ))}
                </div>
              </div>
            )}

            {/* Positives */}
            {result.grade.phaseGrades.some((pg) => pg.metrics.some((m) => m.color === "green")) && (
              <div>
                <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
                  What&apos;s Working
                </h3>
                {result.grade.phaseGrades.flatMap((pg) =>
                  pg.metrics
                    .filter((m) => m.color === "green")
                    .slice(0, 1)
                    .map((m) => (
                      <div key={m.metricKey} className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 mb-2 text-sm text-green-300">
                        <span className="font-bold">{m.label}</span>: {m.explanation}
                      </div>
                    ))
                ).slice(0, 3)}
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[10px] text-white/20 text-center leading-relaxed">
              PitchingCoachAI uses 2D video analysis which has limitations compared to 3D motion capture.
              Measurements are estimates. If you experience arm pain, consult a sports medicine professional.
            </p>

            {/* CTA */}
            <div className="bg-brand-red rounded-2xl p-6 text-center">
              <h3 className="text-xl font-bold mb-2">Want Expert Eyes on Your Mechanics?</h3>
              <p className="text-sm text-white/80 mb-5">
                Mike Grady has coached pitchers from 10U travel ball to college programs.
                A 30-minute virtual lesson gives you a custom plan based on exactly what we found today.
              </p>
              <div className="space-y-2">
                <a href="https://pitchingcoachai.com" target="_blank" rel="noopener noreferrer"
                  className="block w-full py-3 rounded-xl bg-white text-brand-red font-bold hover:bg-gray-100 transition">
                  Book a Lesson with Mike &rarr;
                </a>
                <a href="mailto:mike@gradyspitchingschool.com?subject=Question%20about%20my%20PitchingCoachAI%20report"
                  className="block w-full py-3 rounded-xl bg-white/20 text-white font-medium hover:bg-white/30 transition">
                  Ask Mike a Question
                </a>
              </div>
              <p className="text-xs text-white/50 mt-3">Or text Mike directly: 330-418-9746</p>
            </div>

            <button onClick={reset} className="w-full py-3 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition">
              Analyze Another Video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
