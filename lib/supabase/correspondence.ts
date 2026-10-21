// Correspondence (async) games: one move whenever, push-notified.
//
// SERVER-AUTHORITATIVE (ROOMS_SPEC §0.3): a correspondence game is a
// `cu_matches` row with mode='corr' and room_id NULL — there is no
// separate corr table. Creation deals hidden pieces server-side via
// POST /api/rooms/start, moves go through POST /api/rooms/move, and the
// masked state comes from POST /api/rooms/state (see lib/supabase/rooms.ts:
// submitRoomMove / submitRoomAction / fetchMatchMasked). This module is
// the list/adapter layer over `cu_matches`.
import { getSupabase } from "./client";
import { submitRoomAction, type RoomMatch } from "./rooms";

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

export interface CorrGame {
  id: string;
  red_id: string;
  black_id: string;
  /** Comma-joined UCI moves with flip suffixes (see rooms.ts RoomMatch). */
  moves: string;
  status: "active" | "finished";
  result: "red" | "black" | "draw" | null;
  reason:
    | "checkmate"
    | "stalemate"
    | "draw-120"
    | "resign"
    | "draw-agreed"
    | null;
  winner_id: string | null;
  /** Public FEN of the current position (no hidden identities). */
  public_fen: string;
  commitment: string;
  revealed_layout: RoomMatch["revealed_layout"];
  revealed_seed: string | null;
  draw_offer_by: string | null;
  created_at: string;
  updated_at: string;
  opponent?: { full_name: string | null; username: string | null } | null;
}

export function toCorrGame(row: RoomMatch): CorrGame {
  return {
    id: row.id,
    red_id: row.red_id ?? "",
    black_id: row.black_id ?? "",
    moves: row.moves,
    status: row.status === "active" ? "active" : "finished",
    result: row.result,
    reason: (row.reason as CorrGame["reason"]) ?? null,
    winner_id: row.winner_id,
    public_fen: row.public_fen,
    commitment: row.commitment,
    revealed_layout: row.revealed_layout,
    revealed_seed: row.revealed_seed,
    draw_offer_by: row.draw_offer_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Create a correspondence game vs a friend; creator plays Red.
 *  The deal happens server-side (POST /api/rooms/start, mode 'corr'). */
export async function createCorrGame(friendId: string): Promise<CorrGame> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  if (friendId === uid) throw new Error("self");
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  const res = await fetch("/api/rooms/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "corr", opponentId: friendId }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    match?: RoomMatch;
    error?: string;
  };
  if (!res.ok || !json.match) {
    throw new Error(json.error ?? `http_${res.status}`);
  }
  return toCorrGame(json.match);
}

function withOpponent(g: CorrGame, me: string, profile: unknown): CorrGame {
  const oppId = g.red_id === me ? g.black_id : g.red_id;
  void oppId;
  return { ...g, opponent: (profile as CorrGame["opponent"]) ?? null };
}

/** My correspondence games, most recently active first, with opponent names. */
export async function fetchMyCorrGames(): Promise<CorrGame[]> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return [];
  const { data, error } = await sb
    .from("cu_matches")
    .select("*")
    .eq("mode", "corr")
    .or(`red_id.eq.${uid},black_id.eq.${uid}`)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  const games = (data as RoomMatch[]).map(toCorrGame);
  const oppIds = [...new Set(games.map((g) => (g.red_id === uid ? g.black_id : g.red_id)))];
  let profiles: Record<string, { full_name: string | null; username: string | null }> = {};
  if (oppIds.length) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name, username")
      .in("id", oppIds);
    for (const p of (profs as Array<{ id: string; full_name: string | null; username: string | null }>) || []) {
      profiles[p.id] = p;
    }
  }
  return games.map((g) =>
    withOpponent(g, uid, profiles[g.red_id === uid ? g.black_id : g.red_id] ?? null)
  );
}

/**
 * @deprecated Correspondence moves are server-authoritative now: use
 * `submitRoomMove` from lib/supabase/rooms.ts. The client must never
 * write the move list itself (the true state is a server secret).
 */
export async function saveCorrMoves(
  _gameId: string,
  _moves: string
): Promise<void> {
  void _gameId;
  void _moves;
  throw new Error("superseded_by_server_move_route");
}

/**
 * @deprecated Finishing is server-side: checkmate/stalemate/draw-120 are
 * finalized inside the move route when the final move is submitted, and
 * an agreed draw goes through the draw-offer actions. The only
 * client-initiated finish left is resigning, delegated here for legacy
 * call sites.
 */
export async function finishCorrGame(
  gameId: string,
  result: "red" | "black" | "draw",
  reason: "checkmate" | "stalemate" | "resign" | string,
  _winnerId: string | null
): Promise<void> {
  void result;
  void _winnerId;
  if (reason === "resign") {
    await submitRoomAction(gameId, "resign");
  }
  // checkmate/stalemate: nothing to do — the move route already finished
  // the game when the decisive move was submitted.
}

/** Realtime subscription for one game (moves + finish). Masked data only. */
export function subscribeCorrGame(
  gameId: string,
  onUpdate: (g: CorrGame) => void
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const ch = sb
    .channel(`cu-corr:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "cu_matches",
        filter: `id=eq.${gameId}`,
      },
      (payload) => onUpdate(toCorrGame(payload.new as RoomMatch))
    )
    .subscribe();
  return () => {
    try {
      sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  };
}
