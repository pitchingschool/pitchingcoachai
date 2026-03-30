/**
 * PitchingCoachAI — Email Templates
 *
 * All HTML email templates for the drip sequence.
 * Each email is designed to provide value and drive engagement
 * back to pitchingcoachai.com or booking a lesson.
 */

const HEADER = `
<div style="text-align: center; margin-bottom: 24px;">
  <span style="font-size: 20px; font-weight: 800; color: #fff;">PitchingCoach</span><span style="font-size: 20px; font-weight: 800; color: #dc2626;">AI</span>
</div>`;

const FOOTER = `
<hr style="border: none; border-top: 1px solid #222; margin: 24px 0;" />
<p style="font-size: 12px; color: #666;">Mike Grady — Grady's Pitching School<br/>North Canton, OH<br/>20 years coaching experience<br/><a href="mailto:mike@gradyspitchingschool.com" style="color: #888;">mike@gradyspitchingschool.com</a></p>
<p style="font-size: 11px; color: #444; margin-top: 16px;">P.S. Share <a href="https://pitchingcoachai.com" style="color: #666;">pitchingcoachai.com</a> with your coach or a teammate — it's free for everyone.</p>`;

const WRAPPER_START = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #e0e0e0; background: #0f0f0f; padding: 32px; border-radius: 16px;">`;
const WRAPPER_END = `</div>`;

const CTA_BUTTON = (text: string, url: string) => `
<div style="text-align: center; margin: 24px 0;">
  <a href="${url}" style="display: inline-block; background: #dc2626; color: #fff; font-weight: 700; font-size: 14px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">${text}</a>
</div>`;

const TIP_BOX = (title: string, content: string) => `
<div style="background: #1a1a1a; border-left: 3px solid #dc2626; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
  <p style="font-size: 13px; font-weight: 700; color: #fff; margin: 0 0 8px 0;">${title}</p>
  <p style="font-size: 13px; line-height: 1.6; margin: 0; color: #ccc;">${content}</p>
</div>`;

// ============================================================
// EMAIL 1: Welcome (sent immediately after first analysis)
// Already implemented in lead/route.ts — this is the template reference
// ============================================================

// ============================================================
// EMAIL 2: "The #1 Thing" — sent 2 days after signup
// Focus: Hip-shoulder separation education + re-analysis CTA
// ============================================================
export function email2_theOneThing(firstName: string): { subject: string; html: string } {
  return {
    subject: `${firstName}, the #1 thing that separates 70mph from 85+`,
    html: `${WRAPPER_START}${HEADER}
<p style="font-size: 16px; color: #fff;">Hey ${firstName},</p>

<p style="font-size: 14px; line-height: 1.7;">I've been coaching pitchers for 20 years. You want to know the single biggest difference between a kid throwing 70 and a kid throwing 85?</p>

<p style="font-size: 14px; line-height: 1.7;"><strong style="color: #fff;">Hip-shoulder separation.</strong></p>

<p style="font-size: 14px; line-height: 1.7;">It's not arm speed. It's not how hard you try. It's the timing between when your hips open and when your shoulders open. Elite pitchers have 40-60° of separation at foot strike. Average pitchers have 15-25°.</p>

${TIP_BOX("Quick Test", "Record yourself from the front during your next bullpen. At the moment your front foot hits the ground, your belt buckle should be pointing at the catcher but your chest should still be facing third base (for righties). If your chest and hips open together, that's where your velocity ceiling is.")}

<p style="font-size: 14px; line-height: 1.7;">PitchingCoachAI measures this automatically. Upload a new video after your next bullpen and check your hip-shoulder separation score.</p>

${CTA_BUTTON("Run a New Analysis", "https://pitchingcoachai.com/analyze")}

<p style="font-size: 14px; line-height: 1.7;">If your report flagged separation as a weak area, I can show you exactly how to fix it in a lesson. It's usually a 2-3 week fix with the right drills.</p>

<p style="font-size: 14px; line-height: 1.7;">— Coach Grady</p>

${FOOTER}${WRAPPER_END}`,
  };
}

// ============================================================
// EMAIL 3: "The Arm Care Email" — sent 5 days after signup
// Focus: Arm timing / late arm education + injury prevention
// ============================================================
export function email3_armCare(firstName: string): { subject: string; html: string } {
  return {
    subject: `${firstName}, is your arm timing putting you at risk?`,
    html: `${WRAPPER_START}${HEADER}
<p style="font-size: 16px; color: #fff;">Hey ${firstName},</p>

<p style="font-size: 14px; line-height: 1.7;">Let's talk about the thing every pitching parent worries about: <strong style="color: #fff;">arm injuries.</strong></p>

<p style="font-size: 14px; line-height: 1.7;">ASMI research (the gold standard in pitching biomechanics) found that the #1 mechanical predictor of UCL injury is <strong style="color: #dc2626;">late arm timing at foot strike.</strong></p>

<p style="font-size: 14px; line-height: 1.7;">Here's what that means in plain English: when your front foot hits the ground, your throwing arm should already be up in the "cocked" position — forearm pointing to the sky, elbow at shoulder height. If your arm is still down or behind you at that point, your elbow has to catch up in a fraction of a second, and that's what shreds the UCL.</p>

${TIP_BOX("How to Check", "PitchingCoachAI measures this as 'Arm Timing' in your Foot Strike phase. A reading above 30° means your arm is late. Above 40° is a red flag. Upload a side-view video and look at your Foot Strike grade — if Arm Timing shows yellow or red, address it before you ramp up throwing intensity.")}

<p style="font-size: 14px; line-height: 1.7;">The fix is usually simple: Mirror work (5 minutes/day) + the T-Position Rocker drill. Your report will prescribe the exact drill if your arm timing needs work.</p>

${CTA_BUTTON("Check My Arm Timing", "https://pitchingcoachai.com/analyze")}

<p style="font-size: 14px; line-height: 1.7;">Arm health isn't something to guess about. If you want a professional assessment, I do virtual lessons where we review your video together and build a plan.</p>

${CTA_BUTTON("Book a Virtual Lesson", "https://gradyspitchingschool.com")}

<p style="font-size: 14px; line-height: 1.7;">Keep throwing,<br/>Coach Grady</p>

${FOOTER}${WRAPPER_END}`,
  };
}

// ============================================================
// EMAIL 4: "Track Your Progress" — sent 10 days after signup
// Focus: Re-engagement + progress tracking feature
// ============================================================
export function email4_trackProgress(firstName: string): { subject: string; html: string } {
  return {
    subject: `${firstName}, are you improving? Here's how to find out`,
    html: `${WRAPPER_START}${HEADER}
<p style="font-size: 16px; color: #fff;">Hey ${firstName},</p>

<p style="font-size: 14px; line-height: 1.7;">Quick question: have you been working on the drills from your report?</p>

<p style="font-size: 14px; line-height: 1.7;">If so, <strong style="color: #fff;">it's time to measure your progress.</strong></p>

<p style="font-size: 14px; line-height: 1.7;">PitchingCoachAI now tracks your analysis history. When you run a new analysis, it automatically compares your current scores to your previous ones and shows you exactly what improved and what still needs work.</p>

${TIP_BOX("Pro Tip", "Film yourself from the same angle and distance each time for the most accurate comparison. Side view, full body, same camera height. Think of it like a weigh-in — consistency matters.")}

<p style="font-size: 14px; line-height: 1.7;">After 7-10 days of focused drill work, you should see measurable improvement in your targeted metrics. Upload a new video and see where you stand.</p>

${CTA_BUTTON("Track My Progress", "https://pitchingcoachai.com/analyze")}

<p style="font-size: 14px; line-height: 1.7;">If you're not seeing improvement, that's actually useful information too — it usually means you need hands-on coaching to feel the right positions. That's what I'm here for.</p>

<p style="font-size: 14px; line-height: 1.7;">— Coach Grady</p>

${FOOTER}${WRAPPER_END}`,
  };
}

// ============================================================
// EMAIL 5: "The Lesson Pitch" — sent 14 days after signup
// Focus: Convert to lesson booking
// ============================================================
export function email5_lessonPitch(firstName: string): { subject: string; html: string } {
  return {
    subject: `${firstName}, ready for the next level?`,
    html: `${WRAPPER_START}${HEADER}
<p style="font-size: 16px; color: #fff;">Hey ${firstName},</p>

<p style="font-size: 14px; line-height: 1.7;">You've been using PitchingCoachAI — which means you care about getting better. That already puts you ahead of most pitchers.</p>

<p style="font-size: 14px; line-height: 1.7;">Here's what AI can do for you:</p>
<ul style="font-size: 14px; line-height: 1.8; color: #ccc; padding-left: 20px;">
  <li>Measure your angles and timing objectively</li>
  <li>Track changes over time</li>
  <li>Identify what to work on</li>
</ul>

<p style="font-size: 14px; line-height: 1.7;">Here's what AI <strong style="color: #fff;">can't</strong> do:</p>
<ul style="font-size: 14px; line-height: 1.8; color: #ccc; padding-left: 20px;">
  <li>Feel if your arm path is right</li>
  <li>See the subtle tempo issues that don't show up in angles</li>
  <li>Build a week-by-week development plan tailored to your body</li>
  <li>Make adjustments in real-time as you throw</li>
</ul>

<p style="font-size: 14px; line-height: 1.7;">That's what coaching is for. I've been doing this for 20 years with over 100 pitchers from 10U through college programs.</p>

${TIP_BOX("What a Lesson Looks Like", "30 minutes. We review your PitchingCoachAI report together, I watch you throw live (in-person or video call), and I give you 2-3 specific things to work on with a drill plan. No fluff, no generic advice. Just your mechanics, your fixes, your plan.")}

${CTA_BUTTON("Book a Lesson with Mike", "https://gradyspitchingschool.com")}

<p style="font-size: 14px; line-height: 1.7;">Or just reply to this email with any questions. I read every one.</p>

<p style="font-size: 14px; line-height: 1.7;">— Coach Grady<br/><span style="color: #888;">Grady's Pitching School | North Canton, OH</span></p>

${FOOTER}${WRAPPER_END}`,
  };
}
