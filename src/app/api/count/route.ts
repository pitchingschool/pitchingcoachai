import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Cache the count for 5 minutes to avoid hammering Supabase
let cachedCount: number | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const SEED_COUNT = 0; // real count only

export async function GET() {
  try {
    const now = Date.now();
    if (cachedCount !== null && now - cacheTime < CACHE_TTL) {
      return NextResponse.json({ count: cachedCount });
    }

    const sbUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sqzuolsexkmohmdopwrv.supabase.co";
    const sbKey = process.env.SUPABASE_SERVICE_KEY;

    if (!sbKey) {
      return NextResponse.json({ count: SEED_COUNT });
    }

    const res = await fetch(
      `${sbUrl}/rest/v1/analyses?select=id&limit=1`,
      {
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          Prefer: "count=exact",
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ count: cachedCount || SEED_COUNT });
    }

    const contentRange = res.headers.get("content-range");
    // Format: "0-0/123" or "*/123"
    const total = contentRange ? parseInt(contentRange.split("/").pop() || "0") : 0;

    cachedCount = SEED_COUNT + total;
    cacheTime = now;

    return NextResponse.json({ count: cachedCount });
  } catch {
    return NextResponse.json({ count: cachedCount || SEED_COUNT });
  }
}
