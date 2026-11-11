import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { rateLimit } from "@/lib/rate-limit";

// Force Node.js runtime (not Edge)
export const runtime = "nodejs";

const SUPABASE_URL = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sqzuolsexkmohmdopwrv.supabase.co";
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_KEY!;

async function supabaseInsert(table: string, data: any) {
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY(),
      Authorization: `Bearer ${SUPABASE_KEY()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Lead API] Supabase insert ${table} error:`, text);
    return null;
  }
  const rows = await res.json();
  return rows?.[0] || null;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 submissions per minute per IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again in a minute." }, { status: 429 });
    }

    const body = await req.json();
    const {
      firstName, email, phone, age, source, overallScore, metrics,
      throwingHand, declaredHand, level, appVersion,
      phaseFrames, phaseGrades, metricsFull, framingWarning,
      armTrackingWarning, handMismatch, detectedHand,
    } = body;

    // Email is the only hard requirement: the gate asks for one field.
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const safeName: string = typeof firstName === "string" && firstName.trim() ? firstName.trim() : "";

    // 1. Save analysis. Old flat columns keep being written for backward
    // compatibility; the new columns carry everything the coach needs to
    // review a report (see supabase/migrations/). If the database has not
    // had the migration applied yet, the full insert fails on the unknown
    // columns, so retry with the legacy shape: a lead must never be lost
    // to a schema lag.
    const legacyColumns = {
      overall_score: overallScore,
      hip_shoulder_sep: metrics?.footStrike?.hipShoulderSep ?? null,
      lead_knee_fs: metrics?.footStrike?.leadKneeAngle ?? null,
      shoulder_abduction: metrics?.mer?.shoulderAbduction ?? null,
      elbow_flexion: metrics?.mer?.elbowFlexion ?? null,
      trunk_tilt: metrics?.release?.trunkForwardFlexion ?? null,
      arm_slot: metrics?.release?.armSlot ?? null,
      lead_knee_extension: metrics?.release?.leadLegExtension ?? null,
    };
    const modelColumns = {
      // Measurement-model columns (first migration)
      throwing_hand: throwingHand === "left" || throwingHand === "right" ? throwingHand : null,
      declared_hand: declaredHand === "left" || declaredHand === "right" ? declaredHand : null,
      level: typeof level === "string" ? level : null,
      app_version: typeof appVersion === "string" ? appVersion : null,
      phase_frames: phaseFrames ?? null,
      phase_grades: phaseGrades ?? null,
      metrics_full: metricsFull ?? null,
      framing_warning: typeof framingWarning === "boolean" ? framingWarning : null,
    };
    const auditColumns = {
      // Audit-fix columns (second migration); tiered retry below keeps
      // every lead safe if that migration has not been applied yet.
      arm_tracking_warning: typeof armTrackingWarning === "boolean" ? armTrackingWarning : null,
      hand_mismatch: typeof handMismatch === "boolean" ? handMismatch : null,
      detected_hand: detectedHand === "left" || detectedHand === "right" ? detectedHand : null,
    };
    let analysis = await supabaseInsert("analyses", { ...legacyColumns, ...modelColumns, ...auditColumns });
    if (!analysis) {
      console.warn("[Lead API] Insert with audit columns failed (migration pending?), retrying without them");
      analysis = await supabaseInsert("analyses", { ...legacyColumns, ...modelColumns });
    }
    if (!analysis) {
      console.warn("[Lead API] Full analysis insert failed (migration pending?), retrying with legacy columns");
      analysis = await supabaseInsert("analyses", legacyColumns);
    }

    // 2. Save lead (drip_stage = 0 means welcome email sent, ready for drip sequence)
    await supabaseInsert("leads", {
      first_name: safeName || "Parent",
      email,
      phone: phone || null,
      age: age ? parseInt(age) : null,
      source: source || null,
      analysis_id: analysis?.id || null,
      drip_stage: 0,
    });

    // 2.5 Subscribe the lead to Klaviyo so the welcome flow can run.
    // Uses the public client subscription endpoint (public site key only,
    // no secret). Non-blocking: a Klaviyo hiccup must never cost a lead.
    try {
      const companyId = process.env.KLAVIYO_COMPANY_ID || "Tehvme";
      const listId = process.env.KLAVIYO_LIST_ID || "Sm586k"; // PitchingCoachAI App Leads
      const klaviyoRes = await fetch(
        `https://a.klaviyo.com/client/subscriptions/?company_id=${companyId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            revision: "2024-10-15",
          },
          body: JSON.stringify({
            data: {
              type: "subscription",
              attributes: {
                custom_source: "PitchingCoachAI analyzer",
                profile: {
                  data: {
                    type: "profile",
                    attributes: {
                      email,
                      ...(safeName ? { first_name: safeName } : {}),
                      properties: {
                        pcai_score: overallScore ?? null,
                        pcai_level: typeof level === "string" ? level : null,
                        pcai_app_version: typeof appVersion === "string" ? appVersion : null,
                        pcai_pitcher_age: age ? parseInt(age) : null,
                        pcai_last_analysis: new Date().toISOString(),
                      },
                    },
                  },
                },
              },
              relationships: {
                list: { data: { type: "list", id: listId } },
              },
            },
          }),
        }
      );
      if (!klaviyoRes.ok) {
        console.error("[Lead API] Klaviyo subscribe error:", klaviyoRes.status, await klaviyoRes.text());
      }
    } catch (klaviyoErr) {
      console.error("[Lead API] Klaviyo subscribe failed:", klaviyoErr);
    }

    // 3. Send welcome email via Resend
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const scoreText = overallScore != null ? ` (Score: ${Math.round(overallScore)}/100)` : "";

      await resend.emails.send({
        from: "Mike Grady <mike@gradyspitchingschool.com>",
        to: email,
        subject: safeName
          ? `${safeName}, your pitching mechanics report is ready${scoreText}`
          : `Your pitching mechanics report is ready${scoreText}`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #e0e0e0; background: #0f0f0f; padding: 32px; border-radius: 16px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <span style="font-size: 20px; font-weight: 800; color: #fff;">PitchingCoach</span><span style="font-size: 20px; font-weight: 800; color: #dc2626;">AI</span>
  </div>

  <p style="font-size: 16px; color: #fff;">Hey ${safeName || "there"},</p>

  <p style="font-size: 14px; line-height: 1.7;">Your mechanics report is ready. Head back to <a href="https://pitchingcoachai.com/analyze" style="color: #dc2626; text-decoration: underline;">PitchingCoachAI.com</a> anytime to run another analysis and track your progress over time.</p>

  ${overallScore != null ? `<div style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
    <div style="font-size: 36px; font-weight: 900; color: ${overallScore >= 90 ? '#22c55e' : overallScore >= 80 ? '#3b82f6' : '#eab308'};">${Math.round(overallScore)}</div>
    <div style="font-size: 12px; color: #888; margin-top: 4px;">Overall Score</div>
  </div>` : ""}

  <div style="background: #1a1a1a; border-left: 3px solid #dc2626; padding: 16px; border-radius: 0 8px 8px 0; margin: 20px 0;">
    <p style="font-size: 13px; font-weight: 700; color: #fff; margin: 0 0 8px 0;">Quick tip from Coach Grady:</p>
    <p style="font-size: 13px; line-height: 1.6; margin: 0;">The #1 thing that separates 70 mph pitchers from 85+ is hip-shoulder separation and lead leg bracing at release. If your report flagged either of those, that's exactly where I'd start in a lesson. Upload a new video after your next bullpen to track your progress.</p>
  </div>

  <p style="font-size: 14px; line-height: 1.7;">If you want expert eyes on your mechanics, I do in-person and virtual lessons for pitchers anywhere in the country. 30 minutes, your video, specific feedback, no fluff.</p>

  <div style="text-align: center; margin: 24px 0;">
    <a href="https://gradyspitchingschool.com" style="display: inline-block; background: #dc2626; color: #fff; font-weight: 700; font-size: 14px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">Book a Lesson with Mike</a>
  </div>

  <p style="font-size: 14px; line-height: 1.7;">Or just reply to this email. I read every one.</p>

  <hr style="border: none; border-top: 1px solid #222; margin: 24px 0;" />

  <p style="font-size: 12px; color: #666;">Mike Grady, Grady's Pitching School<br/>North Canton, OH<br/>20 years coaching experience<br/><a href="mailto:mike@gradyspitchingschool.com" style="color: #888;">mike@gradyspitchingschool.com</a></p>

  <p style="font-size: 11px; color: #444; margin-top: 16px;">P.S. Share <a href="https://pitchingcoachai.com" style="color: #666;">pitchingcoachai.com</a> with your coach or a teammate, it's free for everyone.</p>
</div>`,
      });
    } catch (emailErr) {
      console.error("[Lead API] Resend email error:", emailErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Lead API] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
