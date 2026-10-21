import { NextResponse } from "next/server";
import { callerUserId, serviceClient } from "@/lib/rooms/server";
import {
  ServerMatchError,
  getMaskedForViewer,
} from "@/lib/rooms/serverMatch";

/**
 * POST /api/rooms/state { matchId } — authoritative masked state for
 * late joiners, reconnects and spectators (ROOMS_SPEC §6).
 *
 * The MaskedState is rebuilt server-side from the secret deal + public
 * move list, so a client never has to (and never can) reconstruct true
 * state locally. Visibility: room members always; signed-in viewers of
 * a PUBLIC room too; correspondence players only. Logged-out guests do
 * not use this route — they read the public `cu_matches` row via the
 * `cu_guest_room_detail` RPC + realtime and derive the masked view from
 * public data.
 *
 * Finished matches additionally return `revealed: { seed, layout }`
 * (already public on the match row) for the commitment-audit badge.
 */
export async function POST(req: Request) {
  const uid = await callerUserId(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { matchId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.matchId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    const db = serviceClient();
    const out = await getMaskedForViewer(db, {
      matchId: body.matchId,
      userId: uid,
    });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof ServerMatchError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg === "not_configured" ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
