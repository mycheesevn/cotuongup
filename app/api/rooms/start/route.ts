import { NextResponse } from "next/server";
import { callerUserId, serviceClient } from "@/lib/rooms/server";
import {
  ServerMatchError,
  startCorrMatch,
  startRoomMatch,
} from "@/lib/rooms/serverMatch";

/**
 * POST /api/rooms/start — server-authoritative match creation (ROOMS_SPEC §6).
 *
 * Dealing hidden pieces MUST happen server-side (the TS engine is the
 * single source of truth), so there is no start-match RPC: this route
 * deals `createGame(seed)` with a server-only random seed, stores the
 * secret in `cu_match_secrets`, publishes `commitmentForSeed(seed)` on
 * the public `cu_matches` row, and returns the masked state.
 *
 * Bodies:
 *   { roomId }                          next rotation match (leader only)
 *   { roomId, rematchOf }               rematch, colors swapped
 *   { roomId, tournamentId }            next tournament pairing (leader)
 *   { mode: "corr", opponentId }        correspondence game (caller = Red)
 */
export async function POST(req: Request) {
  const uid = await callerUserId(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    roomId?: string;
    rematchOf?: string;
    tournamentId?: string;
    mode?: string;
    opponentId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const db = serviceClient();
    if (body.mode === "corr") {
      if (!body.opponentId) {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
      }
      const { match, masked } = await startCorrMatch(db, {
        callerId: uid,
        opponentId: body.opponentId,
      });
      return NextResponse.json({ match, masked });
    }
    if (!body.roomId) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const { match, masked } = await startRoomMatch(db, {
      roomId: body.roomId,
      callerId: uid,
      rematchOf: body.rematchOf,
      tournamentId: body.tournamentId,
    });
    return NextResponse.json({ match, masked });
  } catch (e) {
    if (e instanceof ServerMatchError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "failed";
    const status = msg === "not_configured" ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
