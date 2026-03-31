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

const GPS_BASE = "https://gps-athletics.com";
const UTM = (campaign: string) =>
  `?utm_source=pitchingcoachai&utm_medium=analysis&utm_campaign=${campaign}`;

const GPS_PRODUCTS = {
  weightedBalls: {
    name: "Soft-Shell Weighted Balls",
    url: GPS_BASE,
  },
  resistanceBands: {
    name: "Resistance Bands",
    url: GPS_BASE,
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

// Each metric can map to multiple drills. The engine picks the best one
// based on severity and avoids duplicating drill types.
const DRILL_MAP: Record<string, DrillEntry[]> = {
  // LEG LIFT drills
  "legLift.leadKneeHeight": [{
    name: "Balance Point Hold",
    description: "From the stretch, lift your lead knee to your balance point and HOLD for 3-5 seconds. Focus on keeping your trunk straight and your weight over the rubber foot. Don't lean forward or backward — stay tall and balanced. The goal is to feel completely in control at the top of your lift before you start moving forward. This is the foundation everything else builds on.",
    reps: "10 holds of 3-5 seconds before every bullpen",
  }],
  "legLift.balancePoint": [{
    name: "Balance Point Mirror Work",
    description: "Stand in front of a full-length mirror. Go through your windup in slow motion and pause at the top of your leg lift. Check your posture — your shoulders should be directly over your hips, your trunk should be straight, and you should feel balanced. If you're leaning, adjust until you can hold the position for 5 seconds without wobbling. This builds body awareness for the most important position in your delivery.",
    reps: "5 minutes of slow-motion reps in front of a mirror, daily",
  }, {
    name: "One Knee to Throw",
    description: "Kneel on your back knee with your lead leg up in front of you. From this position, throw to a target focusing on staying tall and balanced with your trunk stacked. Because you can't use your legs, this drill isolates upper body posture and teaches you what it feels like to stay stacked and balanced through the throw. This is a great warm-up drill that reinforces the feeling you want at leg lift.",
    reps: "10-15 throws at 60-70% effort, focus on trunk posture",
  }],
  // DRIFT drills
  "drift.hipLeadDistance": [{
    name: "Walking Windup",
    description: "Start 10-15 feet behind the rubber. Walk toward your target with a smooth, rhythmic pace and transition directly into your full windup delivery without stopping. This teaches your body to lead with the hips and maintain forward momentum through the delivery. Focus on staying loose and letting your body flow toward the plate.",
    reps: "10-15 throws from flat ground before every bullpen",
  }, {
    name: "Roll-In Throws",
    description: "Start about 8-10 feet behind the rubber. Roll forward on your back foot, building momentum toward the plate, and transition into your delivery as you reach the rubber. The roll-in teaches you to load the back hip while moving forward — building the hip lead that creates velocity. Focus on feeling your weight shift smoothly from your back side to your front side without any pause or stop at the rubber.",
    reps: "10-15 throws from flat ground, focus on smooth weight transfer",
  }],
  "drift.backLegDriveAngle": [{
    name: "Rocker Drill with Ground Tension",
    description: "From the stretch position, rock back and forth slowly, feeling your back leg press into the ground. Hold the loaded position for 2 seconds before each throw — feel the tension from your back foot through your hip. The goal is to hold ground force as long as possible before releasing into your stride. Don't push off — stay connected to the ground and let the tension transfer up the chain.",
    reps: "10-12 throws at 75% effort, 2-second hold each rep",
  }, {
    name: "Rocker with Lead Leg Lift",
    description: "From the stretch position, rock back, lift your lead leg to balance point, then stride and throw. The lead leg lift forces you to load your back hip properly and feel the ground tension before you move forward. This prevents the 'rush' off the rubber that comes from pushing off too early. Focus on staying loaded into the rubber through the entire leg lift — don't let the back leg fire until your lead leg starts down.",
    reps: "10-12 throws at 75% effort, pause at the top of leg lift",
  }],
  "drift.backLegTensionHold": [{
    name: "Slow-Stride Tension Hold",
    description: "From the stretch, go through your delivery in SLOW MOTION. As you stride toward the plate, focus on keeping your back knee bent and loaded — feel the tension in your back leg into the ground. DO NOT let your back leg push you forward. Your back foot should stay connected to the rubber as long as possible, with the knee staying bent. Only let it release in the last third of your stride. Film from the side and check: does your back leg straighten early (pushing off) or stay bent through most of the stride (holding tension)? This is the #1 drill for fixing a pushy back leg.",
    reps: "10 slow-motion reps, then 10 throws at 75% applying the feel",
  }],
  // FOOT STRIKE drills
  "footStrike.strideLength": [{
    name: "Step-Behind Drill with Leg Lift",
    description: "Come into your set position. Lift your lead leg to balance point, then stride forward and step behind. This works on three things at once: stride length, shifting your center of mass forward, and building linear momentum toward the target. The leg lift forces you to find balance before moving forward, which teaches your body to create momentum in a straight line to the plate. Measure your stride — you should be at 77-87% of your height.",
    reps: "10-15 throws from flat ground",
  }, {
    name: "Roll-In Throws for Stride",
    description: "Start 8-10 feet behind the rubber. Roll forward on your back foot, building momentum, and transition into your delivery. The added momentum from the roll-in naturally increases your stride length without you having to force it. This teaches your body that stride length comes from forward momentum — not from reaching with your front foot. Film from the side and measure your stride after 10 reps.",
    reps: "10-15 throws from flat ground, measure stride length",
  }],
  "footStrike.hipShoulderSep": [{
    name: "Split Stance Soft-Shell Weighted Ball Throws",
    description: "Start in a wide split stance with your feet already planted. Using a soft-shell weighted ball (1-2 lbs), rotate your hips open while keeping your shoulders closed. Feel the stretch between your hips and shoulders — that's the separation we want. The split stance removes the stride so you can focus purely on the rotational separation. The weighted ball slows down the movement just enough to feel the stretch. This builds the 'rubber band' effect that creates rotational power.",
    reps: "3 sets of 8-10 throws, 75% effort",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "hip_shoulder_sep",
    },
  }, {
    name: "Soft-Shell Weighted Ball Connection Drill",
    description: "Using a soft-shell weighted ball (1-2 lbs), perform rocker throws focusing on separating your hips from your shoulders. Start sideways, rock forward, and feel your hips open toward the target while your chest stays closed to third base (for righties). The weighted ball slows down the movement just enough to feel the stretch between your hips and shoulders. This builds the 'rubber band' effect that creates rotational power — the #1 velocity generator.",
    reps: "3 sets of 8-10 throws per side, 75% effort",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "hip_shoulder_sep",
    },
  }],
  "footStrike.leadKneeAngle": [{
    name: "Rocker Drill",
    description: "From a balanced position, rock forward into your stride and land with your front knee flexed to roughly 40-50°. Hold this position for 2 seconds to feel the correct landing angle. Your front knee should be slightly ahead of your front ankle — not collapsed over your toes.",
    reps: "10-15 reps, then 10 throws from this position",
  }],
  "footStrike.trunkAngle": [{
    name: "Walk-In Delivery Drill",
    description: "Start 10 feet behind the mound. Walk toward the rubber building momentum, then transition directly into your delivery without stopping. This teaches your body to maintain forward trunk tilt naturally through momentum — not by forcing a lean. Your trunk angle at foot strike should come from momentum, not manipulation.",
    reps: "10-15 throws, progressively adding intent",
  }],
  "footStrike.forearmVerticalAngle": [{
    name: "Heavy Soft-Shell Weighted Ball for Arm Timing",
    description: "Using a heavy soft-shell weighted ball (7-9 oz), go through your delivery focusing on getting your arm UP at foot strike. The heavier ball slows down the arm action just enough that you can FEEL whether your arm is in position when your front foot hits. If the ball feels like it's dragging behind, your arm is late. Focus on the hand break timing — break your hands early enough that your arm has time to get to the cocked position. The heavy ball gives you the feedback your body needs to fix the timing.",
    reps: "2 sets of 10 throws at 70% effort, pause and check arm at FFS",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "arm_timing",
    },
  }, {
    name: "Mirror Work + T-Position Rocker",
    description: "Mirror Work: Stand in front of a full-length mirror and go through your delivery in slow motion. Pause at foot strike and check your arm position — your throwing arm should be up in the cocked position with your forearm vertical and elbow at shoulder height. If your arm is still down or behind, you have a timing issue. T-Position Rocker: From the T-position (both arms out, elbows at shoulder height), rock forward into your stride and deliver. This drill gives you the feel of having your arm already in position when your foot lands.",
    reps: "10 slow-motion mirror reps, then 10-15 T-position rocker throws at 75%",
  }],
  // MER drills
  "mer.shoulderExternalRotation": [{
    name: "Band Shoulder Care Routine",
    description: "Use a resistance band for a complete shoulder care routine: External Rotation — anchor the band at elbow height, hold with your throwing arm at 90/90, and slowly rotate your forearm away from your body. Internal Rotation — same setup, rotate inward. Sleeper Stretch — lie on your throwing side with arm at 90° and gently push forearm toward the ground. Cross-Body Stretch — bring your arm across your chest and hold. These build posterior shoulder flexibility and rotator cuff strength, which is the key to gaining healthy external rotation range. Do these daily — consistency matters more than intensity.",
    reps: "3 sets of 15 ER/IR band reps + 3x30s holds each stretch, daily",
    product: {
      name: GPS_PRODUCTS.resistanceBands.name,
      url: GPS_PRODUCTS.resistanceBands.url,
      campaign: "shoulder_mobility",
    },
  }],
  "mer.elbowFlexion": [{
    name: "Pivot Pick-Off Drill",
    description: "From the stretch, perform a pick-off move to first base (or a target at 90°). This forces your arm to get to a proper 90° elbow angle quickly. Focus on a short, compact arm path that arrives at the cocked position with a clean right angle at the elbow. This teaches efficient arm action without the forearm dropping below the elbow.",
    reps: "10-15 throws at 75%, focus on arm path",
  }, {
    name: "10-Toe Drill",
    description: "Start facing your target with both feet pointed at it (10 toes to the target). From this position, perform your arm action and throw. Because you're already facing the target, you can focus entirely on getting your arm into the right path — elbow at 90°, forearm up, clean spiral into the throw. This removes the lower body so you can isolate the arm action and feel what a proper 90° elbow looks like at MER.",
    reps: "10-15 throws at 70% effort, focus on clean arm path",
  }],
  "mer.shoulderAbduction": [{
    name: "Marshall Drill",
    description: "Stand with your throwing arm at your side. In one motion, bring the ball straight up past your ear and throw. This drill teaches a short, efficient arm path that naturally puts the elbow at shoulder height. The key: the ball goes UP first, not back. This prevents the arm from dropping below the shoulder during the arm spiral and trains the correct elbow height through MER. If your elbow drops below your shoulder, the arm has to climb over the top to get to release — this drill fixes that.",
    reps: "10-15 throws at 70% effort, focus on ball going UP past the ear",
  }, {
    name: "Band Pull-Aparts + 90/90 Arm Raises",
    description: "Band Pull-Aparts: Hold a resistance band at shoulder height with arms straight out. Pull the band apart by squeezing your shoulder blades together. This strengthens the scapular stabilizers that hold your elbow at shoulder height during MER. 90/90 Arm Raises: Stand with your arm in the 90/90 position (elbow at shoulder height, forearm vertical). Slowly raise and lower your elbow while keeping the 90° bend, focusing on controlling shoulder abduction.",
    reps: "3 sets of 15 band pull-aparts, 3 sets of 10 arm raises each side, daily",
    product: {
      name: GPS_PRODUCTS.resistanceBands.name,
      url: GPS_PRODUCTS.resistanceBands.url,
      campaign: "elbow_height",
    },
  }],
  "mer.leadLegBrace": [{
    name: "Front Leg Brace Wall Drill",
    description: "Stand in your stride position with your front foot against a wall. Simulate your delivery, driving your front hip into the wall while bracing your front knee. Feel the energy redirect upward. Your front leg should straighten (not collapse) as you rotate.",
    reps: "3 sets of 10 with focus on leg firmness",
  }],
  // RELEASE drills
  "release.trunkForwardFlexion": [{
    name: "Crow Hop Throws",
    description: "From flat ground, take a crow hop and throw with maximum intent. The crow hop forces your body into aggressive forward trunk flexion naturally — your chest drives over your front knee at release. Focus on getting your chest past your lead leg. This builds the motor pattern for 35-45° of trunk tilt at release, which is one of the top velocity predictors per ASMI research.",
    reps: "15-20 throws at 80-100% intent, flat ground",
  }, {
    name: "Roll-In Throws for Trunk Flexion",
    description: "Start 8-10 feet behind the rubber. Roll forward into your delivery with momentum, and focus on getting your chest over your front knee at release. The roll-in builds natural forward momentum that drives your trunk into flexion without you having to force it. Your chest should finish past your front leg, not stalling upright.",
    reps: "10-15 throws from flat ground, focus on chest over front knee",
  }],
  "release.leadLegExtension": [{
    name: "Brace and Rotate Drill",
    description: "From your stride position, plant your front foot and immediately straighten your front leg while rotating your trunk. The cue: 'post up and throw through.' Your front leg should be near-full extension (160°+) at ball release. This converts forward momentum into rotational velocity — it's where the real velocity comes from.",
    reps: "10 throws from flat ground, exaggerate the brace",
  }],
  "release.elbowExtension": [{
    name: "Pull-Down Throws",
    description: "From a running start on flat ground, throw a soft-shell weighted ball (5 oz) into a padded wall at max effort. The running momentum forces full arm extension through release — your elbow should reach 160-175° at the release point. If you're short-arming (elbow too bent at release), you're leaving velocity on the table and adding stress to your shoulder. Pull-downs build extension and intent.",
    reps: "2 sets of 8 throws, max intent into a padded wall",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "arm_extension",
    },
  }],
  "release.leadLegBraceTotal": [{
    name: "Front Leg Block Drill",
    description: "From your stride position, plant your front foot and focus on driving your front knee BACK toward second base as you rotate your hips. The cue is 'knee goes back, chest comes forward.' Your plant leg should be extending through ball release — not collapsing or staying bent. This converts forward momentum into rotational velocity. Pair with crow hops for max intent.",
    reps: "10-15 throws from flat ground, focus on knee driving back",
  }],
  // DECELERATION drills
  "deceleration.followThroughLength": [{
    name: "Weighted Ball Reverse Throws",
    description: "Using a 32 oz weighted ball, stand facing away from your target. Perform a reverse throw — rotating your trunk and letting the ball go behind you over your head. This builds eccentric strength in the posterior shoulder muscles (the decelerators) that are responsible for slowing your arm down after release. The heavy weight forces your body to absorb and redirect force through a full range of motion, training the exact muscles that protect your arm during follow-through.",
    reps: "2 sets of 8-10 reverse throws with a 32 oz ball",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "deceleration_reverse",
    },
  }],
  "deceleration.bodyBalance": [{
    name: "Weighted Ball Holds",
    description: "Using a 14 oz weighted ball, go through your full delivery but DO NOT let go of the ball. Hold onto it through your entire follow-through. This forces your arm to decelerate under load while you maintain body control and balance. You'll feel your posterior shoulder and scapular muscles working hard to slow the arm down — that's exactly what we want. The hold teaches your body to finish balanced and in control while building the deceleration strength that protects your arm over a full season.",
    reps: "2 sets of 10 reps with a 14 oz ball, full delivery without releasing",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "deceleration_holds",
    },
  }],
  "deceleration.armDecelerationPath": [{
    name: "Weighted Ball Reverse Throws + Holds Combo",
    description: "Alternate between reverse throws (32 oz) and hold throws (14 oz). Start with 8 reverse throws to activate the decelerators, then immediately do 8 holds to reinforce the pattern under a full delivery motion. The reverse throws build raw eccentric strength, and the holds apply that strength to your actual pitching motion. This combo is the best way to build a healthy, durable arm that can handle high-intent throwing.",
    reps: "8 reverse throws (32 oz) + 8 holds (14 oz), 2 rounds",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "deceleration_combo",
    },
  }],
  // ARM POSITION AT SFC drills
  "footStrike.shoulderAbductionAtFS": [{
    name: "T-Position Arm Path Drill",
    description: "From the T-position (both arms out at shoulder height, elbows at 90°), rock forward into your stride. Your throwing arm should be at 90° abduction — elbow at shoulder height — when your front foot hits. This drill gives you the feel of proper arm height at foot strike. If your elbow drops below your shoulder at SFC, it puts extra stress on your arm and limits velocity.",
    reps: "10-15 throws from the T-position at 75% effort",
  }, {
    name: "Pivot Pick-Offs for Arm Height",
    description: "From the stretch, perform pick-off moves focusing on getting your elbow to shoulder height immediately. The quick pick-off action trains a compact arm path that arrives with the elbow at the right height. Alternate between pick-off moves and regular throws to transfer the arm path feel to your full delivery.",
    reps: "8 pick-offs, then 8 regular throws, 2 rounds at 75%",
  }],
  "footStrike.shoulderERAtFS": [{
    name: "Lasso / Figure 8 Drill",
    description: "With a soft-shell weighted ball (7 oz), make a circular 'lasso' motion with your throwing arm — the ball goes up, back, and around in a smooth figure-8 pattern, then you throw. This drill teaches the arm to spiral naturally into the cocked position rather than stopping and starting. The circular path builds the feel of the forearm laying back (external rotation) as a natural part of the arm's arc, not as a forced position. This is the arm spiral pattern you want at foot strike.",
    reps: "10-15 throws at 70% effort, focus on smooth circular arm path",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "arm_spiral",
    },
  }, {
    name: "Cocked Position Awareness Drill",
    description: "In slow motion, go through your delivery and freeze at foot strike. Check your arm: your forearm should be laying back (externally rotated ~35°) with your elbow at shoulder height. If your arm is still down or straight up, you have late arm timing. Practice getting your arm to this cocked position by the time your front foot lands. Mirror work is great for building this awareness.",
    reps: "10 slow-motion reps to foot strike, check arm position each time",
  }],
  // SEQUENCING / ROTATION drills
  "mer.leadLegBraceDelta": [{
    name: "Knee-Back Block Drill",
    description: "From your stride position, plant your front foot and actively drive your front knee BACK toward second base as you rotate. The focus is on the knee moving backward during hip rotation — this is what creates the firm front side. Think of your front leg as a wall that your body rotates around. The more your knee drives back (extends), the more energy transfers to the ball.",
    reps: "10-15 throws, exaggerate the knee driving back",
  }],
  "mer.trunkRotationSequencing": [{
    name: "Hip-Lead Separation Drill",
    description: "Start in your stride position with a resistance band around your hips attached behind you. Stride forward and let the band pull your hips open first while you actively resist with your shoulders, keeping your chest closed. Feel the separation — hips open, shoulders closed. This trains the hip-shoulder dissociation that creates the kinetic chain: pelvis rotates first, then trunk follows. The pelvis MUST fire before the shoulders.",
    reps: "3 sets of 8 reps with the band, then 10 throws applying the feel",
    product: {
      name: GPS_PRODUCTS.resistanceBands.name,
      url: GPS_PRODUCTS.resistanceBands.url,
      campaign: "rotation_sequencing",
    },
  }, {
    name: "Split Stance Soft-Shell Weighted Ball Separation Drill",
    description: "Start in a wide split stance with feet already planted. Using a soft-shell weighted ball (1-2 lbs), focus ONLY on rotating your hips first, then letting your trunk follow. The split stance removes the stride so you can isolate the rotational sequence. Feel the stretch between your hips and shoulders — your hips should be fully open before your chest starts to rotate. This is the #1 drill for learning to feel hip-shoulder dissociation.",
    reps: "3 sets of 8 throws at 75% effort, focus on hips firing first",
    product: {
      name: GPS_PRODUCTS.weightedBalls.name,
      url: GPS_PRODUCTS.weightedBalls.url,
      campaign: "rotation_sequencing",
    },
  }],
  // GLOVE SIDE drills
  "footStrike.glovePosition": [{
    name: "Glove Side Block Drill",
    description: "From the rocker position, focus on your glove during the throw. As you stride and rotate, pull your glove INTO your chest — don't let it fly open to the side. The glove arm should tuck tight against your lead shoulder/chest as you rotate. When the glove flies open, it pulls your front shoulder open early, which kills hip-shoulder separation and pulls your throwing arm out of the spiral. Think 'glove to chest' — not 'glove to the sky.' Film from the front and check.",
    reps: "10-15 throws from rocker position, focus on glove tucking to chest",
  }],
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
  const usedDrillNames = new Set<string>();

  for (const m of needsWork) {
    const drillOptions = DRILL_MAP[m.metricKey];
    if (!drillOptions || drillOptions.length === 0) continue;

    // Pick the first drill we haven't already prescribed
    const drill = drillOptions.find((d) => !usedDrillNames.has(d.name)) ?? drillOptions[0];
    if (usedDrillNames.has(drill.name)) continue; // all options already used
    usedDrillNames.add(drill.name);

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
