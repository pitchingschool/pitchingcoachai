/**
 * PitchingCoachAI — Level-Aware Grading System
 *
 * Grades each biomechanical metric based on the athlete's competitive level.
 * Thresholds informed by ASMI normative data, Driveline research, and
 * Ben Brewster / Tread Athletics methodology.
 *
 * Grade scale: A+ / A / B / C only — nothing below C.
 * Injury flags still apply but show as C with a warning.
 */

import {
  type AllMetrics,
  type DetectedPhases,
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

interface MetricDef {
  key: string;
  label: string;
  phase: PhaseName;
  unit: string;
  weight: number;
  /** Thresholds per level: [A+, A, B, C, D] boundaries. F = below D.
   *  Format: { lo, hi } = ideal range. Grade degrades with distance. */
  thresholds: Record<AthleteLevel, { lo: number; hi: number; injuryBelow?: number; injuryAbove?: number }>;
  higherIsBetter?: boolean; // default: value in range is best
  explanation: Record<LetterGrade, string>;
}

const METRIC_DEFS: MetricDef[] = [
  // === LEG LIFT METRICS ===
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
      "A+": "Great knee height at leg lift — you're getting into a strong balance point before starting your move to the plate.",
      A: "Good knee height. You're getting enough lift to create momentum in your delivery.",
      B: "Decent knee height but a bit more lift could help you generate more downhill momentum.",
      C: "Your knee lift is low. This can limit the momentum you build in your delivery.",
      D: "Very low knee lift — you're not creating enough of a downhill angle to maximize velocity.",
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
      "A+": "Perfectly balanced at the top of your leg lift. Your trunk is stacked and you're ready to drive forward.",
      A: "Good balance at leg lift. You're controlled at the top and set up well to move forward.",
      B: "Slightly off balance. A small adjustment will help you initiate your drift more smoothly.",
      C: "Your balance is off at leg lift — you're leaning too far forward or back, which can disrupt your timing.",
      D: "Significant balance issues at the top of your lift. This is affecting everything that comes after.",
      F: "Major balance issue. You're falling off the rubber instead of driving from it.",
    },
  },
  // === DRIFT METRICS ===
  {
    key: "drift.hipLeadDistance",
    label: "Hip Lead",
    phase: "drift",
    unit: "",
    weight: 2,
    thresholds: {
      "12u": { lo: 0.08, hi: 0.20 },
      "14u": { lo: 0.10, hi: 0.22 },
      hs: { lo: 0.12, hi: 0.25 },
      college: { lo: 0.14, hi: 0.28 },
      pro: { lo: 0.16, hi: 0.30 },
    },
    explanation: {
      "A+": "Elite hip lead — you're getting your hips moving toward the plate early, just like the best in the game.",
      A: "Great hip lead — your hips are driving forward before your foot plants. This builds momentum.",
      B: "Good hip lead but there's room to get your hips moving sooner and further.",
      C: "Your hips aren't leading enough. You're leaving velocity on the table by not getting downhill early.",
      D: "Minimal hip lead — your upper body is doing too much work. Walking windups will fix this.",
      F: "No hip lead detected. You're throwing all arm. We need to completely rebuild your momentum pattern.",
    },
  },
  {
    key: "drift.backLegDriveAngle",
    label: "Back Leg Drive",
    phase: "drift",
    unit: "°",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 125, hi: 165 },
      "14u": { lo: 130, hi: 165 },
      hs: { lo: 135, hi: 160 },
      college: { lo: 140, hi: 160 },
      pro: { lo: 140, hi: 158 },
    },
    explanation: {
      "A+": "Perfect back leg — holding tension into the ground and transferring force up the chain. Elite ground connection.",
      A: "Great back leg. You're holding tension into the rubber and using ground force to drive forward momentum.",
      B: "Good back leg but you could hold more tension into the ground before releasing. Don't rush off the rubber.",
      C: "Your back leg is losing tension too early. Focus on pressing into the ground longer before your stride.",
      D: "Your back leg is collapsing instead of holding tension. You need to stay loaded into the ground longer before releasing forward.",
      F: "Back leg is not creating any ground force. You need to learn to hold tension into the rubber through your leg drive.",
    },
  },
  // === FOOT STRIKE METRICS ===
  {
    key: "footStrike.strideLength",
    label: "Stride Length",
    phase: "footStrike",
    unit: "x height",
    weight: 2,
    thresholds: {
      "12u": { lo: 0.65, hi: 0.80 },
      "14u": { lo: 0.70, hi: 0.83 },
      hs: { lo: 0.75, hi: 0.87 },
      college: { lo: 0.78, hi: 0.90 },
      pro: { lo: 0.80, hi: 0.92 },
    },
    explanation: {
      "A+": "Elite stride length. ASMI data shows this directly correlates with velocity — you're maximizing your runway.",
      A: "Great stride. You're getting good extension toward the plate, creating more time to accelerate the ball.",
      B: "Good stride but a few more inches would add measurable velocity. Step-behind drill will help.",
      C: "Short stride. You're cutting off your momentum and limiting velocity. This is fixable with targeted work.",
      D: "Very short stride — you're leaving 3-5 mph on the table. Focus on hip lead and aggressive downhill movement.",
      F: "Stride is well below baseline. This is the #1 thing to address immediately.",
    },
  },
  {
    key: "footStrike.hipShoulderSep",
    label: "Hip-Shoulder Separation",
    phase: "footStrike",
    unit: "°",
    weight: 3, // Highest weight — #1 velocity predictor
    thresholds: {
      "12u": { lo: 25, hi: 50 },
      "14u": { lo: 30, hi: 55 },
      hs: { lo: 35, hi: 60 },
      college: { lo: 40, hi: 60 },
      pro: { lo: 40, hi: 65 },
    },
    explanation: {
      "A+": "Elite hip-shoulder separation. This is the #1 velocity generator in the pitching delivery — ASMI research confirms it.",
      A: "Excellent separation. Your hips are opening before your shoulders, creating a powerful stretch-shortening cycle.",
      B: "Good separation but more would help. Focus on leading with your hips while keeping your shoulders closed longer.",
      C: "Below average separation. Your hips and shoulders are rotating too close together — you're losing the 'rubber band' effect.",
      D: "Minimal separation. This is directly costing you velocity. Band-assisted separation drills are essential.",
      F: "No meaningful separation detected. Your hips and shoulders rotate as one unit — this must change.",
    },
  },
  {
    key: "footStrike.leadKneeAngle",
    label: "Lead Knee at Landing",
    phase: "footStrike",
    unit: "°",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 120, hi: 160 },
      "14u": { lo: 125, hi: 158 },
      hs: { lo: 130, hi: 155 },
      college: { lo: 130, hi: 152 },
      pro: { lo: 130, hi: 150 },
    },
    explanation: {
      "A+": "Perfect landing position. Your front knee is flexed just right to absorb force and redirect energy upward.",
      A: "Great front leg position at landing. You're set up well for a powerful brace.",
      B: "Landing position is decent but could be optimized for better energy transfer.",
      C: "Your front knee is either too stiff or too bent at landing. This affects your ability to brace and rotate.",
      D: "Poor landing position. Either landing too stiff (jarring) or too collapsed (energy leak).",
      F: "Landing mechanics need significant work. The rocker drill will help rebuild your pattern.",
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
      "A+": "Perfect trunk position — slight forward lean with the torso stacked and ready to rotate.",
      A: "Good trunk position at foot strike. You're balanced and ready to deliver force.",
      B: "Trunk is a bit off ideal. Minor adjustment will improve your ability to get on top of the ball.",
      C: "Your trunk is either too upright or leaning too much. This affects your release angle.",
      D: "Poor trunk position — you're fighting your own body to deliver the ball effectively.",
      F: "Trunk position needs a complete rebuild. Tall-and-fall drill daily.",
    },
  },
  {
    key: "footStrike.forearmVerticalAngle",
    label: "Arm Timing",
    phase: "footStrike",
    unit: "°",
    weight: 2.5, // High weight — late arm is top injury risk factor
    thresholds: {
      "12u": { lo: 0, hi: 30 },
      "14u": { lo: 0, hi: 25 },
      hs: { lo: 0, hi: 20, injuryAbove: 45 },
      college: { lo: 0, hi: 18, injuryAbove: 40 },
      pro: { lo: 0, hi: 15, injuryAbove: 35 },
    },
    explanation: {
      "A+": "Perfect arm timing — your arm is up and cocked at foot strike, fully loaded and ready to accelerate. This is elite sequencing.",
      A: "Great arm timing. Your forearm is near-vertical at foot strike — you're 'on time' and ready to throw.",
      B: "Slightly off on timing but still functional. A small adjustment to your arm path will tighten this up.",
      C: "Your arm is late getting to the cocked position at foot strike. This forces the arm to rush through acceleration, adding stress.",
      D: "Late arm — your forearm is well below vertical at foot strike. ASMI research identifies this as the #1 mechanical risk factor for UCL injury.",
      F: "Severely late arm timing. This is a red flag for elbow injury. Your arm path needs immediate attention before throwing at full intensity.",
    },
  },
  // === MER METRICS ===
  {
    key: "mer.shoulderExternalRotation",
    label: "Shoulder External Rotation",
    phase: "mer",
    unit: "°",
    weight: 2.5,
    thresholds: {
      "12u": { lo: 140, hi: 170, injuryAbove: 180 },
      "14u": { lo: 140, hi: 175, injuryAbove: 180 },
      hs: { lo: 140, hi: 180, injuryAbove: 180 },
      college: { lo: 140, hi: 180, injuryAbove: 180 },
      pro: { lo: 140, hi: 180, injuryAbove: 180 },
    },
    explanation: {
      "A+": "Elite layback. Your arm is cocking back to a position that generates maximum velocity while staying in a safe range.",
      A: "Great external rotation. This 'forearm layback' position is what separates high-velo from average arms.",
      B: "Good layback but you have room to develop more. Flexibility work and weighted ball throws can help.",
      C: "Below average external rotation. You're leaving significant velocity potential untapped.",
      D: "Limited external rotation — this is a major velocity limiter. Flexibility and arm path work needed.",
      F: "Very limited layback. This suggests either mechanical issues or flexibility limitations to address.",
    },
  },
  {
    key: "mer.elbowFlexion",
    label: "Elbow Angle at MER",
    phase: "mer",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 75, hi: 110 },
      "14u": { lo: 80, hi: 105 },
      hs: { lo: 80, hi: 105 },
      college: { lo: 85, hi: 100 },
      pro: { lo: 85, hi: 100 },
    },
    explanation: {
      "A+": "Perfect elbow angle. ~90° is the sweet spot for both velocity and arm health per ASMI research.",
      A: "Great elbow position at MER. This distributes stress evenly across the arm.",
      B: "Good but slightly off ideal. Minor adjustment will improve efficiency and reduce stress.",
      C: "Elbow angle is outside optimal range. This increases stress on the UCL or shoulder.",
      D: "Elbow angle is concerning. Too straight = more valgus stress, too bent = less velocity.",
      F: "Elbow angle is in a risky range. This needs immediate attention to protect the arm.",
    },
  },
  {
    key: "mer.shoulderAbduction",
    label: "Shoulder Abduction",
    phase: "mer",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 70, hi: 105, injuryAbove: 115 },
      "14u": { lo: 75, hi: 105, injuryAbove: 112 },
      hs: { lo: 80, hi: 100, injuryAbove: 110 },
      college: { lo: 80, hi: 100, injuryAbove: 110 },
      pro: { lo: 80, hi: 100, injuryAbove: 110 },
    },
    explanation: {
      "A+": "Perfect arm height — elbow right at shoulder level. This is the safest and most powerful position.",
      A: "Great shoulder abduction. Your arm is in a healthy slot at MER.",
      B: "Slightly off ideal arm height. A minor adjustment will improve efficiency.",
      C: "Arm is too high or too low relative to your shoulders. This adds stress and costs velocity.",
      D: "Poor arm height at MER. If the arm is above 100°, you're at increased impingement risk.",
      F: "Arm position at MER is in a dangerous range. Immediate correction needed.",
    },
  },
  {
    key: "mer.leadLegBrace",
    label: "Lead Leg Brace",
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
      "A+": "Elite front leg brace. You're converting every bit of forward momentum into rotational power.",
      A: "Strong lead leg brace. This is one of the biggest velocity creators in the delivery.",
      B: "Good brace but could be firmer. More extension = more energy transfer to the ball.",
      C: "Your front leg is collapsing — energy is leaking into the ground instead of going to the ball.",
      D: "Weak brace. Driveline data shows this is directly correlated with lost velocity.",
      F: "No real brace happening. Your front leg is absorbing energy instead of redirecting it.",
    },
  },
  // === RELEASE METRICS ===
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
      "A+": "Elite trunk flexion at release. You're getting on top of the ball with authority — this creates downhill plane and perceived velocity.",
      A: "Great trunk tilt. This forward lean at release is what creates that heavy, downhill fastball.",
      B: "Decent trunk flexion but more would help your perceived velocity and pitch tunneling.",
      C: "Not enough forward trunk tilt. You're releasing the ball more flat, losing downhill angle.",
      D: "Too upright at release. This makes your pitches easier to pick up out of the hand.",
      F: "Very upright release — no downhill plane. Tall-and-fall drill is essential.",
    },
  },
  {
    key: "release.leadLegExtension",
    label: "Lead Leg Extension",
    phase: "release",
    unit: "°",
    weight: 2.5,
    thresholds: {
      "12u": { lo: 140, hi: 180 },
      "14u": { lo: 145, hi: 180 },
      hs: { lo: 150, hi: 180 },
      college: { lo: 155, hi: 180 },
      pro: { lo: 160, hi: 180 },
    },
    explanation: {
      "A+": "Full front leg brace at release — this is where velocity comes from. You're catapulting the ball with rotational energy.",
      A: "Great lead leg extension. You're bracing hard and transferring energy efficiently.",
      B: "Good but a firmer brace would add measurable velocity. Focus on 'posting up' against a firm front side.",
      C: "Your front leg is bending too much at release. Energy is leaking. Rocker drill with intent.",
      D: "Significant front leg collapse. This is directly costing you 3-5 mph based on Driveline data.",
      F: "No front leg brace. All the momentum you built is being absorbed into the ground.",
    },
  },
  {
    key: "release.armSlot",
    label: "Arm Slot",
    phase: "release",
    unit: "°",
    weight: 0, // Informational — not graded
    thresholds: {
      "12u": { lo: 0, hi: 360 },
      "14u": { lo: 0, hi: 360 },
      hs: { lo: 0, hi: 360 },
      college: { lo: 0, hi: 360 },
      pro: { lo: 0, hi: 360 },
    },
    explanation: {
      "A+": "Arm slot is a natural characteristic — there is no 'ideal' slot. Yours is consistent.",
      A: "Arm slot is a natural characteristic — there is no 'ideal' slot. Yours is consistent.",
      B: "Arm slot is a natural characteristic — there is no 'ideal' slot.",
      C: "Arm slot is a natural characteristic — there is no 'ideal' slot.",
      D: "Arm slot is a natural characteristic — there is no 'ideal' slot.",
      F: "Arm slot is a natural characteristic — there is no 'ideal' slot.",
    },
  },
];

// ============================================================
// GRADE A SINGLE METRIC
// ============================================================

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
): { grade: LetterGrade; color: GradeColor; injuryFlag: boolean } {
  if (value === null) return { grade: "B", color: "yellowGreen", injuryFlag: false };

  const t = def.thresholds[level];

  // Check injury flags — still flag but cap at C grade
  if (t.injuryAbove && value > t.injuryAbove) return { grade: "C", color: "injury", injuryFlag: true };
  if (t.injuryBelow && value < t.injuryBelow) return { grade: "C", color: "injury", injuryFlag: true };

  // Informational metrics (weight = 0)
  if (def.weight === 0) return { grade: "A", color: "green", injuryFlag: false };

  const center = (t.lo + t.hi) / 2;
  const halfRange = (t.hi - t.lo) / 2;
  if (halfRange === 0) return { grade: "A", color: "green", injuryFlag: false };

  const distFromCenter = Math.abs(value - center);
  const ratio = distFromCenter / halfRange;

  if (value >= t.lo && value <= t.hi) {
    // Inside target range
    if (ratio < 0.3) return { grade: "A+", color: "green", injuryFlag: false };
    return { grade: "A", color: "green", injuryFlag: false };
  }

  // Outside range — wider B bucket, C is the floor
  if (ratio < 1.6) return { grade: "B", color: "yellowGreen", injuryFlag: false };
  return { grade: "C", color: "yellow", injuryFlag: false };
}

// ============================================================
// GRADE ALL METRICS → PHASE GRADES → OVERALL
// ============================================================

const GRADE_SCORES: Record<LetterGrade, number> = {
  "A+": 98, A: 93, B: 85, C: 75, D: 75, F: 75,
};

export function gradeAllMetrics(
  metrics: AllMetrics,
  level: AthleteLevel
): { metricGrades: MetricGrade[]; phaseGrades: PhaseGrade[]; overall: OverallGrade } {
  const metricGrades: MetricGrade[] = [];

  for (const def of METRIC_DEFS) {
    const value = getNestedValue(metrics, def.key);
    const { grade, color, injuryFlag } = gradeValue(value, def, level);

    metricGrades.push({
      metricKey: def.key,
      label: def.label,
      value,
      unit: def.unit,
      grade,
      color,
      phase: def.phase,
      injuryFlag,
      explanation: def.explanation[grade],
    });
  }

  // Phase grades
  const phases: PhaseName[] = ["legLift", "drift", "footStrike", "mer", "release"];
  const phaseGrades: PhaseGrade[] = phases.map((phase) => {
    const phaseMetrics = metricGrades.filter((m) => m.phase === phase);
    const gradedMetrics = phaseMetrics.filter((m) => {
      const def = METRIC_DEFS.find((d) => d.key === m.metricKey);
      return def && def.weight > 0;
    });

    let totalScore = 0;
    let totalWeight = 0;
    for (const m of gradedMetrics) {
      const def = METRIC_DEFS.find((d) => d.key === m.metricKey)!;
      totalScore += GRADE_SCORES[m.grade] * def.weight;
      totalWeight += def.weight;
    }
    const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

    let grade: LetterGrade;
    if (score >= 97) grade = "A+";
    else if (score >= 90) grade = "A";
    else if (score >= 80) grade = "B";
    else grade = "C";

    let color: GradeColor;
    if (grade === "A+" || grade === "A") color = "green";
    else if (grade === "B") color = "yellowGreen";
    else color = "yellow";

    // Override if any metric has injury flag
    if (phaseMetrics.some((m) => m.injuryFlag)) color = "injury";

    return {
      phase,
      label: PHASE_LABELS[phase],
      grade,
      color,
      score,
      metrics: phaseMetrics,
    };
  });

  // Overall grade
  let overallTotal = 0;
  let overallWeight = 0;
  const phaseWeights: Record<PhaseName, number> = { legLift: 0.5, drift: 1, footStrike: 1.5, mer: 1.5, release: 1 };
  for (const pg of phaseGrades) {
    const w = phaseWeights[pg.phase];
    overallTotal += pg.score * w;
    overallWeight += w;
  }
  const overallScore = overallWeight > 0 ? Math.round(overallTotal / overallWeight) : 50;

  let overallLetterGrade: LetterGrade;
  if (overallScore >= 97) overallLetterGrade = "A+";
  else if (overallScore >= 90) overallLetterGrade = "A";
  else if (overallScore >= 80) overallLetterGrade = "B";
  else overallLetterGrade = "C";

  let overallColor: GradeColor;
  if (overallLetterGrade === "A+" || overallLetterGrade === "A") overallColor = "green";
  else if (overallLetterGrade === "B") overallColor = "yellowGreen";
  else overallColor = "yellow";

  // Build verdict
  const bestPhase = [...phaseGrades].sort((a, b) => b.score - a.score)[0];
  const worstPhase = [...phaseGrades].sort((a, b) => a.score - b.score)[0];
  const injuryMetrics = metricGrades.filter((m) => m.injuryFlag);

  let verdict: string;
  if (injuryMetrics.length > 0) {
    verdict = `Watch your ${injuryMetrics[0].label.toLowerCase()} — it's in a range that increases injury risk. Your ${bestPhase.label.toLowerCase()} is a strength to build on.`;
  } else if (overallScore >= 90) {
    verdict = `Strong mechanics — your ${bestPhase.label.toLowerCase()} is elite. Fine-tune your ${worstPhase.label.toLowerCase()} for the next level.`;
  } else if (overallScore >= 80) {
    verdict = `Good foundation. Your ${bestPhase.label.toLowerCase()} looks solid. Focus on ${worstPhase.label.toLowerCase()} to unlock more velocity.`;
  } else {
    verdict = `Room to grow — start with your ${worstPhase.label.toLowerCase()}, where the biggest gains are. Your ${bestPhase.label.toLowerCase()} is working for you.`;
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
