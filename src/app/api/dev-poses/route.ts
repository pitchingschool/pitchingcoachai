/**
 * DEV ONLY: saves a pose stream exported by the /harness page to
 * fixtures/poses/<clip>.json so scripts/coach-harness.mjs can replay it
 * offline. Returns 404 in production builds. fixtures/ is gitignored.
 */
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const body = await req.json();
  const name: string = body?.name || "";
  if (!name || name !== path.basename(name) || name.includes("..")) {
    return new NextResponse("Bad name", { status: 400 });
  }
  if (!body?.payload?.frames?.length) {
    return new NextResponse("No frames", { status: 400 });
  }
  const posesDir = path.join(process.cwd(), "fixtures", "poses");
  await mkdir(posesDir, { recursive: true });
  const file = path.join(posesDir, name + ".json");
  await writeFile(file, JSON.stringify(body.payload));
  return NextResponse.json({ ok: true, saved: `fixtures/poses/${name}.json`, frames: body.payload.frames.length });
}
