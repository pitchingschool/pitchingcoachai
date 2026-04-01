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
import PhaseTimeline from "@/components/PhaseTimeline";
import PhaseFreeze from "@/components/PhaseFreeze";
import Scorecard from "@/components/Scorecard";
import DrillCard from "@/components/DrillCard";
import ShareCard from "@/components/ShareCard";
import ProgressBanner from "@/components/ProgressBanner";
import DebugPanel from "@/components/DebugPanel";
import FilmingGuide from "@/components/FilmingGuide";
import PhaseGrid from "@/components/PhaseGrid";
import {
  saveAnalysis,
  compareWithPrevious,
  type ProgressComparison,
  type SavedAnalysis,
} from "@/lib/progress-tracker";
import { analytics } from "@/lib/analytics";

type Stage = "upload" | "analyzing" | "emailGate" | "results";

export default function AnalyzePage() {
  // Core state
  const [stage, setStage] = useState<Stage>("upload");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
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
  const [activePhase, setActivePhase] = useState<PhaseName>("legLift");

  // Email gate
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Progress tracking
  const [progressComparison, setProgressComparison] = useState<ProgressComparison | null>(null);

  const poseLandmarkerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MediaPipe loading status
  const [mpLoadStatus, setMpLoadStatus] = useState("Initializing analysis engine...");

  // ============================================================
  // LOAD MEDIAPIPE
  // ============================================================
  useEffect(() => {
    analytics.pageView("analyze");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        setMpLoadStatus("Downloading AI vision library...");
        const vision = await import("@mediapipe/tasks-vision");
        if (cancelled) return;

        setMpLoadStatus("Loading pose detection model (~12 MB)...");
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );
        if (cancelled) return;

        setMpLoadStatus("Initializing GPU acceleration...");
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
          if (cancelled) return;
          setMpLoadStatus("GPU unavailable — loading CPU mode...");
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
    if (file.size > 500 * 1024 * 1024) {
      setError("File too large. Maximum 500MB.");
      return;
    }
    setError(null);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    analytics.videoUploaded(file.size);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!videoUrl || !poseLandmarkerRef.current) return;
    setStage("analyzing");
    setError(null);
    analytics.analysisStarted();

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
        { throwingHand, level, file: videoFile }
      );
      setResult(analysisResult);

      // Progress tracking — compare with previous and save
      const currentPhases: SavedAnalysis["phases"] = {
        legLift: { score: 0, grade: "C" },
        drift: { score: 0, grade: "C" },
        footStrike: { score: 0, grade: "C" },
        mer: { score: 0, grade: "C" },
        release: { score: 0, grade: "C" },
        deceleration: { score: 0, grade: "C" },
      };
      for (const pg of analysisResult.grade.phaseGrades) {
        if (pg.phase in currentPhases) {
          currentPhases[pg.phase as keyof typeof currentPhases] = {
            score: pg.score,
            grade: pg.grade,
          };
        }
      }

      const comparison = compareWithPrevious(
        analysisResult.grade.score,
        analysisResult.grade.grade,
        currentPhases
      );
      setProgressComparison(comparison);

      // Save this analysis for future comparison
      saveAnalysis({
        date: new Date().toISOString(),
        score: analysisResult.grade.score,
        grade: analysisResult.grade.grade,
        phases: currentPhases,
      });

      // Default to worst-scoring phase tab
      const worstPhase = [...analysisResult.grade.phaseGrades]
        .sort((a, b) => a.score - b.score)[0];
      setActivePhase(worstPhase?.phase || "footStrike");

      analytics.analysisCompleted(analysisResult.grade.score, analysisResult.grade.grade);

      const skipGate = document.cookie.includes("pcai_lead=1");
      if (skipGate) {
        // Returning user — silently track this analysis with stored info
        try {
          const stored = JSON.parse(localStorage.getItem("pcai_lead_info") || "{}");
          if (stored.email) {
            fetch("/api/lead", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                firstName: stored.firstName || "Returning",
                email: stored.email,
                phone: stored.phone || null,
                age: parseInt(stored.age) || 14,
                source: "repeat-analysis",
                overallScore: analysisResult.grade.score || null,
                metrics: analysisResult.metrics || null,
              }),
            }).catch(() => {});
          }
        } catch { /* Non-blocking */ }
        setStage("results");
      } else {
        setStage("emailGate");
      }
    } catch (err: any) {
      analytics.analysisError(err.message || "unknown");
      setError(err.message || "Analysis failed. Try a different video.");
      setStage("upload");
    }
  }, [videoUrl, videoFile, throwingHand, level]);

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
    analytics.leadSubmitted(source || null);
    document.cookie = "pcai_lead=1; max-age=31536000; path=/";
    try {
      localStorage.setItem("pcai_lead_info", JSON.stringify({
        firstName: firstName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        age,
      }));
    } catch { /* localStorage may be unavailable */ }
    setSubmitting(false);
    setStage("results");
  }, [firstName, email, phone, age, source, result]);

  const reset = useCallback(() => {
    setStage("upload");
    setVideoUrl(null);
    setVideoFile(null);
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
        <a href="https://gradyspitchingschool.com" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white">
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
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-white/10 border-t-brand-red animate-spin" />
                <p className="text-sm text-white/50 mb-1">{mpLoadStatus}</p>
                <p className="text-xs text-white/25">First load may take 10-15 seconds</p>
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
                    <p className="text-sm text-white/40 mb-2">Side view, pitcher head to toe, 3&ndash;10 seconds</p>
                    <p className="text-xs text-white/25">MP4, MOV, AVI, or WebM &middot; Max 500MB</p>
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

            <FilmingGuide />
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
            {/* Score teaser */}
            {result && (
              <div className="mb-6">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full border-4 border-white/10 flex items-center justify-center bg-white/5">
                  <span className="text-3xl font-black text-brand-red">{result.grade.score}</span>
                </div>
                <h2 className="text-2xl font-bold mb-1">Your Score: {result.grade.score}/100</h2>
                <p className="text-white/40 text-xs">Grade: {result.grade.grade}</p>
              </div>
            )}
            {!result && (
              <>
                <div className="text-5xl mb-4">&#9989;</div>
                <h2 className="text-2xl font-bold mb-2">Your Analysis Is Ready</h2>
              </>
            )}
            <p className="text-white/50 text-sm mb-6">Enter your info to unlock your full mechanics report with phase breakdowns, metrics, and drill prescriptions</p>
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
          <div className="space-y-6 pb-16 animate-fade-in-up">

            {/* Overall Grade */}
            <div className="animate-count-up">
              <OverallGradeCard grade={result.grade} firstName={firstName || undefined} />
            </div>

            {/* FPS Quality Banner */}
            {result.fpsQuality === "poor" && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-orange-400 text-lg mt-0.5">&#9888;&#65039;</span>
                <div>
                  <p className="text-sm font-bold text-orange-300">Low Frame Rate Detected ({result.estimatedFPS}fps)</p>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">
                    Your video was recorded at {result.estimatedFPS}fps. At this frame rate, the arm moves ~15-20&deg; between frames near MER, which limits detection accuracy. For much better results, <strong className="text-white/70">film in slow motion (240fps)</strong> — most iPhones and Android phones support this in Camera &rarr; Slo-Mo mode.
                  </p>
                </div>
              </div>
            )}
            {result.fpsQuality === "mediocre" && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-yellow-400 text-lg mt-0.5">&#128247;</span>
                <div>
                  <p className="text-sm font-bold text-yellow-300">Moderate Frame Rate ({result.estimatedFPS}fps)</p>
                  <p className="text-xs text-white/50 mt-1 leading-relaxed">
                    Good, but for the best accuracy try filming at <strong className="text-white/70">240fps slow motion</strong>. On iPhone: Camera &rarr; Slo-Mo. This gives 8x more frames in the critical MER-to-release window.
                  </p>
                </div>
              </div>
            )}
            {(result.fpsQuality === "good" || result.fpsQuality === "excellent") && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-green-400 text-lg mt-0.5">&#9889;</span>
                <div>
                  <p className="text-sm font-bold text-green-300">
                    {result.fpsQuality === "excellent" ? "Excellent" : "Great"} Frame Rate ({result.estimatedFPS}fps)
                  </p>
                  <p className="text-xs text-white/50 mt-1">
                    {result.estimatedFPS >= 240
                      ? `${result.totalFrames} frames analyzed with ~4ms precision. Lab-quality detection.`
                      : `${result.totalFrames} frames analyzed with ~8ms precision. Very accurate detection.`}
                  </p>
                </div>
              </div>
            )}

            {/* Key Findings Summary */}
            {(() => {
              const allMetrics = result.grade.phaseGrades.flatMap(pg => pg.metrics);
              const strengths = allMetrics.filter(m => m.grade === "A+" || m.grade === "A").slice(0, 2);
              const weaknesses = allMetrics
                .filter(m => (m.grade === "C" || m.grade === "D" || m.grade === "F") && !m.injuryFlag)
                .slice(0, 2);
              const injuries = allMetrics.filter(m => m.injuryFlag);

              if (strengths.length === 0 && weaknesses.length === 0 && injuries.length === 0) return null;

              return (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider">Key Findings</h3>

                  {injuries.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-red-400 text-sm mt-0.5">&#9888;&#65039;</span>
                      <p className="text-sm text-red-300">
                        <span className="font-bold">Watch:</span>{" "}
                        {injuries.map(m => m.label).join(" and ")} {injuries.length === 1 ? "is" : "are"} in a range that increases injury risk.
                      </p>
                    </div>
                  )}

                  {weaknesses.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-yellow-400 text-sm mt-0.5">&#128170;</span>
                      <p className="text-sm text-white/60">
                        <span className="font-bold text-white/80">Work on:</span>{" "}
                        {weaknesses.map(m => m.label).join(" and ")} &mdash; biggest areas for improvement.
                      </p>
                    </div>
                  )}

                  {strengths.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-green-400 text-sm mt-0.5">&#9989;</span>
                      <p className="text-sm text-white/60">
                        <span className="font-bold text-white/80">Strengths:</span>{" "}
                        {strengths.map(m => m.label).join(" and ")} {strengths.length === 1 ? "looks" : "look"} great.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Progress comparison (return visitors) */}
            {progressComparison && (
              <ProgressBanner comparison={progressComparison} />
            )}

            {/* Phase Timeline */}
            <PhaseTimeline
              phases={result.phases}
              phaseGrades={result.grade.phaseGrades}
              activePhase={activePhase}
              onSelect={setActivePhase}
              totalDurationMs={result.frames[result.frames.length - 1]?.timestampMs || 1000}
            />

            {/* All Phases Grid */}
            <PhaseGrid
              phaseGrades={result.grade.phaseGrades}
              phaseFrameCaptures={result.phaseFrameCaptures}
              phases={result.phases}
              activePhase={activePhase}
              onSelect={setActivePhase}
            />

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

            {/* Share Card */}
            <div>
              <h3 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-3">
                Share Your Results
              </h3>
              <ShareCard grade={result.grade} firstName={firstName || undefined} />
            </div>

            {/* Injury warnings callout */}
            {result.grade.phaseGrades.flatMap(pg => pg.metrics).some(m => m.injuryFlag) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">&#9888;&#65039;</div>
                  <div>
                    <h3 className="text-sm font-bold text-red-400 mb-1">Injury Risk Detected</h3>
                    <p className="text-xs text-white/60 leading-relaxed mb-2">
                      Your analysis flagged mechanics that increase injury risk. These aren&apos;t meant to scare you &mdash; they&apos;re meant to help you fix problems before they become injuries.
                    </p>
                    {result.grade.phaseGrades.flatMap(pg => pg.metrics).filter(m => m.injuryFlag).map(m => (
                      <div key={m.metricKey} className="text-xs text-red-300 bg-red-500/10 rounded-lg px-3 py-2 mb-1">
                        <span className="font-bold">{m.label}</span>: {m.explanation}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[10px] text-white/20 text-center leading-relaxed">
              PitchingCoachAI uses 2D video analysis which has limitations compared to 3D motion capture.
              Measurements are estimates. If you experience arm pain, consult a sports medicine professional.
            </p>

            {/* CTA — contextual based on findings */}
            {(() => {
              const weakPhases = result.grade.phaseGrades
                .filter((pg) => pg.grade === "C" || pg.grade === "D")
                .map((pg) => PHASE_LABELS[pg.phase]);
              const weakMetrics = result.grade.phaseGrades
                .flatMap((pg) => pg.metrics)
                .filter((m) => m.color === "red" || m.color === "yellow");
              const issueCount = weakMetrics.length;

              return (
                <div className="bg-gradient-to-br from-brand-red to-red-700 rounded-2xl p-6 text-center">
                  <h3 className="text-xl font-bold mb-2">
                    {issueCount > 0
                      ? `This Analysis Found ${issueCount} Area${issueCount > 1 ? "s" : ""} to Improve`
                      : "Want to Take Your Mechanics to the Next Level?"}
                  </h3>
                  <p className="text-sm text-white/80 mb-5">
                    {weakPhases.length > 0
                      ? `Your ${weakPhases.join(" and ")} mechanics need attention. A certified pitching coach can build a personalized development plan to fix these issues and protect your arm.`
                      : "AI analysis gives you the data. A real pitching coach turns it into a development plan. Mike Grady has 20 years of experience coaching 100+ pitchers from 10U to college."}
                  </p>
                  <div className="space-y-2">
                    <a href="https://gradyspitchingschool.com" target="_blank" rel="noopener noreferrer"
                      className="block w-full py-3 rounded-xl bg-white text-brand-red font-bold hover:bg-gray-100 transition">
                      Book a Session with Coach Grady &rarr;
                    </a>
                    <a href="mailto:mike@gradyspitchingschool.com?subject=PitchingCoachAI%20Report%20-%20Question"
                      className="block w-full py-3 rounded-xl bg-white/20 text-white font-medium hover:bg-white/30 transition text-sm">
                      Have a Question? Email Mike
                    </a>
                  </div>
                  <p className="text-xs text-white/50 mt-3">
                    Grady&apos;s Pitching School &middot; North Canton, OH &middot; In-person &amp; virtual lessons
                  </p>
                </div>
              );
            })()}

            <button onClick={reset} className="w-full py-3 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition">
              Analyze Another Video
            </button>

            {/* Debug Panel (for validation) */}
            <DebugPanel
              phases={result.phases}
              frames={result.frames}
              totalFrames={result.totalFrames}
              estimatedFPS={result.estimatedFPS}
              videoWidth={result.videoWidth}
              videoHeight={result.videoHeight}
              throwingHand={throwingHand}
              fpsQuality={result.fpsQuality}
            />
          </div>
        )}
      </div>
    </div>
  );
}
