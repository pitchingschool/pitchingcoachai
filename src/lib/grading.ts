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
  // === STRIDE METRICS (20% of overall) ===
  {
    key: "drift.hipLeadDistance",
    label: "Hip Lead",
    phase: "drift",
    unit: "",
    weight: 3,
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
    weight: 2.5,
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
      C: "Your back leg is extending too early — you're pushing off instead of holding tension. You want to stay loaded into the ground and let the energy transfer forward, not push yourself off the rubber.",
      D: "Your back leg is collapsing or extending way too early. You need to hold tension into the ground through your stride. Think about pressing INTO the rubber, not pushing OFF it.",
      F: "Back leg is not creating any ground force. You need to learn to hold tension into the rubber through your leg drive.",
    },
  },
  // === FOOT STRIKE METRICS (Stride Length 20% + H-S Sep 20% + Arm at SFC 15%) ===
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
    weight: 4, // Highest weight — #1 velocity predictor (20% of score)
    thresholds: {
      "12u": { lo: 25, hi: 50 },
      "14u": { lo: 30, hi: 55 },
      hs: { lo: 35, hi: 60 },
      college: { lo: 40, hi: 60 },
      pro: { lo: 40, hi: 65 },
    },
    explanation: {
      "A+": "Elite hip-shoulder separation. Your hips are fully open while your shoulders stay closed — this creates the 'rubber band' effect that generates elite velocity.",
      A: "Excellent separation. Your hips are opening before your shoulders, creating a powerful stretch-shortening cycle.",
      B: "Good separation but more would help. Focus on leading with your hips while keeping your shoulders closed and pointed toward home longer.",
      C: "You're flying open — your shoulders are rotating with your hips instead of staying closed. At foot strike, your shoulders should still be pointed toward home plate while your hips are open.",
      D: "Minimal separation — you're flying open. Your hips and shoulders are rotating as one unit. You need to keep your chest closed toward third base (RHP) or first base (LHP) while your hips open to the plate.",
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
    label: "Arm Timing at Foot Strike",
    phase: "footStrike",
    unit: "°",
    weight: 3, // 15% of score — arm position at SFC is critical
    thresholds: {
      "12u": { lo: 0, hi: 30 },
      "14u": { lo: 0, hi: 25 },
      hs: { lo: 0, hi: 20 },
      college: { lo: 0, hi: 18 },
      pro: { lo: 0, hi: 15 },
    },
    explanation: {
      "A+": "Perfect arm timing — your arm is up and cocked at foot strike, fully loaded and ready to accelerate. This is elite sequencing.",
      A: "Great arm timing. Your forearm is near-vertical at foot strike — you're 'on time' and ready to throw.",
      B: "Slightly off on timing but still functional. A small adjustment to your arm path will tighten this up.",
      C: "Your arm is late getting to the cocked position at foot strike. The arm needs to be UP when the foot hits — this forces the arm to rush through acceleration.",
      D: "Late arm — your forearm is well below vertical at foot strike. Your arm is not up when your foot lands, which means it has to rush to catch up. This is the #1 timing issue we see.",
      F: "Severely late arm timing. Your arm is way behind when your foot strikes. This needs immediate attention — the arm must be cocked and ready when the front foot hits.",
    },
  },
  {
    key: "footStrike.shoulderAbductionAtFS",
    label: "Shoulder Abduction at SFC",
    phase: "footStrike",
    unit: "°",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 70, hi: 110 },
      "14u": { lo: 75, hi: 105 },
      hs: { lo: 80, hi: 100 },
      college: { lo: 80, hi: 100 },
      pro: { lo: 85, hi: 95 },
    },
    explanation: {
      "A+": "Perfect arm height at foot strike — elbow right at shoulder level with ~90° abduction. Textbook position.",
      A: "Great shoulder abduction at SFC. Your arm is in position and ready to accelerate.",
      B: "Arm height is slightly off at foot strike. Getting the elbow to shoulder level will improve your efficiency.",
      C: "Your arm is either too high or too low at foot strike. Aim for 90° abduction — elbow at shoulder height.",
      D: "Poor arm height at foot strike. Your elbow needs to be at shoulder level when your front foot lands.",
      F: "Arm position at foot strike is well outside the safe range. Focus on getting your elbow to shoulder height.",
    },
  },
  {
    key: "footStrike.shoulderERAtFS",
    label: "Shoulder External Rotation at SFC",
    phase: "footStrike",
    unit: "°",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 20, hi: 60 },
      "14u": { lo: 25, hi: 55 },
      hs: { lo: 30, hi: 55 },
      college: { lo: 30, hi: 50 },
      pro: { lo: 35, hi: 50 },
    },
    explanation: {
      "A+": "Perfect external rotation at foot strike — arm is cocked back ~35° and ready to accelerate through MER.",
      A: "Great ER at SFC. Your arm is properly cocked and on time.",
      B: "Decent arm cocking at foot strike. A bit more external rotation would set you up better for MER.",
      C: "Your arm isn't cocked enough at foot strike — this is 'late arm.' The forearm should be laying back when the foot lands.",
      D: "Significant late arm — very little external rotation when your foot strikes. Your arm is behind your body's rotation.",
      F: "Almost no external rotation at foot strike. Your arm is severely late and has to rush to catch up.",
    },
  },
  // === MER METRICS (Sequencing 15%) ===
  {
    key: "mer.shoulderExternalRotation",
    label: "Shoulder External Rotation",
    phase: "mer",
    unit: "°",
    weight: 2,
    thresholds: {
      "12u": { lo: 140, hi: 170 },
      "14u": { lo: 140, hi: 175 },
      hs: { lo: 140, hi: 180 },
      college: { lo: 140, hi: 180 },
      pro: { lo: 140, hi: 180 },
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
    weight: 1.5,
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
    weight: 1.5,
    thresholds: {
      "12u": { lo: 70, hi: 105 },
      "14u": { lo: 75, hi: 105 },
      hs: { lo: 80, hi: 100 },
      college: { lo: 80, hi: 100 },
      pro: { lo: 80, hi: 100 },
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
    label: "Lead Leg Brace at MER",
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
      "A+": "Elite front leg brace. Your plant leg knee is driving back toward second base as you rotate — this is how you convert momentum into velocity.",
      A: "Strong lead leg brace. Your front leg is firming up and redirecting energy into rotation.",
      B: "Good brace but could be firmer. Focus on your plant leg knee moving BACK toward second base as you rotate your hips.",
      C: "Your front leg is collapsing — energy is leaking into the ground instead of going to the ball. Your plant knee should be pushing back, not bending forward.",
      D: "Weak brace. Your lead leg is absorbing energy instead of blocking and redirecting it. Think about driving your front knee back toward second base.",
      F: "No real brace happening. Your front leg is absorbing energy instead of redirecting it.",
    },
  },
  {
    key: "mer.leadLegBraceDelta",
    label: "Lead Leg Brace Progression",
    phase: "mer",
    unit: "°",
    weight: 2, // Part of Lead Leg Brace 10%
    higherIsBetter: true,
    thresholds: {
      "12u": { lo: 5, hi: 40 },
      "14u": { lo: 8, hi: 45 },
      hs: { lo: 10, hi: 50 },
      college: { lo: 12, hi: 50 },
      pro: { lo: 15, hi: 55 },
    },
    explanation: {
      "A+": "Elite leg brace progression — your lead knee is extending aggressively from foot strike to MER. The plant leg is blocking hard and driving back toward second base.",
      A: "Great brace progression. Your front leg is actively stiffening through the acceleration phase.",
      B: "Decent brace development but there's more extension to gain. Focus on actively driving your plant knee back.",
      C: "Your front leg isn't extending enough from foot strike to MER. The knee should be straightening as you rotate, not staying bent.",
      D: "Minimal brace development — your front leg is staying bent through MER. You need to actively push your plant knee back toward 2B.",
      F: "No brace progression. Your front leg is collapsing instead of extending.",
    },
  },
  {
    key: "mer.trunkRotationSequencing",
    label: "Rotation Sequencing",
    phase: "mer",
    unit: "frames",
    weight: 3, // 15% — trunk rotation sequencing is a key velocity factor
    higherIsBetter: true,
    thresholds: {
      "12u": { lo: 1, hi: 8 },
      "14u": { lo: 1, hi: 8 },
      hs: { lo: 2, hi: 10 },
      college: { lo: 2, hi: 10 },
      pro: { lo: 2, hi: 12 },
    },
    explanation: {
      "A+": "Elite rotation sequencing — your pelvis reaches peak velocity well before your trunk. This is hip-shoulder dissociation at its best. Your hips lead and your shoulders follow.",
      A: "Great sequencing. Your hips are firing before your shoulders, creating a strong kinetic chain.",
      B: "Good sequencing but there's room to increase the gap. Focus on letting your hips rotate first — shoulders should lag behind.",
      C: "Your pelvis and trunk are rotating too close together. The hips should rotate before the shoulders — that's hip-shoulder dissociation. Right now they're firing almost simultaneously.",
      D: "Poor sequencing — your shoulders are rotating with or before your hips. The pelvis MUST rotate first to create the stretch-shortening cycle. This is costing you significant velocity.",
      F: "Reverse sequencing — your shoulders are leading your hips. This must change immediately.",
    },
  },
  // === RELEASE METRICS (10%) ===
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
      "A+": "Full front leg brace at release — this is where velocity comes from. Your plant knee drove all the way back and you're catapulting the ball with rotational energy.",
      A: "Great lead leg extension. You're bracing hard and transferring energy efficiently.",
      B: "Good but a firmer brace would add measurable velocity. Focus on 'posting up' against a firm front side.",
      C: "Your front leg is bending too much at release. Energy is leaking. Your plant knee needs to drive back toward second base harder.",
      D: "Significant front leg collapse. This is directly costing you 3-5 mph based on Driveline data.",
      F: "No front leg brace. All the momentum you built is being absorbed into the ground.",
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
      "A+": "Elite total brace — your lead leg extended massively from foot strike to release. The plant knee drove all the way back toward 2B. Maximum energy transfer.",
      A: "Great total brace development. Your front leg is doing its job converting momentum into ball speed.",
      B: "Good total brace but more extension would add velocity. Focus on driving your plant knee back aggressively.",
      C: "Your front leg isn't extending enough through the delivery. From foot strike to release, you should see significant knee straightening.",
      D: "Minimal total brace. Your front leg is staying bent through the entire delivery — this is a major energy leak.",
      F: "No meaningful brace. Your lead leg is absorbing all the momentum you generated.",
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
  // === DECELERATION METRICS (10%) ===
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
      "A+": "Great follow-through — your arm is decelerating over a long arc, spreading out the braking forces across more time and distance.",
      A: "Good follow-through length. You're giving your arm enough room to slow down safely.",
      B: "Decent follow-through but extending it would reduce stress on your arm.",
      C: "Your follow-through is short — you're 'pulling the parachute' too early. Let your arm finish its natural path.",
      D: "Abbreviated follow-through. Your arm is stopping abruptly after release, which concentrates deceleration forces.",
      F: "Almost no follow-through. Your arm is slamming on the brakes right after release.",
    },
  },
  {
    key: "deceleration.bodyBalance",
    label: "Finish Balance",
    phase: "deceleration",
    unit: "",
    weight: 1.5,
    thresholds: {
      "12u": { lo: 0, hi: 0.20 },
      "14u": { lo: 0, hi: 0.18 },
      hs: { lo: 0, hi: 0.15 },
      college: { lo: 0, hi: 0.12 },
      pro: { lo: 0, hi: 0.10 },
    },
    explanation: {
      "A+": "Perfectly balanced finish — you're in a fielding-ready position. This shows great body control through the delivery.",
      A: "Good finish balance. You're under control and ready to field your position.",
      B: "Slightly off balance at the finish. A more controlled follow-through will help.",
      C: "You're falling off to one side after release. This wastes energy and puts you in a bad fielding position.",
      D: "Significant balance issues at the finish — you're falling off the mound. This often indicates an earlier sequencing problem.",
      F: "Very poor finish balance. You're completely out of control after release.",
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
      "A+": "Very smooth deceleration — your arm is slowing down gradually and naturally. This is the healthiest way to finish.",
      A: "Good deceleration pattern. Your arm is decelerating smoothly after release.",
      B: "Decent deceleration but there are some jerky speed changes. A longer, smoother arc will help.",
      C: "Choppy deceleration — your arm speed is fluctuating after release instead of decreasing smoothly.",
      D: "Poor deceleration pattern. Your arm is recoiling or stopping abruptly. This concentrates stress on the posterior shoulder.",
      F: "Very erratic deceleration. Your arm path after release needs significant work.",
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
  const phases: PhaseName[] = ["legLift", "drift", "footStrike", "mer", "release", "deceleration"];
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
  // Scoring model weights: Stride 20%, H-S Sep 20%, Arm at SFC 15%, Sequencing 15%, Lead Leg Brace 10%, Release 10%, Decel 10%
  // These map to phases: drift=20%, footStrike=35% (stride+HS+arm), mer=25% (sequencing+brace), release=10%, decel=10%
  const phaseWeights: Record<PhaseName, number> = { legLift: 0.5, drift: 2, footStrike: 3.5, mer: 2.5, release: 1, deceleration: 1 };
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
