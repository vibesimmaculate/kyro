import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env, hasCustodyKeys, hasSupabase } from "@/server/env";
import { scanAll } from "@/server/wallet/watcher";
import { broadcastApproved, confirmBroadcast } from "@/server/wallet/withdrawals";

/**
 * The chain driver.
 *
 * One endpoint, called on a schedule, that does the three things nobody's page
 * load should ever wait for: look for deposits, broadcast approved
 * withdrawals, and confirm the ones already sent.
 *
 * Guarded by a shared secret compared in constant time. It is not a user
 * endpoint and never appears in the interface.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const expected = env().KYRO_INTERNAL_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!hasCustodyKeys()) {
    return NextResponse.json(
      { error: "Custody keys are not configured. Run `pnpm keys:dev`." },
      { status: 503 },
    );
  }

  const started = Date.now();
  const deposits = await scanAll();
  const broadcast = await broadcastApproved();
  const confirmed = await confirmBroadcast();

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    deposits,
    withdrawals: { broadcast, confirmed },
  });
}
