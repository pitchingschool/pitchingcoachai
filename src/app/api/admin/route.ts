import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// Force Node.js runtime (not Edge)
export const runtime = "nodejs";

const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sqzuolsexkmohmdopwrv.supabase.co";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 attempts per minute per IP (prevents brute force)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed } = rateLimit(ip, { maxRequests: 10, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
    }

    const { password } = await req.json();
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_KEY not configured" }, { status: 500 });
    }

    const res = await fetch(
      `${SB_URL}/rest/v1/leads?select=*,analyses(overall_score)&order=created_at.desc&limit=500`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Supabase ${res.status}: ${text}` }, { status: 500 });
    }

    const leads = await res.json();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

    const total = leads?.length || 0;
    const last7 = leads?.filter((l: any) => l.created_at >= sevenDaysAgo).length || 0;
    const last30 = leads?.filter((l: any) => l.created_at >= thirtyDaysAgo).length || 0;

    const scores = leads
      ?.map((l: any) => l.analyses?.overall_score)
      .filter((s: any): s is number => s != null);
    const avgScore =
      scores && scores.length > 0
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : null;

    const dailyCounts: { [date: string]: number } = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      dailyCounts[d.toISOString().slice(0, 10)] = 0;
    }
    leads?.forEach((l: any) => {
      const day = l.created_at?.slice(0, 10);
      if (day && dailyCounts[day] !== undefined) dailyCounts[day]++;
    });

    // Age distribution
    const ageDistribution: { [age: string]: number } = {};
    leads?.forEach((l: any) => {
      const age = l.age ? String(l.age) : "unknown";
      ageDistribution[age] = (ageDistribution[age] || 0) + 1;
    });

    // Source distribution
    const sourceDistribution: { [source: string]: number } = {};
    leads?.forEach((l: any) => {
      const source = l.source || "Direct";
      sourceDistribution[source] = (sourceDistribution[source] || 0) + 1;
    });

    // Drip stage stats
    const dripStats: { [stage: string]: number } = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0 };
    leads?.forEach((l: any) => {
      const stage = String(l.drip_stage ?? 0);
      dripStats[stage] = (dripStats[stage] || 0) + 1;
    });

    return NextResponse.json({
      leads: leads || [],
      stats: { total, last7, last30, avgScore, totalAnalyses: scores?.length || 0 },
      dailyCounts,
      ageDistribution,
      sourceDistribution,
      dripStats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
