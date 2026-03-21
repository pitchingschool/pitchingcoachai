import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch leads with analysis data
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("*, analyses(*)")
      .order("created_at", { ascending: false })
      .limit(500);

    if (leadsErr) {
      return NextResponse.json({ error: leadsErr.message }, { status: 500 });
    }

    // Stats
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    const total = leads?.length || 0;
    const last7 = leads?.filter((l) => l.created_at >= sevenDaysAgo).length || 0;
    const last30 = leads?.filter((l) => l.created_at >= thirtyDaysAgo).length || 0;

    const scores = leads
      ?.map((l) => l.analyses?.overall_score)
      .filter((s): s is number => s != null);
    const avgScore = scores && scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

    // Daily counts for chart (last 30 days)
    const dailyCounts: { [date: string]: number } = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      dailyCounts[d.toISOString().slice(0, 10)] = 0;
    }
    leads?.forEach((l) => {
      const day = l.created_at?.slice(0, 10);
      if (day && dailyCounts[day] !== undefined) dailyCounts[day]++;
    });

    return NextResponse.json({
      leads: leads || [],
      stats: { total, last7, last30, avgScore, totalAnalyses: scores?.length || 0 },
      dailyCounts,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
