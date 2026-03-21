/**
 * PitchingCoachAI — Drill Prescription Engine
 *
 * Maps graded metrics to specific, actionable drill recommendations.
 * Each drill targets a specific mechanical fault and includes:
 * - What to do
 * - Why it works
 * - Rep scheme
 *
 * Drills sourced from Driveline and Tread Athletics (Ben Brewster) methodology.
 */

import {
  type MetricGrade,
  type DrillPrescription,
  type PhaseName,
} from "./types";

// ============================================================
// DRILL DATABASE
// ============================================================

interface DrillEntry {
  name: string;
  description: string;
  reps: string;
}

const DRILL_MAP: Record<string, DrillEntry> = {
  // DRIFT drills
  "drift.hipLeadDistance": {
    name: "Hershiser Drill",
    description: "Start with your lead foot on a bucket or low box. Shift your weight forward over your lead foot, letting your hips drift toward the target while your arm stays relaxed at your side. This teaches early hip lead — the foundation of velocity. Feel your hips 'pull' your body forward, not your arm.",
    reps: "3 sets of 10 reps before every bullpen",
  },
  "drift.backLegDriveAngle": {
    name: "Resistance Band Push-Off",
    description: "Loop a resistance band around your back knee. From the stretch position, drive off the rubber against the band resistance. This builds explosive back leg drive. Focus on pushing through the ball of your back foot, not sliding off the side.",
    reps: "3 sets of 8 reps, moderate resistance",
  },
  // FOOT STRIKE drills
  "footStrike.strideLength": {
    name: "Step-Behind Drill",
    description: "Start with your lead foot one step in front of the rubber. Take a crossover step behind your lead foot and deliver. This forces a longer stride by building momentum before you even start your delivery. Measure your stride — you should be at 77-87% of your height.",
    reps: "10-15 throws from flat ground",
  },
  "footStrike.hipShoulderSep": {
    name: "Band-Assisted Hip-Shoulder Separation",
    description: "Stand sideways with a resistance band anchored behind you, held at hip level. Rotate your hips toward the target while resisting with your upper body. Hold the separation for 2 seconds. This builds the 'rubber band' stretch that creates rotational power — the #1 velocity generator.",
    reps: "3 sets of 10 reps per side",
  },
  "footStrike.leadKneeAngle": {
    name: "Rocker Drill",
    description: "From a balanced position, rock forward into your stride and land with your front knee flexed to roughly 40-50°. Hold this position for 2 seconds to feel the correct landing angle. Your front knee should be slightly ahead of your front ankle — not collapsed over your toes.",
    reps: "10-15 reps, then 10 throws from this position",
  },
  "footStrike.trunkAngle": {
    name: "Walk-In Delivery Drill",
    description: "Start 10 feet behind the mound. Walk toward the rubber building momentum, then transition directly into your delivery without stopping. This teaches your body to maintain forward trunk tilt naturally through momentum — not by forcing a lean. Brewster emphasizes: your trunk angle at foot strike should come from momentum, not manipulation.",
    reps: "10-15 throws, progressively adding intent",
  },
  "footStrike.forearmVerticalAngle": {
    name: "Connection Ball Arm Timing Drill",
    description: "Place a small foam ball (or rolled-up sock) between your chin and glove-side shoulder. Go through your delivery — if the ball drops before foot strike, your arm is late. This drill teaches proper sequencing: the arm should arrive at the cocked position (forearm vertical, elbow at shoulder height) at the exact moment your front foot lands. A late arm is the #1 injury risk factor per ASMI research.",
    reps: "15-20 dry reps, then 10 throws at 75% effort",
  },
  // MER drills
  "mer.shoulderExternalRotation": {
    name: "Weighted Ball Reverse Throws",
    description: "Using a 7oz plyo ball, perform reverse throws focusing on arm path. Let the ball pull your forearm into layback naturally. This builds the flexibility and motor pattern for healthy external rotation. Don't force the layback — let momentum create it.",
    reps: "2 sets of 10 with 7oz ball, then 10 with 5oz",
  },
  "mer.elbowFlexion": {
    name: "Arm Path Towel Drill",
    description: "Hold a towel by one end. Go through your delivery in slow motion, focusing on getting your elbow to 90° as your arm comes into the cocking position. The towel provides feedback — if it wraps around your arm, your elbow angle is off. Goal: crisp 90° at MER.",
    reps: "15-20 slow-motion reps, then 10 at game speed",
  },
  "mer.shoulderAbduction": {
    name: "Elbow Height Awareness Drill",
    description: "Stand facing a wall at arm's length. Bring your arm up into the cocking position with your elbow touching the wall at shoulder height. Your elbow should be level with your shoulder — not above, not below. This trains the proprioceptive feel of proper abduction.",
    reps: "20 slow reps, eyes closed for last 10",
  },
  "mer.leadLegBrace": {
    name: "Front Leg Brace Wall Drill",
    description: "Stand in your stride position with your front foot against a wall. Simulate your delivery, driving your front hip into the wall while bracing your front knee. Feel the energy redirect upward. Your front leg should straighten (not collapse) as you rotate.",
    reps: "3 sets of 10 with focus on leg firmness",
  },
  // RELEASE drills
  "release.trunkForwardFlexion": {
    name: "Crow Hop Throws",
    description: "From flat ground, take a crow hop and throw with maximum intent. The crow hop forces your body into aggressive forward trunk flexion naturally — your chest drives over your front knee at release. Focus on getting your chest past your lead leg. This builds the motor pattern for 35-45° of trunk tilt at release, which is one of the top velocity predictors per ASMI research.",
    reps: "15-20 throws at 80-100% intent, flat ground",
  },
  "release.leadLegExtension": {
    name: "Brace and Rotate Drill",
    description: "From your stride position, plant your front foot and immediately straighten your front leg while rotating your trunk. The cue: 'post up and throw through.' Your front leg should be near-full extension (160°+) at ball release. This converts forward momentum into rotational velocity — it's where the real velocity comes from.",
    reps: "10 throws from flat ground, exaggerate the brace",
  },
  "release.elbowExtension": {
    name: "Pull-Down Throws",
    description: "From a running start on flat ground, throw a 5oz plyo ball into a wall at max effort. The running momentum forces full arm extension through release — your elbow should reach 160-175° at the release point. If you're short-arming (elbow too bent at release), you're leaving velocity on the table and adding stress to your shoulder. This is a Driveline staple for building extension and intent.",
    reps: "2 sets of 8 throws, max intent into a padded wall",
  },
};

// ============================================================
// PRESCRIPTION ENGINE
// ============================================================

export function prescribeDrills(metricGrades: MetricGrade[]): DrillPrescription[] {
  const drills: DrillPrescription[] = [];

  // Filter to metrics that need work (C, D, or F) and have weight > 0
  const needsWork = metricGrades
    .filter((m) => {
      const isWeak = m.grade === "C" || m.grade === "D" || m.grade === "F";
      const isInjury = m.injuryFlag;
      return isWeak || isInjury;
    })
    .sort((a, b) => {
      // Injury flags first, then by grade severity
      if (a.injuryFlag && !b.injuryFlag) return -1;
      if (!a.injuryFlag && b.injuryFlag) return 1;
      const order: Record<string, number> = { F: 0, D: 1, C: 2, B: 3, A: 4, "A+": 5 };
      return (order[a.grade] ?? 3) - (order[b.grade] ?? 3);
    });

  let priority = 1;
  for (const m of needsWork) {
    const drill = DRILL_MAP[m.metricKey];
    if (!drill) continue;

    drills.push({
      name: drill.name,
      description: drill.description,
      targetMetric: m.label,
      phase: m.phase,
      reps: drill.reps,
      priority: priority++,
    });
  }

  // Cap at 5 drills max — don't overwhelm
  return drills.slice(0, 5);
}
