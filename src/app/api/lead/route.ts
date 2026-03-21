import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, email, phone, age, source, overallScore, metrics } = body;

    if (!firstName || !email || !age) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Save analysis
    const { data: analysis, error: analysisErr } = await supabase
      .from("analyses")
      .insert({
        overall_score: overallScore,
        hip_shoulder_sep: metrics?.hipShoulderSep,
        lead_knee_fs: metrics?.leadKneeFS,
        shoulder_abduction: metrics?.shoulderAbduction,
        elbow_flexion: metrics?.elbowFlexion,
        trunk_tilt: metrics?.trunkTilt,
        arm_slot: metrics?.armSlot,
        lead_knee_extension: metrics?.leadKneeExtension,
      })
      .select("id")
      .single();

    if (analysisErr) console.error("[Lead API] Analysis insert error:", analysisErr);

    // 2. Save lead
    const { error: leadErr } = await supabase.from("leads").insert({
      first_name: firstName,
      email,
      phone: phone || null,
      age: parseInt(age),
      source: source || null,
      analysis_id: analysis?.id || null,
    });

    if (leadErr) console.error("[Lead API] Lead insert error:", leadErr);

    // 3. Send welcome email via Resend
    try {
      await resend.emails.send({
        from: "Mike Grady <mike@gradyspitchingschool.com>",
        to: email,
        subject: `Your PitchingCoachAI Mechanics Report is Ready, ${firstName}`,
        text: `Hey ${firstName},

Your mechanics report is ready — head back to PitchingCoachAI.com anytime to view it.

A few things I noticed from thousands of pitcher analyses:

The #1 thing that separates 70 mph pitchers from 85 mph pitchers isn't arm strength — it's hip-shoulder separation and lead leg bracing. If your report flagged either of those, that's where we start.

If you want to go deeper, I do virtual lessons for pitchers anywhere in the country. 30 minutes, your video, my feedback — no fluff.

Book here: https://pitchingcoachai.com

Or just reply to this email. I read every one.

— Mike Grady
Grady's Pitching School | North Canton, OH
330-418-9746

P.S. Share this link with your coach or a teammate: pitchingcoachai.com`,
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
