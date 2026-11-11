/**
 * PitchingCoachAI, Level-Aware Grading System
 *
 * Grades each measured metric based on the athlete's competitive level.
 *
 * GRADING CONTRACT (coach measurement model rebuild):
 *   - Full A+ through F spread. A real miss scores like a real miss.
 *   - A metric that could not be measured (null) is shown as
 *     "not measured" and EXCLUDED from every score. It never defaults
 *     to a passing grade.
 *   - Coach-defined metrics use explicit per-level grade bands
 *     (the target table in PLAN-measurement-model.md). Band numbers are
 *     Coach Grady's proposals pending final sign-off.
 *   - Out-of-target language is "needs work" coaching language only.
 */

import {
  type AllMetrics,
  type AthleteLevel,
  type PhaseName,
  type LetterGrade,
  type GradeColor,
  type MetricGrade,
  type PhaseGrade,
  type OverallGrade,
  PHASE_LABELS,
} from "./types";

// ============================================================
// METRIC DEFINITION
// ============================================================

/** An explicit grade band: value in [lo, hi] (inclusive) earns `grade`. */
interface GradeBand {
  grade: LetterGrade;
  lo: number;
  hi: number;
}

interface MetricDef {
  key: string;
  label: string;
  phase: PhaseName;
  unit: string;
  weight: number;
  /** Ideal range per level; generic distance-based grading. */
  thresholds: Record<AthleteLevel, { lo: number; hi: number }>;
  /** Explicit bands per level override the generic grading entirely.
   *  Evaluated in order; first match wins; no match = `bandFallback`. */
  bands?: Record<AthleteLevel, GradeBand[]>;
  bandFallback?: LetterGrade;
  higherIsBetter?: boolean;
  explanation: Record<LetterGrade, string>;
}

/** Helper to reuse one band list for every level. */
function allLevels<T>(v: T): Record<AthleteLevel, T> {
  return { "12u": v, "14u": v, hs: v, college: v, pro: v };
}

const METRIC_DEFS: MetricDef[] = [
  // === LEG LIFT ===
  {
    key: "legLift.leadKneeHeight",
    label: "Knee Height",
    phase: "legLift",
    unit: "",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 0.06, hi: 0.25 },
      "14u": { lo: 0.08, hi: 0.25 },
      hs: { lo: 0.10, hi: 0.25 },
      college: { lo: 0.10, hi: 0.25 },
      pro: { lo: 0.10, hi: 0.25 },
    },
    explanation: {
      "A+": "Great knee height at leg lift. You are getting into a strong balance point before starting your move to the plate.",
      A: "Good knee height. You are getting enough lift to create momentum in your delivery.",
      B: "Decent knee height, but a bit more lift could help you build more momentum.",
      C: "Your knee lift is low. This can limit the momentum you build in your delivery.",
      D: "Very low knee lift. You are not creating enough momentum toward the plate.",
      F: "Minimal knee lift. This limits your ability to create momentum toward the plate.",
    },
  },
  {
    key: "legLift.balancePoint",
    label: "Balance at Lift",
    phase: "legLift",
    unit: "°",
    weight: 1,
    thresholds: {
      "12u": { lo: 0, hi: 20 },
      "14u": { lo: 0, hi: 18 },
      hs: { lo: 0, hi: 15 },
      college: { lo: 0, hi: 12 },
      pro: { lo: 0, hi: 10 },
    },
    explanation: {
      "A+": "Perfectly balanced at the top of your leg lift. Your trunk is stacked and you are ready to drive forward.",
      A: "Good balance at leg lift. You are controlled at the top and set up well to move forward.",
      B: "Slightly off balance. A small adjustment will help you start your move more smoothly.",
      C: "Your balance is off at leg lift. Leaning too far forward or back disrupts your timing.",
      D: "Big balance issues at the top of your lift. This affects everything that comes after.",
      F: "Major balance issue. You are falling off the rubber instead of driving from it.",
    },
  },
  // === STRIDE ===
  // Removed from the report 2026-11-11 (Coach Grady: "The stride we can
  // just remove because all that matters is front foot strike."). The
  // drift phase is still detected internally, but nothing in it is
  // measured, graded, or shown.
  // === FOOT STRIKE ===
  {
    key: "footStrike.strideLength",
    label: "Stride Length",
    phase: "footStrike",
    unit: "x height",
    weight: 3,
    thresholds: {
      "12u": { lo: 0.65, hi: 0.80 },
      "14u": { lo: 0.70, hi: 0.83 },
      hs: { lo: 0.75, hi: 0.87 },
      college: { lo: 0.78, hi: 0.90 },
      pro: { lo: 0.80, hi: 0.92 },
    },
    explanation: {
      "A+": "Elite stride length. You are maximizing your runway to the plate.",
      A: "Great stride. Good extension toward the plate gives you more time to accelerate the ball.",
      B: "Good stride, but a few more inches would add measurable velocity.",
      C: "Short stride. You are cutting off your momentum and limiting velocity. This is fixable with targeted work.",
      D: "Very short stride. Focus on hip lead and an aggressive move down the mound.",
      F: "Stride is well below baseline. This is the first thing to address.",
    },
  },
  {
    key: "footStrike.hipShoulderSep",
    label: "Hip-Shoulder Separation",
    phase: "footStrike",
    unit: "°",
    weight: 4,
    // Explicit coach bands (PENDING SIGN-OFF, PLAN section 3/7 item 1).
    // Measured as pelvis line vs shoulder line in the transverse plane
    // from world landmarks. Note: reads HIGHER than Uplift's X-Factor
    // convention; the report copy names the convention.
    thresholds: {
      "12u": { lo: 20, hi: 45 },
      "14u": { lo: 25, hi: 50 },
      hs: { lo: 35, hi: 55 },
      college: { lo: 40, hi: 60 },
      pro: { lo: 40, hi: 60 },
    },
    bands: {
      "12u": [
        { grade: "A+", lo: 25, hi: 40 },
        { grade: "A", lo: 20, hi: 45 },
        { grade: "B", lo: 12, hi: 55 },
        { grade: "C", lo: 6, hi: 65 },
        { grade: "D", lo: 0, hi: 75 },
      ],
      "14u": [
        { grade: "A+", lo: 30, hi: 45 },
        { grade: "A", lo: 25, hi: 50 },
        { grade: "B", lo: 16, hi: 60 },
        { grade: "C", lo: 8, hi: 70 },
        { grade: "D", lo: 0, hi: 80 },
      ],
      hs: [
        { grade: "A+", lo: 40, hi: 50 },
        { grade: "A", lo: 35, hi: 55 },
        { grade: "B", lo: 25, hi: 65 },
        { grade: "C", lo: 12, hi: 75 },
        { grade: "D", lo: 5, hi: 85 },
      ],
      college: [
        { grade: "A+", lo: 44, hi: 56 },
        { grade: "A", lo: 40, hi: 60 },
        { grade: "B", lo: 30, hi: 70 },
        { grade: "C", lo: 18, hi: 80 },
        { grade: "D", lo: 8, hi: 88 },
      ],
      pro: [
        { grade: "A+", lo: 44, hi: 56 },
        { grade: "A", lo: 40, hi: 60 },
        { grade: "B", lo: 30, hi: 70 },
        { grade: "C", lo: 18, hi: 80 },
        { grade: "D", lo: 8, hi: 88 },
      ],
    },
    bandFallback: "F",
    explanation: {
      "A+": "Elite hip-shoulder separation. Your hips open while your shoulders stay closed, creating the stretch that generates velocity.",
      A: "Excellent separation. Your hips are opening before your shoulders, creating a powerful stretch.",
      B: "Good separation, but more would help. Lead with your hips while keeping your shoulders pointed at the target longer.",
      C: "You are flying open. At foot strike your shoulders should still be pointed toward home plate while your hips are open.",
      D: "Minimal separation. Your hips and shoulders are rotating as one unit. Keep the chest closed while the hips open to the plate.",
      F: "No meaningful separation detected. The hips and shoulders rotate together, and that costs real velocity.",
    },
  },
  {
    key: "footStrike.leadKneeAngle",
    label: "Front Knee at Foot Strike",
    phase: "footStrike",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 120, hi: 160 },
      "14u": { lo: 125, hi: 158 },
      hs: { lo: 130, hi: 155 },
      college: { lo: 130, hi: 152 },
      pro: { lo: 130, hi: 150 },
    },
    explanation: {
      "A+": "Perfect landing position. Your front knee is flexed just right to absorb force and redirect energy upward.",
      A: "Great front leg position at landing. You are set up well for a strong brace.",
      B: "Landing position is decent but could be better for energy transfer.",
      C: "Your front knee is either too stiff or too bent at landing. This affects your ability to brace and rotate.",
      D: "The landing position needs work. Landing too collapsed leaks energy; landing too stiff kills the rotation.",
      F: "Landing mechanics need a rebuild before anything downstream can improve.",
    },
  },
  {
    key: "footStrike.trunkAngle",
    label: "Trunk Position",
    phase: "footStrike",
    unit: "°",
    weight: 1,
    thresholds: {
      "12u": { lo: 5, hi: 25 },
      "14u": { lo: 5, hi: 22 },
      hs: { lo: 8, hi: 22 },
      college: { lo: 8, hi: 20 },
      pro: { lo: 10, hi: 20 },
    },
    explanation: {
      "A+": "Perfect trunk position: a slight forward lean with the torso stacked and ready to rotate.",
      A: "Good trunk position at foot strike. You are balanced and ready to deliver force.",
      B: "Trunk is a bit off ideal. A minor adjustment will improve your ability to get on top of the ball.",
      C: "Your trunk is either too upright or leaning too much. This affects your release angle.",
      D: "Trunk position is working against you at foot strike.",
      F: "Trunk position needs a complete rebuild.",
    },
  },
  {
    key: "footStrike.forearmVerticalAngle",
    label: "Arm Timing at Foot Strike",
    phase: "footStrike",
    unit: "°",
    weight: 3,
    thresholds: {
      "12u": { lo: 0, hi: 30 },
      "14u": { lo: 0, hi: 25 },
      hs: { lo: 0, hi: 20 },
      college: { lo: 0, hi: 18 },
      pro: { lo: 0, hi: 15 },
    },
    explanation: {
      "A+": "Perfect arm timing. Your arm is up and ready at foot strike, fully loaded to accelerate.",
      A: "Great arm timing. Your forearm is near vertical at foot strike, so you are on time.",
      B: "Slightly off on timing but still functional. A small adjustment to your arm path will tighten this up.",
      C: "Your arm is late getting up at foot strike. The arm needs to be up when the front foot lands.",
      D: "Late arm. Your forearm is well below vertical at foot strike, so the arm has to rush to catch up.",
      F: "Severely late arm timing. The arm must be up and ready when the front foot hits.",
    },
  },
  {
    key: "footStrike.shoulderAbductionAtFS",
    label: "Arm Height at Foot Strike",
    phase: "footStrike",
    unit: "°",
    weight: 2,
    // Explicit coach bands (PLAN section 3). 90 = elbow level with shoulder.
    thresholds: allLevels({ lo: 80, hi: 100 }),
    bands: allLevels([
      { grade: "A+", lo: 85, hi: 95 },
      { grade: "A", lo: 80, hi: 100 },
      { grade: "B", lo: 70, hi: 110 },
      { grade: "C", lo: 50, hi: 125 },
      { grade: "D", lo: 30, hi: 140 },
    ] as GradeBand[]),
    bandFallback: "F",
    explanation: {
      "A+": "Perfect arm height at foot strike. The elbow is right at shoulder level.",
      A: "Great arm height at foot strike. Your arm is in position and ready to accelerate.",
      B: "Arm height is slightly off at foot strike. Getting the elbow to shoulder level will improve your efficiency.",
      C: "Your arm is too low or too high at foot strike. Aim for the elbow at shoulder height when the front foot lands.",
      D: "Arm height at foot strike needs work. The elbow is far from shoulder level, which forces the arm to make up ground late.",
      F: "Arm height at foot strike is far outside the target. Getting the elbow up to shoulder level is the first fix.",
    },
  },
  {
    key: "footStrike.elbowAngleAtFS",
    label: "Elbow Bend at Foot Strike",
    phase: "footStrike",
    unit: "°",
    weight: 2,
    // Explicit coach bands (B/C bands PENDING SIGN-OFF, PLAN item 2).
    thresholds: allLevels({ lo: 80, hi: 100 }),
    bands: allLevels([
      { grade: "A+", lo: 85, hi: 95 },
      { grade: "A", lo: 80, hi: 100 },
      { grade: "B", lo: 65, hi: 115 },
      { grade: "C", lo: 45, hi: 135 },
      { grade: "D", lo: 25, hi: 155 },
    ] as GradeBand[]),
    bandFallback: "F",
    explanation: {
      "A+": "Perfect elbow bend at foot strike, right around 90 degrees.",
      A: "Great elbow bend at foot strike. The arm is in a strong, efficient position.",
      B: "Elbow bend is a little off at foot strike. Aim for roughly a right angle between upper arm and forearm.",
      C: "Your elbow is too straight or too bent at foot strike. A right angle at landing sets up an efficient arm path.",
      D: "Elbow bend at foot strike is well off target and makes the arm work harder than it should.",
      F: "Elbow bend at foot strike is far outside the target range and needs focused work.",
    },
  },
  // === MAX LAYBACK ===
  {
    key: "mer.maxLayback",
    label: "Max Layback",
    phase: "mer",
    unit: "°",
    weight: 3,
    // Coach definition: forearm vs ground, 90 = vertical, 180 = flat back.
    // Explicit coach bands (PLAN section 3).
    thresholds: allLevels({ lo: 160, hi: 180 }),
    bands: allLevels([
      { grade: "A+", lo: 170, hi: 180 },
      { grade: "A", lo: 160, hi: 185 },
      { grade: "B", lo: 145, hi: 190 },
      { grade: "C", lo: 125, hi: 200 },
      { grade: "D", lo: 105, hi: 210 },
    ] as GradeBand[]),
    bandFallback: "F",
    explanation: {
      "A+": "Elite layback. The forearm lays all the way back before the arm accelerates forward.",
      A: "Great layback. This stored stretch is where throwing speed comes from.",
      B: "Good layback with room to develop more. Mobility and arm path work can help.",
      C: "Below target layback. The arm is not loading fully before it comes forward, which caps velocity.",
      D: "Limited layback. This is a major velocity limiter and a focus area for your training plan.",
      F: "Very limited layback measured. This needs dedicated mobility and mechanics work.",
    },
  },
  {
    key: "mer.elbowFlexion",
    label: "Elbow Angle at Layback",
    phase: "mer",
    unit: "°",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 75, hi: 110 },
      "14u": { lo: 80, hi: 105 },
      hs: { lo: 80, hi: 105 },
      college: { lo: 85, hi: 100 },
      pro: { lo: 85, hi: 100 },
    },
    explanation: {
      "A+": "Perfect elbow angle. Roughly 90 degrees is the sweet spot for efficiency.",
      A: "Great elbow position at max layback.",
      B: "Good but slightly off ideal. A minor adjustment will improve efficiency.",
      C: "Elbow angle is outside the target range at layback.",
      D: "Elbow angle at layback is well off target. Too straight or too bent both cost efficiency.",
      F: "Elbow angle at layback is far outside the target range and needs attention.",
    },
  },
  {
    key: "mer.shoulderAbduction",
    label: "Arm Height at Layback",
    phase: "mer",
    unit: "°",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 70, hi: 105 },
      "14u": { lo: 75, hi: 105 },
      hs: { lo: 80, hi: 100 },
      college: { lo: 80, hi: 100 },
      pro: { lo: 80, hi: 100 },
    },
    explanation: {
      "A+": "Perfect arm height: elbow right at shoulder level through layback.",
      A: "Great arm height. Your arm is in a strong slot at max layback.",
      B: "Slightly off ideal arm height. A minor adjustment will improve efficiency.",
      C: "Arm is too high or too low relative to your shoulders at layback.",
      D: "Arm height at layback needs work.",
      F: "Arm height at layback is far outside the target range.",
    },
  },
  {
    key: "mer.leadLegBrace",
    label: "Lead Leg Brace at Layback",
    phase: "mer",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 125, hi: 170 },
      "14u": { lo: 130, hi: 170 },
      hs: { lo: 135, hi: 170 },
      college: { lo: 140, hi: 170 },
      pro: { lo: 145, hi: 175 },
    },
    explanation: {
      "A+": "Elite front leg brace. Your plant knee is driving back as you rotate, converting momentum into velocity.",
      A: "Strong lead leg brace. Your front leg is firming up and redirecting energy into rotation.",
      B: "Good brace but it could be firmer. Think about the plant knee moving back as you rotate your hips.",
      C: "Your front leg is collapsing, so energy leaks into the ground instead of going to the ball.",
      D: "Weak brace. The lead leg is absorbing energy instead of blocking and redirecting it.",
      F: "No real brace happening. The front leg is absorbing everything you built up.",
    },
  },
  {
    key: "mer.leadLegBraceDelta",
    label: "Lead Leg Brace Progression",
    phase: "mer",
    unit: "°",
    weight: 2,
    higherIsBetter: true,
    thresholds: {
      "12u": { lo: 5, hi: 40 },
      "14u": { lo: 8, hi: 45 },
      hs: { lo: 10, hi: 50 },
      college: { lo: 12, hi: 50 },
      pro: { lo: 15, hi: 55 },
    },
    explanation: {
      "A+": "Elite brace progression. The lead knee extends aggressively from foot strike through layback.",
      A: "Great brace progression. Your front leg actively stiffens through the acceleration phase.",
      B: "Decent brace development with more extension to gain. Actively drive the plant knee back.",
      C: "Your front leg is not extending enough from foot strike to layback. The knee should straighten as you rotate.",
      D: "Minimal brace development. The front leg stays bent through layback.",
      F: "No brace progression. The front leg is collapsing instead of extending.",
    },
  },
  // === RELEASE ===
  {
    key: "release.trunkForwardFlexion",
    label: "Trunk Flexion",
    phase: "release",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 20, hi: 45 },
      "14u": { lo: 25, hi: 45 },
      hs: { lo: 28, hi: 42 },
      college: { lo: 30, hi: 42 },
      pro: { lo: 30, hi: 40 },
    },
    explanation: {
      "A+": "Elite trunk flexion at release. You are getting out over the front leg with authority.",
      A: "Great trunk tilt. This forward lean at release creates a strong downhill angle.",
      B: "Decent trunk flexion, but more would improve your angle to the plate.",
      C: "Not enough forward trunk tilt. You are releasing the ball flat and losing downhill angle.",
      D: "Too upright at release. Getting out over the front side is a priority.",
      F: "Very upright release with no downhill plane. This needs focused work.",
    },
  },
  {
    key: "release.leadLegExtension",
    label: "Lead Leg Extension at Release",
    phase: "release",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 140, hi: 180 },
      "14u": { lo: 145, hi: 180 },
      hs: { lo: 150, hi: 180 },
      college: { lo: 155, hi: 180 },
      pro: { lo: 160, hi: 180 },
    },
    explanation: {
      "A+": "Full front leg brace at release. The plant knee drove back and the rotational energy went into the ball.",
      A: "Great lead leg extension. You are bracing hard and transferring energy efficiently.",
      B: "Good, but a firmer brace would add measurable velocity. Post up against a firm front side.",
      C: "Your front leg is bending too much at release, so energy is leaking. Drive the plant knee back harder.",
      D: "Significant front leg collapse at release. This directly costs velocity.",
      F: "No front leg brace. The momentum you built is being absorbed into the ground.",
    },
  },
  {
    key: "release.leadLegBraceTotal",
    label: "Total Lead Leg Brace",
    phase: "release",
    unit: "°",
    weight: 1.5,
    higherIsBetter: true,
    thresholds: {
      "12u": { lo: 10, hi: 50 },
      "14u": { lo: 15, hi: 55 },
      hs: { lo: 20, hi: 60 },
      college: { lo: 25, hi: 60 },
      pro: { lo: 30, hi: 65 },
    },
    explanation: {
      "A+": "Elite total brace. Your lead leg extended strongly from foot strike to release. Maximum energy transfer.",
      A: "Great total brace development. Your front leg is converting momentum into ball speed.",
      B: "Good total brace, but more extension would add velocity. Drive the plant knee back aggressively.",
      C: "Your front leg is not extending enough through the delivery. You should see clear knee straightening from foot strike to release.",
      D: "Minimal total brace. The front leg stays bent through the whole delivery, which is a major energy leak.",
      F: "No meaningful brace. The lead leg is absorbing all the momentum you generated.",
    },
  },
  {
    key: "release.armSlot",
    label: "Arm Slot",
    phase: "release",
    unit: "°",
    weight: 0, // Informational only
    thresholds: allLevels({ lo: 0, hi: 360 }),
    explanation: {
      "A+": "Arm slot is a natural characteristic. There is no single ideal slot. Yours is consistent.",
      A: "Arm slot is a natural characteristic. There is no single ideal slot. Yours is consistent.",
      B: "Arm slot is a natural characteristic. There is no single ideal slot.",
      C: "Arm slot is a natural characteristic. There is no single ideal slot.",
      D: "Arm slot is a natural characteristic. There is no single ideal slot.",
      F: "Arm slot is a natural characteristic. There is no single ideal slot.",
    },
  },
  // === DECELERATION ===
  {
    key: "deceleration.followThroughLength",
    label: "Follow-Through Length",
    phase: "deceleration",
    unit: "",
    weight: 2,
    higherIsBetter: true,
    thresholds: {
      "12u": { lo: 0.10, hi: 0.50 },
      "14u": { lo: 0.12, hi: 0.50 },
      hs: { lo: 0.15, hi: 0.50 },
      college: { lo: 0.18, hi: 0.50 },
      pro: { lo: 0.20, hi: 0.55 },
    },
    explanation: {
      "A+": "Great follow-through. Your arm slows down over a long arc, spreading the braking work across more time and distance.",
      A: "Good follow-through length. You are giving your arm room to slow down.",
      B: "Decent follow-through, but letting the arm travel farther would smooth out the finish.",
      C: "Your follow-through is short. Let your arm finish its natural path instead of cutting it off.",
      D: "Abbreviated follow-through. The arm stops abruptly after release.",
      F: "Almost no follow-through. The arm slams on the brakes right after release.",
    },
  },
  {
    key: "deceleration.bodyBalance",
    label: "Finish Balance",
    phase: "deceleration",
    unit: "",
    weight: 1.5,
    // The metric is a PERCENT of height (biomechanics multiplies by 100).
    // These thresholds were written as fractions, so every finish graded F
    // no matter how balanced; scaled to match the metric's actual unit.
    thresholds: {
      "12u": { lo: 0, hi: 20 },
      "14u": { lo: 0, hi: 18 },
      hs: { lo: 0, hi: 15 },
      college: { lo: 0, hi: 12 },
      pro: { lo: 0, hi: 10 },
    },
    explanation: {
      "A+": "Perfectly balanced finish. You end in a fielding-ready position with great body control.",
      A: "Good finish balance. You are under control and ready to field your position.",
      B: "Slightly off balance at the finish. A more controlled follow-through will help.",
      C: "You are falling off to one side after release. This wastes energy and leaves you out of position.",
      D: "Significant balance issues at the finish. This usually points to an earlier sequencing problem.",
      F: "Very poor finish balance. You are completely out of control after release.",
    },
  },
  {
    key: "deceleration.armDecelerationPath",
    label: "Deceleration Smoothness",
    phase: "deceleration",
    unit: "/100",
    weight: 1.5,
    higherIsBetter: true,
    thresholds: {
      "12u": { lo: 40, hi: 100 },
      "14u": { lo: 45, hi: 100 },
      hs: { lo: 50, hi: 100 },
      college: { lo: 55, hi: 100 },
      pro: { lo: 60, hi: 100 },
    },
    explanation: {
      "A+": "Very smooth deceleration. Your arm slows down gradually and naturally.",
      A: "Good deceleration pattern. Your arm slows smoothly after release.",
      B: "Decent deceleration with some jerky speed changes. A longer, smoother arc will help.",
      C: "Choppy deceleration. Arm speed fluctuates after release instead of decreasing smoothly.",
      D: "The arm recoils or stops abruptly after release. A longer finish will spread out the braking work.",
      F: "Very erratic deceleration. The arm path after release needs significant work.",
    },
  },
];

export { METRIC_DEFS };

// ============================================================
// GRADE A SINGLE METRIC
// ============================================================

const NOT_MEASURED_EXPLANATION =
  "Not measured on this video. The camera could not track the body points this measurement needs. It is excluded from your score. Filming closer, from a true side view, in good light usually fixes this.";

function getNestedValue(obj: any, path: string): number | null {
  const parts = path.split(".");
  let val = obj;
  for (const p of parts) {
    if (val == null) return null;
    val = val[p];
  }
  return typeof val === "number" ? val : null;
}

function gradeValue(
  value: number | null,
  def: MetricDef,
  level: AthleteLevel
): { grade: LetterGrade; color: GradeColor; injuryFlag: boolean; measured: boolean } {
  if (value === null) {
    // Not measured: excluded from scoring entirely. Grade/color here are
    // placeholders the UI replaces with a "not measured" treatment.
    return { grade: "C", color: "yellow", injuryFlag: false, measured: false };
  }

  // Informational metrics (weight = 0)
  if (def.weight === 0) return { grade: "A", color: "green", injuryFlag: false, measured: true };

  // Explicit coach bands take precedence
  const bands = def.bands?.[level];
  if (bands) {
    let grade: LetterGrade = def.bandFallback ?? "F";
    for (const b of bands) {
      if (value >= b.lo && value <= b.hi) {
        grade = b.grade;
        break;
      }
    }
    return { grade, color: colorFor(grade), injuryFlag: false, measured: true };
  }

  // Generic distance-based grading with a full A+ to F spread
  const t = def.thresholds[level];
  const center = (t.lo + t.hi) / 2;
  const halfRange = (t.hi - t.lo) / 2;
  if (halfRange === 0) return { grade: "A", color: "green", injuryFlag: false, measured: true };

  const ratio = Math.abs(value - center) / halfRange;

  let grade: LetterGrade;
  if (value >= t.lo && value <= t.hi) {
    grade = ratio < 0.3 ? "A+" : "A";
  } else if (ratio < 1.6) {
    grade = "B";
  } else if (ratio < 2.6) {
    grade = "C";
  } else if (ratio < 3.6) {
    grade = "D";
  } else {
    grade = "F";
  }
  return { grade, color: colorFor(grade), injuryFlag: false, measured: true };
}

function colorFor(grade: LetterGrade): GradeColor {
  if (grade === "A+" || grade === "A") return "green";
  if (grade === "B") return "yellowGreen";
  if (grade === "C") return "yellow";
  if (grade === "D") return "orange";
  return "red";
}

// ============================================================
// GRADE ALL METRICS → PHASE GRADES → OVERALL
// ============================================================

/**
 * Score map. PROPOSED (PLAN item 3, pending Coach Grady sign-off):
 * the old map pinned C, D and F all at 75, so no analysis could score
 * below 75 and 969 stored analyses averaged 81.3.
 */
const GRADE_SCORES: Record<LetterGrade, number> = {
  "A+": 98, A: 93, B: 85, C: 70, D: 55, F: 40,
};

function letterForScore(score: number): LetterGrade {
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

/** Below this keypoint-visibility confidence a value is not trustworthy
 *  enough to grade: it becomes "not measured" instead of a letter grade. */
const CONFIDENCE_FLOOR = 0.45;

export function gradeAllMetrics(
  metrics: AllMetrics,
  level: AthleteLevel,
  /** Per-metric measurement confidence 0-1. When provided, metrics below
   *  CONFIDENCE_FLOOR are excluded from scoring as "not measured". */
  confidence?: Record<string, number>
): { metricGrades: MetricGrade[]; phaseGrades: PhaseGrade[]; overall: OverallGrade } {
  const metricGrades: MetricGrade[] = [];

  for (const def of METRIC_DEFS) {
    let value = getNestedValue(metrics, def.key);
    const conf = confidence?.[def.key];
    if (value !== null && conf !== undefined && conf < CONFIDENCE_FLOOR) {
      // Tracked too poorly to trust: an honest report says "not measured",
      // never a confident letter grade on shaky points.
      value = null;
    }
    const { grade, color, injuryFlag, measured } = gradeValue(value, def, level);

    metricGrades.push({
      metricKey: def.key,
      label: def.label,
      value,
      unit: def.unit,
      grade,
      color,
      phase: def.phase,
      injuryFlag,
      measured,
      info: def.weight === 0,
      explanation: measured ? def.explanation[grade] : NOT_MEASURED_EXPLANATION,
    });
  }

  // Phase grades: only measured, weighted metrics count.
  // "drift" (Stride) is intentionally absent: removed from the report.
  const phases: PhaseName[] = ["legLift", "footStrike", "mer", "release", "deceleration"];
  const phaseGrades: PhaseGrade[] = phases.map((phase) => {
    const phaseMetrics = metricGrades.filter((m) => m.phase === phase);
    const gradedMetrics = phaseMetrics.filter((m) => {
      if (!m.measured) return false;
      const def = METRIC_DEFS.find((d) => d.key === m.metricKey);
      return def !== undefined && def.weight > 0;
    });

    let totalScore = 0;
    let totalWeight = 0;
    for (const m of gradedMetrics) {
      const def = METRIC_DEFS.find((d) => d.key === m.metricKey)!;
      totalScore += GRADE_SCORES[m.grade] * def.weight;
      totalWeight += def.weight;
    }
    const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    const hasData = totalWeight > 0;

    const grade: LetterGrade = hasData ? letterForScore(score) : "C";
    const color: GradeColor = hasData ? colorFor(grade) : "yellow";

    return {
      phase,
      label: PHASE_LABELS[phase],
      grade,
      color,
      score: hasData ? score : 0,
      hasData,
      metrics: phaseMetrics,
    };
  });

  // Overall grade: phases with no measured metrics are excluded
  let overallTotal = 0;
  let overallWeight = 0;
  // Stride's old weight (2 of 10.5) is redistributed proportionally by
  // construction: the overall score is the weighted average of the phases
  // that remain. PROPOSED, pending Coach Grady sign-off.
  const phaseWeights: Partial<Record<PhaseName, number>> = {
    legLift: 0.5, footStrike: 3.5, mer: 2.5, release: 1, deceleration: 1,
  };
  for (const pg of phaseGrades) {
    const hasData = pg.metrics.some((m) => {
      if (!m.measured) return false;
      const def = METRIC_DEFS.find((d) => d.key === m.metricKey);
      return def !== undefined && def.weight > 0;
    });
    if (!hasData) continue;
    const w = phaseWeights[pg.phase] ?? 0;
    if (w <= 0) continue;
    overallTotal += pg.score * w;
    overallWeight += w;
  }
  const overallScore = overallWeight > 0 ? Math.round(overallTotal / overallWeight) : 0;
  const overallLetterGrade = letterForScore(overallScore);
  const overallColor = colorFor(overallLetterGrade);

  // Verdict
  const scoredPhases = phaseGrades.filter((pg) =>
    pg.metrics.some((m) => m.measured && (METRIC_DEFS.find((d) => d.key === m.metricKey)?.weight ?? 0) > 0)
  );
  const bestPhase = [...scoredPhases].sort((a, b) => b.score - a.score)[0] ?? phaseGrades[0];
  const worstPhase = [...scoredPhases].sort((a, b) => a.score - b.score)[0] ?? phaseGrades[0];
  const unmeasuredCount = metricGrades.filter((m) => !m.measured).length;

  let verdict: string;
  if (overallScore >= 90) {
    verdict = `Strong mechanics. Your ${bestPhase.label.toLowerCase()} is elite. Fine-tune your ${worstPhase.label.toLowerCase()} for the next level.`;
  } else if (overallScore >= 80) {
    verdict = `Good foundation. Your ${bestPhase.label.toLowerCase()} looks solid. Focus on ${worstPhase.label.toLowerCase()} to unlock more velocity.`;
  } else if (overallScore >= 65) {
    verdict = `Room to grow. Start with your ${worstPhase.label.toLowerCase()}, where the biggest gains are. Your ${bestPhase.label.toLowerCase()} is working for you.`;
  } else {
    verdict = `Plenty to work with here. The biggest opportunity is your ${worstPhase.label.toLowerCase()}. A focused plan will move this score quickly.`;
  }
  if (unmeasuredCount > 0) {
    verdict += ` ${unmeasuredCount} measurement${unmeasuredCount > 1 ? "s" : ""} could not be taken from this video and ${unmeasuredCount > 1 ? "are" : "is"} not counted in the score.`;
  }

  return {
    metricGrades,
    phaseGrades,
    overall: {
      score: overallScore,
      grade: overallLetterGrade,
      color: overallColor,
      verdict,
      phaseGrades,
    },
  };
}
