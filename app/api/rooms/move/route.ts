import { NextResponse } from "next/server";
import { callerUserId, serviceClient } from "@/lib/rooms/server";
import {
  ServerMatchError,
  actOnMatch,
  applyMoveAs,
  type MatchAction,
} from "@/lib/rooms/serverMatch";

/**
 * POST /api/rooms/move — server-authoritative move application (ROOMS_SPEC §6).
 *
 * Body (move):   { matchId, from: {x, y}, to: {x, y} }
 * Body (action): { matchId, action: "resign" | "draw_offer" |
 *                  "draw_accept" | "draw_decline" }
 *
 * The server loads the TRUE state from `cu_match_secrets` (rebuilt by
 * replaying the public move list over the secret deal), verifies the
 * caller is the side to move, validates the move with the core engine,
 * persists the new public FEN + move + secret FEN, and finalizes through
 * `cu_record_room_result` when the game ends (revealing the layout +
 * seed on the public row). The response carries only the MaskedState
 * and the public MoveRecord — hidden identities never leave the server
 * before they are flipped or captured.
 */
export async function POST(req: Request) {
  const uid = await callerUserId(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    matchId?: string;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
    action?: string;
  };
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
    if (body.action) {
      const action = body.action as MatchAction;
      if (
        action !== "resign" &&
        action !== "draw_offer" &&
        action !== "draw_accept" &&
        action !== "draw_decline"
      ) {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
      }
      const out = await actOnMatch(db, {
        matchId: body.matchId,
        userId: uid,
        action,
      });
      return NextResponse.json(out);
    }
    const { from, to } = body;
    if (
      !from ||
      !to ||
      ![from.x, from.y, to.x, to.y].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 9
      ) ||
      from.x > 8 ||
      to.x > 8
    ) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const out = await applyMoveAs(db, {
      matchId: body.matchId,
      userId: uid,
      move: { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y },
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
