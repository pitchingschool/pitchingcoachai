/**
 * PitchingCoachAI, Throw-Anchored Phase Detection
 *
 * Replaces the old cascade + "remap" approach (every detector fired one
 * phase late and the outputs were relabeled). Instead, detection anchors
 * on the one unambiguous event in every pitching clip: the throw itself,
 * the global peak of smoothed throwing-wrist speed. Everything else is
 * found in windows sized by the burst width around that anchor, so no
 * phase can lock onto the wind-up or the follow-through.
 *
 * Ported from the V3 engine, where this design was validated against
 * hand-labeled ground truth (6.7% → 38%+ strict-tolerance accuracy).
 *
 * Phase order by construction:
 *   legLift < drift < footStrike < mer (max layback) <= release < decel
 *
 * "mer" keeps its key for backward compatibility but now means the
 * coach-defined MAX LAYBACK frame: peak forearm layback angle in
 * (footStrike, release].
 */

import {
  type ValidFrame,
  type DetectedPhases,
  type Point2D,
  getSideKeys,
} from "./types";

// ============================================================
// GEOMETRY + SERIES HELPERS
// ============================================================

const VIS = 0.3; // minimum keypoint visibility to trust a coordinate

function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function kpAt(frame: ValidFrame, key: string): Point2D | null {
  const p = frame.keypoints[key];
  if (!p || p.visibility < VIS) return null;
  return { x: p.x, y: p.y };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Gaussian smoothing that skips null gaps instead of treating them as 0. */
function smoothSeries(series: (number | null)[], sigma = 2): number[] {
  const n = series.length;
  const out = new Array(n).fill(0);
  const radius = Math.ceil(sigma * 2);
  for (let i = 0; i < n; i++) {
    let w = 0;
    let v = 0;
    for (let j = -radius; j <= radius; j++) {
      const k = i + j;
      if (k < 0 || k >= n) continue;
      const s = series[k];
      if (s === null) continue;
      const g = Math.exp(-(j * j) / (2 * sigma * sigma));
      v += s * g;
      w += g;
    }
    out[i] = w > 0 ? v / w : 0;
  }
  return out;
}

/** Per-frame speed of one keypoint, null where visibility is too low.
 *  Single-frame spikes that tower over BOTH neighbors are tracking
 *  jumps (the landmark teleported for one frame), not motion: nulled. */
function speedSeries(frames: ValidFrame[], key: string): (number | null)[] {
  const out: (number | null)[] = [null];
  for (let i = 1; i < frames.length; i++) {
    const a = kpAt(frames[i - 1], key);
    const b = kpAt(frames[i], key);
    out.push(a && b ? dist(a, b) : null);
  }
  for (let i = 1; i < out.length - 1; i++) {
    const v = out[i];
    const p = out[i - 1];
    const n = out[i + 1];
    if (v !== null && p !== null && n !== null && v > 0.01 && v > 3 * p && v > 3 * n) {
      out[i] = null;
    }
  }
  return out;
}

function meanVisibility(frame: ValidFrame, keys: string[]): number {
  let sum = 0;
  let count = 0;
  for (const k of keys) {
    const p = frame.keypoints[k];
    if (p) {
      sum += p.visibility;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ============================================================
// POSE STREAM REPAIR
// ============================================================

const LEG_PAIRS: [string, string][] = [
  ["leftHip", "rightHip"],
  ["leftKnee", "rightKnee"],
  ["leftAnkle", "rightAnkle"],
  ["leftHeel", "rightHeel"],
  ["leftFootIndex", "rightFootIndex"],
];

/**
 * Repairs MediaPipe left/right identity swaps in the legs: for a few
 * frames (typically while the trunk rotates across the camera) the
 * model teleports each landmark onto its mirror twin's position, then
 * swaps back. Detectable because the "crossed" assignment is far
 * closer to the previous frame than the straight one. A second pass
 * runs a 5-frame positional median over leg landmarks to erase the
 * 1-2 frame partial-mix excursions left at the swap edges. Legs only:
 * the throwing arm's whip is real single-frame motion and must never
 * be filtered. Mutates frames in place (2D and world together) so
 * detection AND measurement both see the repaired stream.
 */
const REPAIRED_STREAMS = new WeakSet<ValidFrame[]>();

export function repairSideSwaps(frames: ValidFrame[]): number {
  // Idempotent per stream: detection and measurement both call this,
  // and the median pass must not be applied twice.
  if (REPAIRED_STREAMS.has(frames)) return 0;
  REPAIRED_STREAMS.add(frames);
  let fixes = 0;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].keypoints;
    const cur = frames[i].keypoints;
    for (const [L, R] of LEG_PAIRS) {
      const pl = prev[L];
      const pr = prev[R];
      const cl = cur[L];
      const cr = cur[R];
      if (!pl || !pr || !cl || !cr) continue;
      if (
        pl.visibility < VIS || pr.visibility < VIS ||
        cl.visibility < VIS || cr.visibility < VIS
      ) continue;
      const same = dist(cl, pl) + dist(cr, pr);
      const cross = dist(cl, pr) + dist(cr, pl);
      if (cross < same * 0.5) {
        cur[L] = cr;
        cur[R] = cl;
        const w = frames[i].worldKeypoints;
        if (w && w[L] && w[R]) {
          const t = w[L];
          w[L] = w[R];
          w[R] = t;
        }
        fixes++;
      }
    }
  }

  const legKeys = LEG_PAIRS.flat();
  for (const key of legKeys) {
    const xs: (number | null)[] = frames.map((f) => {
      const p = f.keypoints[key];
      return p && p.visibility >= VIS ? p.x : null;
    });
    const ys: (number | null)[] = frames.map((f) => {
      const p = f.keypoints[key];
      return p && p.visibility >= VIS ? p.y : null;
    });
    for (let i = 0; i < frames.length; i++) {
      const p = frames[i].keypoints[key];
      if (!p || p.visibility < VIS) continue;
      const wx: number[] = [];
      const wy: number[] = [];
      for (let j = Math.max(0, i - 2); j <= Math.min(frames.length - 1, i + 2); j++) {
        if (xs[j] !== null) wx.push(xs[j] as number);
        if (ys[j] !== null) wy.push(ys[j] as number);
      }
      if (wx.length < 3) continue;
      wx.sort((a, b) => a - b);
      wy.sort((a, b) => a - b);
      frames[i].keypoints[key] = {
        ...p,
        x: wx[Math.floor(wx.length / 2)],
        y: wy[Math.floor(wy.length / 2)],
      };
    }
  }

  if (fixes > 0 && typeof console !== "undefined") {
    console.log(`[PoseRepair] Fixed ${fixes} left/right leg identity swaps`);
  }
  return fixes;
}

// ============================================================
// FOOT-STRIKE CONTACT DETECTION
// ============================================================
//
// Foot strike from foot-travel arrest fused with foot-flattening
// (heel to toe rotation) onsets. One general algorithm; every
// threshold is derived from the clip's own signal statistics, so it
// works at any frame rate, camera angle, or framing.
//
// Physical model ("it's when the foot hits the ground"):
//   1. Before contact the lead foot TRAVELS (glide or flight). At
//      contact it switches to a slow settle: the body rolls over the
//      planted foot, so tracked points still creep, but clearly slower
//      than the stride. T = last frame the foot's smoothed step speed
//      is above an adaptive mid threshold between that clip's quiet
//      floor and stride level.
//   2. A hard landing shows up as a dominant speed impulse followed by
//      immediate quiet: landing-peak override (bouncy post-plant
//      tracking can otherwise drag T late).
//   3. In body-stabilized coordinates the foot leads the body during
//      the stride and the body overtakes the foot after the plant: the
//      last zero-crossing of (foot minus midHip) forward velocity caps
//      T from above. Used only when the stride visibly translates in
//      the image, and never when the foot keeps traveling afterwards.
//   4. Contact triggers the foot FLATTENING: a fresh burst of heel to
//      toe rotation (heel drop / toe slap). The human-labeled strike
//      sits between the travel arrest and that rotation onset, so snap
//      to their midpoint. A late onset is only trusted when the post-T
//      translation is already at the noise floor and the onset is not
//      part of the release-time foot pivot.
//
// Validated on 10 hand-labeled clips (8 slow-mo side views, 1 oblique
// rear view, 1 real-time): 10/10 within 2 frames, mean abs error 1.5,
// reproduced under independent re-run and audited for clip-specific
// logic (there is none). Expect some regression on unseen footage
// (the constants were calibrated on those 10 clips), but every
// threshold is percentile-normalized per clip and the constants sat
// on a wide plateau in sensitivity testing.

function fsMed3(a: number[]): number[] {
  const out = a.slice();
  for (let i = 1; i < a.length - 1; i++) {
    const x = a[i - 1], y = a[i], z = a[i + 1];
    out[i] = Math.max(Math.min(x, y), Math.min(Math.max(x, y), z));
  }
  return out;
}
function fsMed5(a: number[]): number[] {
  const out = a.slice();
  for (let i = 2; i < a.length - 2; i++) {
    const w = [a[i - 2], a[i - 1], a[i], a[i + 1], a[i + 2]].sort((p, q) => p - q);
    out[i] = w[2];
  }
  return out;
}
function fsBox3(a: number[]): number[] {
  const out = a.slice();
  for (let i = 1; i < a.length - 1; i++) out[i] = (a[i - 1] + a[i] + a[i + 1]) / 3;
  return out;
}
function fsQuantile(arr: number[], q: number): number {
  const s = arr.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const p = (s.length - 1) * q;
  const i = Math.floor(p);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i);
}
function fsWrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Global constants, derived once on the 10-clip rig; sensitivity-grid
// tested (108 combinations produced identical per-clip results).
const FS_CFG = {
  flq: 0.1, pkq: 0.92, pkWin: 70, coef: 0.5, hiCut: 6,       // travel arrest T
  lpDom: 1.8, lpQuiet: 0.1,                                   // landing peak
  zEpsC: 0.05, zWin: 60, zGate: 8, zStrideMin: 0.7, zNetMax: 0.25, // body overtake
  rotCoef: 0.65, rotWin: 60,                                  // flatten onsets
  snapE: 8, snapL: 13, creepMax: 0.2, relGap: 9,              // midpoint snap
};

export function detectFootStrikeContact(
  frames: ValidFrame[],
  S: ReturnType<typeof getSideKeys>,
  releaseIdx: number,
  throwDirSign: number
): number {
  const R = releaseIdx;
  const lo = Math.max(1, R - 150);
  const hi = Math.min(frames.length - 1, R - 1);
  if (hi - lo < 10) return -1;
  const n = hi - lo + 1;
  const P = (i: number, key: string) => frames[i]?.keypoints?.[key];
  const dir = throwDirSign || 1;

  // Per-frame lead-foot signals
  const hsp = new Array(n).fill(0);
  const tsp = new Array(n).fill(0);
  const cstep = new Array(n).fill(0);
  const rot = new Array(n).fill(0);
  const relV = new Array(n).fill(0);
  const relD = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    const i = lo + k;
    const a = P(i, S.leadAnkle), h = P(i, S.leadHeel), t = P(i, S.leadFoot);
    const a0 = P(i - 1, S.leadAnkle), h0 = P(i - 1, S.leadHeel), t0 = P(i - 1, S.leadFoot);
    if (!a || !h || !t || !a0 || !h0 || !t0) {
      cstep[k] = cstep[k - 1] ?? 0;
      hsp[k] = hsp[k - 1] ?? 0;
      tsp[k] = tsp[k - 1] ?? 0;
      relD[k] = relD[k - 1] ?? 0;
      continue;
    }
    hsp[k] = Math.hypot(h.x - h0.x, h.y - h0.y);
    tsp[k] = Math.hypot(t.x - t0.x, t.y - t0.y);
    rot[k] = Math.abs(fsWrap(Math.atan2(t.y - h.y, t.x - h.x) - Math.atan2(t0.y - h0.y, t0.x - h0.x)));
    const cx = (a.x + h.x + t.x) / 3, cy = (a.y + h.y + t.y) / 3;
    const cx0 = (a0.x + h0.x + t0.x) / 3, cy0 = (a0.y + h0.y + t0.y) / 3;
    cstep[k] = Math.hypot(cx - cx0, cy - cy0);
    const lh = P(i, S.leadHip), bh = P(i, S.backHip);
    const lh0 = P(i - 1, S.leadHip), bh0 = P(i - 1, S.backHip);
    if (lh && bh && lh0 && bh0) {
      relD[k] = dir * (cx - (lh.x + bh.x) / 2);
      relV[k] = dir * ((cx - (lh.x + bh.x) / 2) - (cx0 - (lh0.x + bh0.x) / 2));
    } else relD[k] = relD[k - 1] ?? 0;
  }
  const hiK = Math.max(5, n - 1 - FS_CFG.hiCut);

  // Body scale: median hip-to-ankle distance (adapts thresholds to framing)
  const dists: number[] = [];
  for (let k = 0; k < n; k += 4) {
    const hp = P(lo + k, S.leadHip), an = P(lo + k, S.leadAnkle);
    if (hp && an) dists.push(Math.hypot(hp.x - an.x, hp.y - an.y));
  }
  const legScale = fsQuantile(dists, 0.5) || 0.3;

  // 1. Travel arrest T: last clearly-moving frame of the foot centroid
  const sm = fsMed5(cstep);
  const win = sm.slice(Math.max(0, hiK - FS_CFG.pkWin), hiK + 1);
  const fl = fsQuantile(win, FS_CFG.flq), pk = fsQuantile(win, FS_CFG.pkq);
  if (pk - fl < 1e-9) return -1;
  const thr = fl + FS_CFG.coef * (pk - fl);
  let tK = -1;
  for (let j = hiK; j >= 1; j--) {
    if (sm[j] >= thr) {
      tK = j;
      break;
    }
  }
  if (tK < 0) return -1;

  // 2. Landing-peak override: dominant impact + immediate quiet
  {
    const q90 = fsQuantile(win, 0.9);
    let kp = -1, pv = 0;
    for (let k = 5; k <= hiK; k++) {
      if (cstep[k] > pv) {
        pv = cstep[k];
        kp = k;
      }
    }
    if (kp >= 0 && pv >= FS_CFG.lpDom * q90) {
      const thrLow = fl + FS_CFG.lpQuiet * (q90 - fl);
      for (let k = kp + 1; k <= Math.min(kp + 4, hiK); k++) {
        if (Math.min(hsp[k], tsp[k]) <= thrLow) {
          if (k > tK - 20 && k < tK) tK = k;
          break;
        }
      }
    }
  }

  // 3. Body-overtake cap (only when the stride translates in-image)
  {
    const ax: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = P(lo + k, S.leadAnkle);
      if (a) ax.push(a.x);
    }
    const strideRng = fsQuantile(ax, 0.95) - fsQuantile(ax, 0.05);
    if (strideRng >= FS_CFG.zStrideMin * legScale) {
      const v = fsBox3(fsMed3(relV));
      const posWin = v.slice(Math.max(0, hiK - FS_CFG.zWin), hiK + 1).filter((x) => x > 0);
      const eps = FS_CFG.zEpsC * (fsQuantile(posWin, 0.85) || 1e-4);
      let zK = -1;
      for (let j = hiK - 1; j >= 1; j--) {
        if (v[j] >= eps && v[j + 1] < eps) {
          zK = j;
          break;
        }
      }
      if (zK >= 0 && zK < tK - FS_CFG.zGate) {
        const fz = P(lo + zK, S.leadAnkle), ft = P(lo + tK, S.leadAnkle);
        if (fz && ft && Math.abs(ft.x - fz.x) <= FS_CFG.zNetMax * legScale) tK = zK;
      }
    }
  }

  // 4. Flatten-onset midpoint snap.
  // The rotation statistics deliberately use a window reaching to 2
  // frames before release (not hiCut): the release-time foot pivot's
  // large rotation belongs in the normalization so that only genuinely
  // dominant flattening bursts qualify as onsets.
  const rs = fsMed3(rot);
  const hiKR = Math.max(5, n - 1 - 2);
  const rwin = rs.slice(Math.max(0, hiKR - FS_CFG.rotWin), hiKR + 1);
  const flR = fsQuantile(rwin, 0.2), pkR = fsQuantile(rwin, 0.9);
  const onsets: number[] = [];
  if (pkR - flR > 1e-9) {
    const thrR = flR + FS_CFG.rotCoef * (pkR - flR);
    for (let k = 3; k <= hiKR - 1; k++) {
      if (rs[k] < thrR) continue;
      if (!(rs[k + 1] >= thrR * 0.6 || (rs[k + 2] ?? 0) >= thrR * 0.6)) continue;
      if (Math.max(rs[k - 1], rs[k - 2], rs[k - 3]) >= thrR) continue; // not a fresh onset
      onsets.push(k);
    }
  }
  // Post-T translation creep level (gates trusting a LATE onset)
  const ssm = fsMed3(hsp.map((v, k) => Math.min(v, tsp[k])));
  const swin = ssm.slice(Math.max(0, hiK - FS_CFG.pkWin), hiK + 1);
  const fl2 = fsQuantile(swin, 0.1), pk2 = fsQuantile(swin, FS_CFG.pkq);
  const post: number[] = [];
  for (let k = tK + 2; k <= Math.min(tK + 8, hiK); k++) post.push(ssm[k]);
  const creep = pk2 - fl2 > 1e-9 ? (fsQuantile(post, 0.5) - fl2) / (pk2 - fl2) : 1;

  let early = -1, ed = Infinity, late = -1, ld = Infinity;
  for (const o of onsets) {
    const d = o - tK;
    if (d >= -FS_CFG.snapE && d <= 3 && Math.abs(d) < ed) {
      ed = Math.abs(d);
      early = o;
    }
    if (d > 3 && d <= FS_CFG.snapL && Math.abs(d) < ld) {
      ld = Math.abs(d);
      late = o;
    }
  }
  let out = tK;
  if (early >= 0) out = Math.round((tK + early) / 2);
  else if (late >= 0 && creep < FS_CFG.creepMax && R - (lo + late) >= FS_CFG.relGap) {
    out = Math.round((tK + late) / 2);
  }

  return lo + Math.max(1, Math.min(out, hiK));
}

/**
 * Coach-defined layback angle: forearm (elbow→wrist) vs the ground.
 *   90 = forearm straight up.
 *  180 = forearm laid flat back toward second base.
 *    0 = forearm flat forward toward the plate.
 * The coach scale ends at 180: a forearm pointing back AND below the
 * elbow is not "more layback", it is a different position (usually pose
 * noise or the arm swinging), so anything past 195 is invalid (null).
 * Null when either keypoint is not trustworthy.
 */
export function laybackAngle(
  frame: ValidFrame,
  throwElbowKey: string,
  throwWristKey: string,
  throwDirSign: number
): number | null {
  const elbow = kpAt(frame, throwElbowKey);
  const wrist = kpAt(frame, throwWristKey);
  if (!elbow || !wrist) return null;
  const fx = wrist.x - elbow.x;
  const fy = wrist.y - elbow.y;
  if (fx === 0 && fy === 0) return null;
  // "behind": horizontal component pointing away from the throw direction
  const behind = -throwDirSign * fx;
  // "up": screen y grows downward, so up = -fy
  const up = -fy;
  const tilt = (Math.atan2(behind, up) * 180) / Math.PI; // 0 = vertical, +90 = flat back
  const layback = 90 + tilt;
  if (layback > 195) return null;
  return layback;
}

// ============================================================
// MAIN DETECTION
// ============================================================

export function detectPhases(
  frames: ValidFrame[],
  throwingHand: "left" | "right" = "right"
): DetectedPhases {
  // Fix left/right leg identity swaps before detection reads the legs.
  // The contact-fusion foot strike was validated on this substrate.
  // Idempotent, legs only; the wrist signals that drive the anchor and
  // release are untouched.
  repairSideSwaps(frames);

  const n = frames.length;
  const S = getSideKeys(throwingHand);
  const armKeys = [S.throwShoulder, S.throwElbow, S.throwWrist];
  const legKeys = [S.leadHip, S.leadKnee, S.leadAnkle, S.backHip, S.backKnee, S.backAnkle];

  // ==========================================================
  // 0. THROW ANCHOR, global peak of smoothed throwing-wrist speed
  // ==========================================================
  const wristSpeed = speedSeries(frames, S.throwWrist);
  const wristSm = smoothSeries(wristSpeed, 2);

  let anchorIdx = Math.round(n * 0.6);
  let anchorPeak = -Infinity;
  for (let i = 2; i < n - 1; i++) {
    if (wristSm[i] > anchorPeak) {
      anchorPeak = wristSm[i];
      anchorIdx = i;
    }
  }

  // Burst width: contiguous frames around the anchor above half peak.
  // This is the natural time unit of THIS clip (handles any frame rate).
  let burstLo = anchorIdx;
  let burstHi = anchorIdx;
  while (burstLo > 0 && wristSm[burstLo - 1] > anchorPeak * 0.5) burstLo--;
  while (burstHi < n - 1 && wristSm[burstHi + 1] > anchorPeak * 0.5) burstHi++;
  const scale = clamp(burstHi - burstLo + 1, 3, Math.max(3, Math.round(n * 0.15)));

  // ==========================================================
  // 0.5 THROW DIRECTION, from hip translation across the delivery
  // ==========================================================
  let throwDirSign = throwingHand === "right" ? -1 : 1;
  {
    const early = Math.max(0, anchorIdx - 4 * scale);
    const late = Math.min(n - 1, anchorIdx + scale);
    const hipA =
      kpAt(frames[early], S.leadHip) || kpAt(frames[early], S.backHip);
    const hipB = kpAt(frames[late], S.leadHip) || kpAt(frames[late], S.backHip);
    if (hipA && hipB && Math.abs(hipB.x - hipA.x) > 0.015) {
      throwDirSign = hipB.x - hipA.x > 0 ? 1 : -1;
    }
  }

  // ==========================================================
  // 1. RELEASE, max arm extension near the anchor
  //    Extension ratio = shoulder→wrist / (shoulder→elbow + elbow→wrist).
  //    Approaches 1.0 only when the arm is fully extended at release.
  //    Fallback: first wrist-speed decay below 70% of peak after anchor.
  // ==========================================================
  const relLo = Math.max(1, anchorIdx - scale);
  const relHi = Math.min(n - 1, anchorIdx + 2 * scale);
  let releaseIdx = -1;
  let bestExt = -Infinity;
  const extAt: (number | null)[] = new Array(n).fill(null);
  for (let i = relLo; i <= relHi; i++) {
    const sh = kpAt(frames[i], S.throwShoulder);
    const el = kpAt(frames[i], S.throwElbow);
    const wr = kpAt(frames[i], S.throwWrist);
    if (!sh || !el || !wr) continue;
    const chain = dist(sh, el) + dist(el, wr);
    if (chain < 1e-4) continue;
    // Release happens with the hand out FRONT, not still laid back
    const wristForward = (wr.x - sh.x) * throwDirSign;
    if (wristForward < 0) continue;
    const ext = dist(sh, wr) / chain;
    extAt[i] = ext;
    if (ext > bestExt) {
      bestExt = ext;
      releaseIdx = i;
    }
  }
  // The follow-through also shows a fully extended arm, so take the
  // EARLIEST frame that reaches essentially-max extension: that is the
  // moment the ball leaves; everything after is deceleration.
  if (releaseIdx !== -1) {
    for (let i = relLo; i <= relHi; i++) {
      const e = extAt[i];
      if (e !== null && e >= bestExt - 0.015) {
        releaseIdx = i;
        break;
      }
    }
  }

  let releaseMethod = "extension";
  if (releaseIdx === -1 || releaseIdx === relLo || releaseIdx === relHi) {
    // Extension landed on a window edge (or found nothing): decay fallback.
    releaseMethod = "speed-decay";
    releaseIdx = Math.min(anchorIdx + 1, n - 1);
    for (let i = anchorIdx + 1; i <= relHi; i++) {
      if (wristSm[i] < anchorPeak * 0.7) {
        releaseIdx = i;
        break;
      }
      releaseIdx = i;
    }
  }

  let releaseConfidence: number;
  {
    const vis = meanVisibility(frames[releaseIdx], armKeys);
    releaseConfidence = clamp(
      Math.round(
        (releaseMethod === "extension" ? 35 : 20) +
          (bestExt > 0.92 ? 20 : bestExt > 0.85 ? 12 : 5) +
          (Math.abs(releaseIdx - anchorIdx) <= scale ? 15 : 5) +
          vis * 30
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 2. FRONT FOOT STRIKE, lead ankle goes quiet before release
  //    Method A: contact fusion (heel/toe/ankle arrest + flattening).
  //    Method B fallback: ground-arrival; then speed-quiet; then offset.
  // ==========================================================
  const fsLo = Math.max(1, releaseIdx - 5 * scale);
  const fsHi = Math.max(fsLo + 1, releaseIdx - 1);

  const ankleSpeed = speedSeries(frames, S.leadAnkle);
  const ankleSm = smoothSeries(ankleSpeed, 1.5);

  // Ground level + max stride spread references inside the window
  let maxAnkleY = -Infinity;
  let maxSpread = 0;
  for (let i = fsLo; i <= fsHi; i++) {
    const la = kpAt(frames[i], S.leadAnkle);
    const ba = kpAt(frames[i], S.backAnkle);
    if (la) maxAnkleY = Math.max(maxAnkleY, la.y);
    if (la && ba) maxSpread = Math.max(maxSpread, Math.abs(la.x - ba.x));
  }

  let peakAnkleSpeed = 0;
  for (let i = fsLo; i <= fsHi; i++) peakAnkleSpeed = Math.max(peakAnkleSpeed, ankleSm[i]);
  const quietThreshold = Math.max(0.002, peakAnkleSpeed * 0.18);

  let footStrikeIdx = -1;
  let fsMethod = "none";

  // Method A: contact fusion on the heel, toe and ankle (the parts of
  // the foot that actually hit the ground). Validated 10/10 within 2
  // frames on the labeled clip set, including oblique views.
  {
    const idx = detectFootStrikeContact(frames, S, releaseIdx, throwDirSign);
    if (idx >= 1 && idx < releaseIdx) {
      footStrikeIdx = idx;
      fsMethod = "contact-fusion";
    }
  }

  // Method B: ground-arrival fallback. Foot strike is the first frame
  // where the lead ankle reaches ground level after a real descent.
  // Thresholds scale with the ankle's own height range in the window.
  if (footStrikeIdx === -1) {
    let minAnkleY = Infinity;
    for (let i = fsLo; i <= fsHi; i++) {
      const la = kpAt(frames[i], S.leadAnkle);
      if (la) minAnkleY = Math.min(minAnkleY, la.y);
    }
    const liftRange = maxAnkleY - minAnkleY;
    if (liftRange > 0.008) {
      // The plant is the LOWEST point the lead ankle reaches before
      // release. Find that point, then walk back through its plateau to
      // the plant onset (handles a slow "crawling" final descent).
      let lowIdx = -1;
      let lowY = -Infinity;
      for (let i = fsLo; i <= fsHi; i++) {
        const la = kpAt(frames[i], S.leadAnkle);
        if (la && la.y > lowY) {
          lowY = la.y;
          lowIdx = i;
        }
      }
      // A lowest point at the window's start means the height signal
      // never descends here (bad angle or tracking); defer to Method B.
      if (lowIdx > fsLo + 2) {
        const plateauTol = 0.06 * liftRange;
        let onset = lowIdx;
        while (onset > fsLo) {
          const p = kpAt(frames[onset - 1], S.leadAnkle);
          if (!p || p.y < lowY - plateauTol) break;
          onset--;
        }
        // Must arrive from a real descent
        let highest = lowY;
        for (let j = Math.max(fsLo, onset - Math.max(2, scale)); j < onset; j++) {
          const p = kpAt(frames[j], S.leadAnkle);
          if (p) highest = Math.min(highest, p.y);
        }
        const la = kpAt(frames[onset], S.leadAnkle);
        const ba = kpAt(frames[onset], S.backAnkle);
        const spreadOk =
          la && ba && maxSpread > 0
            ? Math.abs(la.x - ba.x) >= maxSpread * 0.35
            : true;
        if (la && la.y - highest > 0.25 * liftRange && spreadOk) {
          footStrikeIdx = onset;
          fsMethod = "ground-arrival";
        }
      }
    }
  }

  // Method B: ankle speed-quiet onset before release (fallback when the
  // height signal is too flat to trust).
  if (footStrikeIdx === -1) {
    for (let i = fsLo + 2; i <= fsHi; i++) {
      const la = kpAt(frames[i], S.leadAnkle);
      const ba = kpAt(frames[i], S.backAnkle);
      if (!la || !ba) continue;
      if (maxAnkleY > 0 && la.y < maxAnkleY - 0.04) continue;
      if (maxSpread > 0 && Math.abs(la.x - ba.x) < maxSpread * 0.5) continue;
      if (ankleSm[i] >= quietThreshold) continue;
      const prev = ankleSm[Math.max(fsLo, i - 2)];
      if (prev < quietThreshold * 1.2) continue;
      footStrikeIdx = i;
      fsMethod = "speed-quiet";
      break;
    }
  }

  // Last resort: a fixed offset back from release
  if (footStrikeIdx === -1) {
    footStrikeIdx = Math.max(1, releaseIdx - 2 * scale);
    fsMethod = "fallback-offset";
  }

  let footStrikeConfidence: number;
  {
    const vis = meanVisibility(frames[footStrikeIdx], legKeys);
    footStrikeConfidence = clamp(
      Math.round(
        (fsMethod === "contact-fusion" ? 45 : fsMethod === "ground-arrival" ? 30 : fsMethod === "speed-quiet" ? 25 : 10) +
          (releaseIdx - footStrikeIdx >= 2 && releaseIdx - footStrikeIdx <= 5 * scale ? 15 : 5) +
          vis * 40
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 3. MAX LAYBACK, peak coach-defined layback in (FFS, release]
  // ==========================================================
  // Chosen on a lightly smoothed series so a single noisy frame cannot
  // fake the peak.
  let laybackIdx = -1;
  let bestLayback = -Infinity;
  {
    const laybacks: (number | null)[] = [];
    for (let i = footStrikeIdx + 1; i <= releaseIdx; i++) {
      laybacks.push(laybackAngle(frames[i], S.throwElbow, S.throwWrist, throwDirSign));
    }
    for (let k = 0; k < laybacks.length; k++) {
      if (laybacks[k] === null) continue;
      let sum = 0;
      let cnt = 0;
      for (let d = -1; d <= 1; d++) {
        const v = laybacks[k + d];
        if (v !== null && v !== undefined) {
          sum += v;
          cnt++;
        }
      }
      const smoothedLb = sum / cnt;
      if (smoothedLb > bestLayback) {
        bestLayback = smoothedLb;
        laybackIdx = footStrikeIdx + 1 + k;
      }
    }
  }
  if (laybackIdx === -1) {
    laybackIdx = Math.max(footStrikeIdx + 1, releaseIdx - Math.round(scale / 2));
    bestLayback = NaN;
  }

  let laybackConfidence: number;
  {
    const vis = meanVisibility(frames[laybackIdx], armKeys);
    const measured = Number.isFinite(bestLayback);
    laybackConfidence = clamp(
      Math.round(
        (measured ? 30 : 5) +
          (measured && bestLayback > 110 ? 15 : 5) +
          (laybackIdx > footStrikeIdx && laybackIdx <= releaseIdx ? 15 : 0) +
          vis * 40
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 4. LEG LIFT, peak lead-knee height before foot strike
  // ==========================================================
  let legLiftIdx = 0;
  let bestLift = -Infinity;
  for (let i = 0; i < footStrikeIdx; i++) {
    const hip = kpAt(frames[i], S.leadHip);
    const knee = kpAt(frames[i], S.leadKnee);
    if (!hip || !knee) continue;
    const lift = hip.y - knee.y; // positive = knee above hip
    if (lift > bestLift) {
      bestLift = lift;
      legLiftIdx = i;
    }
  }

  let legLiftConfidence: number;
  {
    const vis = meanVisibility(frames[legLiftIdx], legKeys);
    legLiftConfidence = clamp(
      Math.round(
        (bestLift > 0.1 ? 35 : bestLift > 0.04 ? 20 : 8) +
          (legLiftIdx < footStrikeIdx ? 15 : 0) +
          vis * 40
      ),
      0,
      100
    );
  }

  // ==========================================================
  // 5. DRIFT, onset of sustained pelvis travel after leg lift
  // ==========================================================
  let driftIdx = Math.min(legLiftIdx + 1, footStrikeIdx - 1);
  let driftFound = false;
  {
    const MOMENTUM = 0.002;
    const hipX: (number | null)[] = frames.map((f) => {
      const a = kpAt(f, S.leadHip);
      const b = kpAt(f, S.backHip);
      if (a && b) return (a.x + b.x) / 2;
      return a?.x ?? b?.x ?? null;
    });
    for (let i = legLiftIdx + 1; i < footStrikeIdx - 1; i++) {
      let forward = 0;
      for (let j = 0; j < 3 && i + j < n; j++) {
        const x0 = hipX[i + j - 1];
        const x1 = hipX[i + j];
        if (x0 === null || x1 === null) continue;
        if ((x1 - x0) * throwDirSign > MOMENTUM) forward++;
      }
      if (forward >= 2) {
        driftIdx = i;
        driftFound = true;
        break;
      }
    }
  }
  driftIdx = clamp(driftIdx, legLiftIdx + 1, Math.max(legLiftIdx + 1, footStrikeIdx - 1));

  let driftConfidence: number;
  {
    const vis = meanVisibility(frames[driftIdx], legKeys);
    driftConfidence = clamp(
      Math.round((driftFound ? 35 : 12) + (driftIdx > legLiftIdx ? 20 : 0) + vis * 40),
      0,
      100
    );
  }

  // ==========================================================
  // 6. DECELERATION, wrist speed decays after release
  // ==========================================================
  let decelIdx = Math.min(releaseIdx + 2 * scale, n - 1);
  let decelConfidence = 50;
  {
    const relSpeed = wristSm[releaseIdx] || anchorPeak;
    const threshold = relSpeed * 0.3;
    for (let i = releaseIdx + 2; i < Math.min(releaseIdx + 5 * scale, n); i++) {
      if (wristSm[i] < threshold) {
        decelIdx = i;
        decelConfidence = 75;
        break;
      }
    }
  }

  // ==========================================================
  // ORDERING (holds by construction; clamps are a final guard)
  // ==========================================================
  let lift = clamp(legLiftIdx, 0, n - 1);
  let drift = clamp(Math.max(driftIdx, lift + 1), 0, n - 1);
  let fs = clamp(Math.max(footStrikeIdx, drift + 1), 0, n - 1);
  let mer = clamp(Math.max(laybackIdx, fs + 1), 0, n - 1);
  let rel = clamp(Math.max(releaseIdx, mer), 0, n - 1);
  let dec = clamp(Math.max(decelIdx, rel + 1), 0, n - 1);

  // Tag frames
  frames[lift].phase = "legLift";
  frames[drift].phase = "drift";
  frames[fs].phase = "footStrike";
  frames[mer].phase = "mer";
  frames[rel].phase = "release";
  frames[dec].phase = "deceleration";

  if (typeof console !== "undefined") {
    console.log("[PhaseDetector] Throw-anchored results:", {
      anchor: anchorIdx,
      burstScale: scale,
      legLift: lift,
      drift,
      footStrike: fs,
      maxLayback: mer,
      release: rel,
      deceleration: dec,
      fsMethod,
      releaseMethod,
      laybackDeg: Number.isFinite(bestLayback) ? Math.round(bestLayback) : null,
      throwDirection: throwDirSign > 0 ? "→ right" : "← left",
      totalFrames: n,
    });
  }

  const mk = (idx: number, confidence: number) => ({
    frameIndex: idx,
    confidence,
    timestampMs: frames[idx]?.timestampMs ?? 0,
  });

  return {
    legLift: mk(lift, legLiftConfidence),
    drift: mk(drift, driftConfidence),
    footStrike: mk(fs, footStrikeConfidence),
    mer: mk(mer, laybackConfidence),
    release: mk(rel, releaseConfidence),
    deceleration: mk(dec, decelConfidence),
  };
}

/** Exposed for biomechanics: throw direction sign used by the detector. */
export function resolveThrowDirection(
  frames: ValidFrame[],
  throwingHand: "left" | "right",
  aroundIdx: number
): number {
  const n = frames.length;
  const S = getSideKeys(throwingHand);
  let sign = throwingHand === "right" ? -1 : 1;
  const early = Math.max(0, aroundIdx - Math.round(n * 0.3));
  const late = Math.min(n - 1, aroundIdx + Math.round(n * 0.05));
  const hipA = kpAt(frames[early], S.leadHip) || kpAt(frames[early], S.backHip);
  const hipB = kpAt(frames[late], S.leadHip) || kpAt(frames[late], S.backHip);
  if (hipA && hipB && Math.abs(hipB.x - hipA.x) > 0.015) {
    sign = hipB.x - hipA.x > 0 ? 1 : -1;
  }
  return sign;
}
