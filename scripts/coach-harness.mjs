/**
 * Coach-label regression harness.
 *
 * Replays the analysis engine OFFLINE against pose streams exported from
 * the app (Debug Info panel -> "Download poses JSON") and compares the
 * results to Coach Grady's frame-by-frame labels in fixtures/labels.json.
 *
 * Usage:
 *   1. Run the clip through the app locally (npm run dev), open the
 *      Debug Info panel on the results page, click "Download poses JSON".
 *   2. Save the file as fixtures/poses/<clip-file-name>.json
 *      (e.g. fixtures/poses/test-clip-2026-10-lhp15.mov.json)
 *   3. npm run harness
 *
 * Tolerances (from the labels file): phase frames within 2 frames at the
 * label frame rate, angles within 10 degrees.
 *
 * The fixtures folder (except labels.json and README) is gitignored:
 * pose JSON contains no video pixels, but it stays local anyway.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures");
const posesDir = path.join(fixturesDir, "poses");

// ── Bundle the engine (TypeScript) into an importable module ──────────
const esbuild = require("esbuild");
const outDir = path.join(root, ".harness");
mkdirSync(outDir, { recursive: true });
const entry = path.join(outDir, "entry.ts");
writeFileSync(
  entry,
  `export { detectPhases, repairSideSwaps } from "../src/lib/phase-detector";
export { calculateAllMetricsWithConfidence } from "../src/lib/biomechanics";
export { gradeAllMetrics } from "../src/lib/grading";
export { resolveEffectiveHand } from "../src/lib/side-resolution";
`
);
const bundlePath = path.join(outDir, "engine.mjs");
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: bundlePath,
  logLevel: "silent",
});
const engine = await import("file://" + bundlePath.replace(/\\/g, "/"));

// ── Load labels ───────────────────────────────────────────────────────
const labelsPath = path.join(fixturesDir, "labels.json");
if (!existsSync(labelsPath)) {
  console.error("fixtures/labels.json not found");
  process.exit(1);
}
const labels = JSON.parse(readFileSync(labelsPath, "utf8"));

const FRAME_TOL = 2; // frames, at the label frame rate
const ANGLE_TOL = 10; // degrees

// Coach label key -> where the engine puts it
const METRIC_MAP = {
  hipShoulderSepAtFFS: ["footStrike", "hipShoulderSep"],
  frontKneeAtFFS: ["footStrike", "leadKneeAngle"],
  armHeightAtFFS: ["footStrike", "shoulderAbductionAtFS"],
  elbowBendAtFFS: ["footStrike", "elbowAngleAtFS"],
  maxLayback: ["mer", "maxLayback"],
};

// Old-app baseline metric key per coach label key (from labels.json)
const BASELINE_MAP = {
  hipShoulderSepAtFFS: "hipShoulderSep",
  frontKneeAtFFS: "frontKneeAtFFS",
  armHeightAtFFS: "armHeightAtLayback",
  elbowBendAtFFS: "elbowBendAtLayback",
  maxLayback: null, // the old app had no coach-definition layback
};

function pad(s, w) {
  s = String(s);
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function fmt(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "not measured" : String(v);
}

let anyRun = false;
let allPass = true;

for (const [clipName, clip] of Object.entries(labels.clips)) {
  const posesPath = path.join(posesDir, clipName + ".json");
  if (!existsSync(posesPath)) {
    console.log(`\n=== ${clipName} ===`);
    console.log(`SKIPPED: no pose export at fixtures/poses/${clipName}.json`);
    console.log("Run the clip through the app and use Debug Info -> Download poses JSON.");
    allPass = false;
    continue;
  }
  anyRun = true;

  const poses = JSON.parse(readFileSync(posesPath, "utf8"));
  const frames = poses.frames;
  const labelFps = clip.fps ?? 30;

  // Hand policy matches the app: the DECLARED hand always wins; the
  // motion detector is a cross-check that can only warn.
  const declared = clip.throwingHand === "left" || clip.throwingHand === "right"
    ? clip.throwingHand
    : (poses.throwingHand ?? "right");
  // Repair leg identity swaps BEFORE the cross-check, exactly as the app
  // does (idempotent; detection and measurement repair the same stream).
  engine.repairSideSwaps(frames);
  const side = engine.resolveEffectiveHand(frames, declared);
  const hand = declared;

  // Aspect ratio from the pose export so measurement uses one unit on
  // both axes (the app passes video width / height the same way).
  const aspect = poses.videoWidth > 0 && poses.videoHeight > 0
    ? poses.videoWidth / poses.videoHeight
    : 1;

  const phases = engine.detectPhases(frames, hand);
  const { metrics } = engine.calculateAllMetricsWithConfidence(frames, phases, hand, aspect);

  // Convert a detected frame (index into the extracted stream) to the
  // label frame numbering (time x label fps) via its timestamp.
  const toLabelFrame = (idx) => {
    const ts = frames[idx]?.timestampMs ?? 0;
    return Math.round((ts / 1000) * labelFps);
  };

  console.log(`\n=== ${clipName} ===`);
  console.log(`athlete: ${clip.athlete}`);
  console.log(`hand: declared ${declared} (wins), detector reads ${side.effectiveHand} (${side.detail})`);
  console.log(`frames in pose stream: ${frames.length} @ ~${poses.estimatedFPS ?? "?"}fps extraction`);

  const rows = [];
  let clipPass = true;

  // ── Phases ──
  const phaseMap = {
    legLift: phases.legLift.frameIndex,
    footStrike: phases.footStrike.frameIndex,
    maxLayback: phases.mer.frameIndex,
    release: phases.release.frameIndex,
  };
  for (const [name, label] of Object.entries(clip.phases)) {
    const detectedIdx = phaseMap[name];
    if (detectedIdx === undefined) continue;
    const detected = toLabelFrame(detectedIdx);
    const lo = (label.frameMin ?? label.frame) - FRAME_TOL;
    const hi = (label.frameMax ?? label.frame) + FRAME_TOL;
    const pass = detected >= lo && detected <= hi;
    if (!pass) clipPass = false;
    const coachRead = label.frameMin
      ? `${label.frameMin}-${label.frameMax}`
      : label.frameMax
        ? `${label.frame}-${label.frameMax}`
        : `${label.frame}`;
    const oldVal = clip.appBaseline?.phases?.[name === "maxLayback" ? "mer" : name];
    rows.push({
      metric: `${name} (frame)`,
      coach: coachRead,
      old: oldVal ?? "?",
      next: detected,
      pass,
    });
  }

  // ── Metrics ──
  for (const [key, label] of Object.entries(clip.metrics)) {
    const mapTo = METRIC_MAP[key];
    if (!mapTo) continue;
    const measured = metrics[mapTo[0]]?.[mapTo[1]] ?? null;
    const tol = label.tolerance ?? ANGLE_TOL;
    const lo = (label.min ?? label.value) - tol;
    const hi = (label.max ?? label.value) + tol;
    const pass = measured !== null && measured >= lo && measured <= hi;
    if (!pass) clipPass = false;
    const baselineKey = BASELINE_MAP[key];
    const oldVal = baselineKey ? clip.appBaseline?.metrics?.[baselineKey] : null;
    rows.push({
      metric: key,
      coach: label.min ? `${label.min}-${label.max}` : `~${label.value}`,
      old: oldVal ?? "n/a",
      next: fmt(measured),
      pass,
    });
  }

  // ── Table ──
  const w = [28, 14, 12, 14, 6];
  console.log(
    "\n" + pad("metric", w[0]) + pad("coach read", w[1]) + pad("old app", w[2]) + pad("new app", w[3]) + "result"
  );
  console.log("-".repeat(w.reduce((a, b) => a + b, 0) + 6));
  for (const r of rows) {
    console.log(
      pad(r.metric, w[0]) + pad(r.coach, w[1]) + pad(r.old, w[2]) + pad(r.next, w[3]) + (r.pass ? "PASS" : "FAIL")
    );
  }
  console.log(`\nclip result: ${clipPass ? "PASS" : "FAIL"}`);
  if (!clipPass) allPass = false;

  // Extra context: all detected phases in label frame numbering
  console.log(
    `detected phases (label frames): legLift ${toLabelFrame(phases.legLift.frameIndex)}, ` +
    `drift ${toLabelFrame(phases.drift.frameIndex)}, FFS ${toLabelFrame(phases.footStrike.frameIndex)}, ` +
    `layback ${toLabelFrame(phases.mer.frameIndex)}, release ${toLabelFrame(phases.release.frameIndex)}, ` +
    `decel ${toLabelFrame(phases.deceleration.frameIndex)}`
  );
}

if (!anyRun) {
  console.log("\nNo clips were run. Export pose JSON first (see header comment).");
  process.exit(2);
}
console.log(`\n${"=".repeat(40)}\nHARNESS: ${allPass ? "ALL PASS" : "FAILURES PRESENT"}`);
process.exit(allPass ? 0 : 1);
