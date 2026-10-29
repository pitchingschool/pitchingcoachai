/**
 * DEV ONLY: streams a clip from the local fixtures/ folder so the
 * /harness page can run it through the engine without a file dialog.
 * Returns 404 in production builds; fixtures/ is gitignored and never
 * deployed, so nothing here can leak.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const name = req.nextUrl.searchParams.get("name") || "";
  // Filename only: no separators, no traversal
  if (!name || name !== path.basename(name) || name.includes("..")) {
    return new NextResponse("Bad name", { status: 400 });
  }
  const fixturesDir = path.join(process.cwd(), "fixtures");
  // Serve the exact file, or a transcoded working copy when the
  // original codec (HEVC) cannot be decoded by this browser.
  const candidates = [name, name + ".h264.mp4"];
  for (const c of candidates) {
    try {
      const buf = await readFile(path.join(fixturesDir, c));
      const type = c.endsWith(".mp4") ? "video/mp4" : "video/quicktime";
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": type,
          "X-Served-File": c,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // try next candidate
    }
  }
  return new NextResponse("Fixture not found", { status: 404 });
}
