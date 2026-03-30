/**
 * PitchingCoachAI — Drill Prescription Engine
 *
 * Maps graded metrics to specific, actionable drill recommendations.
 * Each drill targets a specific mechanical fault and includes:
 * - What to do
 * - Why it works
 * - Rep scheme
 * - Optional GPS Athletics product recommendation
 *
 * Drills sourced from Driveline and Tread Athletics (Ben Brewster) methodology.
 * Product recommendations from GPS Athletics (gps-athletics.com).
 */

import {
  type MetricGrade,
  type DrillPrescription,
  type PhaseName,
} from "./types";

// ============================================================
// GPS ATHLETICS PRODUCT LINKS
// ============================================================

const GPS_BASE = "https://gps-athletics.com/products";
const UTM = (campaign: string) =>
  `?utm_source=pitchingcoachai&utm_medium=analysis&utm_campaign=${campaign}`;

const GPS_PRODUCTS = {
  weightedBalls: {
    name: "Soft-Shell Weighted Balls",
    url: `${GPS_BASE}/soft-shell-weighted-balls`,
  },
  resistanceBands: {
    name: "Resistance Bands",
    url: `${GPS_BASE}/resistance-bands`,
  },
} as const;

// ============================================================
// DRILL DATABASE
// ============================================================

interface DrillEntry {
  name: string;
  description: string;
  reps: string;
  product?: {
    name: string;
    url: string;
    campaign: string;
  };
}

const DRILL_MAP: Record<string, DrillEntry> = {
  // LEG LIFT drills
  "legLift.leadKneeHeight": {
    name: "Balance Point Hold",
    description: "From the stretch, lift your lead knee to your balance point and HOLD for 3-5 seconds. Focus on keeping your trunk straight and your weight over the rubber foot. Don't lean forward or backward — stay tall and balanced. The goal is to feel completely in control at the top of your lift before you start moving forward. This is the foundation everything else builds on.",
    reps: "10 holds of 3-5 seconds before every bullpen",
  },
  "legLift.balancePoint": {
    name: "Balance Point Mirror Work",
    description: "Stand in front of a full-length mirror. Go through your windup in slow motion and pause at the top of your leg lift. Check your posture — your shoulders should be directly over your hips, your trunk should be straight, and you should feel balanced. If you're leaning, adjust until you can hold the position for 5 seconds without wobbling. This builds body awareness for the most important position in your delivery.",
    reps: "5 minutes of slow-motion reps in front of a mirror, daily",
  },
  // DRIFT drills
  "drift.hipLeadDistance": {
    name: "Walking Windup",
    description: "Start 10-15 feet behind the rubber. Walk toward your target with a smooth, rhythmic pace and transition directly into your full windup delivery without stopping. This teaches your body to lead with the hips and maintain forward momentum through the delivery. Focus on staying loose and letting your body flow toward the plate.",
    reps: "10-15 throws from flat ground before every bullpen",
  },
  "drift.backLegDriveAngle": {
    name: "Rocker Drill with Ground Tension",
    description: "From the stretch position, rock back and forth slowly, feeling your back leg press into the ground. Hold the loaded position for 2 seconds before each throw — feel the tension from your back foot through your hip. The goal is to hold ground force as long as possible before releasing into your stride. Don't push off — stay connected to the ground and let the tension transfer up the chain.",
    reps: "10-12 throws at 75% effort, 2-second hold each rep",
  },
  // FOOT STRIKE drills
  "footStrike.strideLength": {
    name: "Step-Behind Drill with Leg Lift",
    description: "Come into your set position. Lift your lead leg to balance point, then stride forward and step behind. This works on three things at once: stride length, shifting your center of mass forward, and building linear momentum toward the target. The leg lift forces you to find balance before moving forward, which teaches your body to create momentum in a straight line to the plate. Measure your stride — you should be at 77-87% of your height.",
    reps: "10-15 throws from flat ground",
  },
  "footStrike.hipShoulderSep": {
    name: "Weighted Ball Connection Drill",
    description: "Using a soft-shell weighted ball (1-2 lbs), perform rocker throws focusing on separating your hips from your shoulders. Start sideways, rock forward, and feel your hips open toward the target while your chest stays closed to third base (for righties). The weighted ball slows down the movement just enough to feel the stretch between your hips and shoulders. This builds the 'rubber band' effect that creates rotational power — the #1 velocity generator.",
    reps: "3 sets of 8-10 throws per side, 75% effort",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "hip_shoulder_sep",
    },
  },
  "footStrike.leadKneeAngle": {
    name: "Rocker Drill",
    description: "From a balanced position, rock forward into your stride and land with your front knee flexed to roughly 40-50°. Hold this position for 2 seconds to feel the correct landing angle. Your front knee should be slightly ahead of your front ankle — not collapsed over your toes.",
    reps: "10-15 reps, then 10 throws from this position",
  },
  "footStrike.trunkAngle": {
    name: "Walk-In Delivery Drill",
    description: "Start 10 feet behind the mound. Walk toward the rubber building momentum, then transition directly into your delivery without stopping. This teaches your body to maintain forward trunk tilt naturally through momentum — not by forcing a lean. Your trunk angle at foot strike should come from momentum, not manipulation.",
    reps: "10-15 throws, progressively adding intent",
  },
  "footStrike.forearmVerticalAngle": {
    name: "Mirror Work + T-Position Rocker",
    description: "Mirror Work: Stand in front of a full-length mirror and go through your delivery in slow motion. Pause at foot strike and check your arm position — your throwing arm should be up in the cocked position with your forearm vertical and elbow at shoulder height. If your arm is still down or behind, you have a timing issue. Repeat until you can consistently hit the right position at foot strike. T-Position Rocker: From the T-position (both arms out, elbows at shoulder height), rock forward into your stride and deliver. This drill gives you the feel of having your arm already in position when your foot lands, building the muscle memory for proper arm timing.",
    reps: "10 slow-motion mirror reps, then 10-15 T-position rocker throws at 75%",
  },
  // MER drills
  "mer.shoulderExternalRotation": {
    name: "Band Shoulder Care Routine",
    description: "Use a resistance band for a complete shoulder care routine: External Rotation — anchor the band at elbow height, hold with your throwing arm at 90/90, and slowly rotate your forearm away from your body. Internal Rotation — same setup, rotate inward. Sleeper Stretch — lie on your throwing side with arm at 90° and gently push forearm toward the ground. Cross-Body Stretch — bring your arm across your chest and hold. These build posterior shoulder flexibility and rotator cuff strength, which is the key to gaining healthy external rotation range. Do these daily — consistency matters more than intensity.",
    reps: "3 sets of 15 ER/IR band reps + 3x30s holds each stretch, daily",
    product: {
      name: GPS_PRODUCTS.resistanceBands.name,
      url: GPS_PRODUCTS.resistanceBands.url,
      campaign: "shoulder_mobility",
    },
  },
  "mer.elbowFlexion": {
    name: "Pivot Pick-Off Drill",
    description: "From the stretch, perform a pick-off move to first base (or a target at 90°). This forces your arm to get to a proper 90° elbow angle quickly. Focus on a short, compact arm path that arrives at the cocked position with a clean right angle at the elbow. This teaches efficient arm action without the forearm dropping below the elbow.",
    reps: "10-15 throws at 75%, focus on arm path",
  },
  "mer.shoulderAbduction": {
    name: "Band Pull-Aparts + 90/90 Arm Raises",
    description: "Band Pull-Aparts: Hold a resistance band at shoulder height with arms straight out. Pull the band apart by squeezing your shoulder blades together. This strengthens the scapular stabilizers that hold your elbow at shoulder height during MER. 90/90 Arm Raises: Stand with your arm in the 90/90 position (elbow at shoulder height, forearm vertical). Slowly raise and lower your elbow while keeping the 90° bend, focusing on controlling shoulder abduction. Add a light dumbbell (2-3 lbs) as you get stronger. These build the shoulder stability needed to hold proper elbow height through MER.",
    reps: "3 sets of 15 band pull-aparts, 3 sets of 10 arm raises each side, daily",
    product: {
      name: GPS_PRODUCTS.resistanceBands.name,
      url: GPS_PRODUCTS.resistanceBands.url,
      campaign: "elbow_height",
    },
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
    description: "From a running start on flat ground, throw a soft-shell weighted ball (5 oz) into a padded wall at max effort. The running momentum forces full arm extension through release — your elbow should reach 160-175° at the release point. If you're short-arming (elbow too bent at release), you're leaving velocity on the table and adding stress to your shoulder. Pull-downs build extension and intent.",
    reps: "2 sets of 8 throws, max intent into a padded wall",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "arm_extension",
    },
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
      product: drill.product ? {
        name: drill.product.name,
        url: `${drill.product.url}${UTM(drill.product.campaign)}`,
        campaign: drill.product.campaign,
      } : undefined,
    });
  }

  // Cap at 5 drills max — don't overwhelm
  return drills.slice(0, 5);
}
