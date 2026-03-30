import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  email2_theOneThing,
  email3_armCare,
  email4_trackProgress,
  email5_lessonPitch,
} from "@/lib/email-templates";

export const runtime = "nodejs";

const SUPABASE_URL = () =>
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://sqzuolsexkmohmdopwrv.supabase.co";
const SUPABASE_KEY = () => process.env.SUPABASE_SERVICE_KEY!;
const DRIP_SECRET = () => process.env.DRIP_CRON_SECRET || "default-drip-secret";

/**
 * Drip Email Endpoint
 *
 * Called by a cron job (e.g., Netlify scheduled function, or external cron).
 * Finds leads that are due for their next drip email and sends them.
 *
 * Drip schedule:
 *   Email 1: Welcome — sent immediately (handled by /api/lead)
 *   Email 2: "The #1 Thing" — 2 days after signup
 *   Email 3: "Arm Care" — 5 days after signup
 *   Email 4: "Track Progress" — 10 days after signup
 *   Email 5: "Lesson Pitch" — 14 days after signup
 *
 * Uses `drip_stage` column on leads table to track where each lead is.
 * 0 = welcome sent, 1 = email 2 sent, etc.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${DRIP_SECRET()}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const now = new Date();

    // Fetch leads that need drip emails
    // drip_stage: null/0 = ready for email 2, 1 = ready for email 3, etc.
    const res = await fetch(
      `${SUPABASE_URL()}/rest/v1/leads?select=id,first_name,email,created_at,drip_stage&drip_stage=lt.4&order=created_at.asc&limit=50`,
      {
        headers: {
          apikey: SUPABASE_KEY(),
          Authorization: `Bearer ${SUPABASE_KEY()}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[Drip] Supabase fetch error:", text);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const leads = await res.json();
    let sent = 0;
    let skipped = 0;

    for (const lead of leads) {
      const createdAt = new Date(lead.created_at);
      const daysSinceSignup = (now.getTime() - createdAt.getTime()) / 86_400_000;
      const stage = lead.drip_stage ?? 0;

      // Determine which email to send based on stage and timing
      let emailToSend: { subject: string; html: string } | null = null;
      let nextStage = stage;

      if (stage === 0 && daysSinceSignup >= 2) {
        emailToSend = email2_theOneThing(lead.first_name);
        nextStage = 1;
      } else if (stage === 1 && daysSinceSignup >= 5) {
        emailToSend = email3_armCare(lead.first_name);
        nextStage = 2;
      } else if (stage === 2 && daysSinceSignup >= 10) {
        emailToSend = email4_trackProgress(lead.first_name);
        nextStage = 3;
      } else if (stage === 3 && daysSinceSignup >= 14) {
        emailToSend = email5_lessonPitch(lead.first_name);
        nextStage = 4;
      }

      if (!emailToSend) {
        skipped++;
        continue;
      }

      try {
        await resend.emails.send({
          from: "Mike Grady <mike@gradyspitchingschool.com>",
          to: lead.email,
          subject: emailToSend.subject,
          html: emailToSend.html,
        });

        // Update drip_stage in Supabase
        await fetch(`${SUPABASE_URL()}/rest/v1/leads?id=eq.${lead.id}`, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY(),
            Authorization: `Bearer ${SUPABASE_KEY()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ drip_stage: nextStage }),
        });

        sent++;
      } catch (err) {
        console.error(`[Drip] Error sending to ${lead.email}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      processed: leads.length,
      sent,
      skipped,
    });
  } catch (err: any) {
    console.error("[Drip] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
