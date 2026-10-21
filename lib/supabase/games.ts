import { getSupabase } from "./client";
import {
  createGame,
  parseFen,
  toFen,
  toPublicFen,
  type Color,
  type JieqiState,
} from "@/lib/jieqi/core";

/**
 * Saved-game persistence — Agent E (shell & growth).
 *
 * NEW SHAPE (Jieqi port; was the Xiangqi board-based shape):
 * - The DB table is `cu_games` (Agent D, migration 001): columns
 *   id, user_id, player_color, ai_level, result, plies, moves,
 *   full_fen, public_fen, created_at (there are NO start_fen / start_turn /
 *   reason / time_control columns). Migration 012 adds `is_shared` +
 *   the `cu_fetch_shared_game` / `cu_set_game_shared` RPCs for share links.
 * - Writes go ONLY through the SECURITY DEFINER RPC
 *   `cu_record_game_result` (family rule: stats/Elo are server-side; the
 *   RPC inserts the cu_games row itself). The game's START state is
 *   persisted as FULL FEN (core `toFen`, hidden field included — local
 *   games only; room games live in cu_matches/cu_match_secrets) plus the
 *   public FEN for anything shareable.
 * - `decodeGame` returns `{ state: JieqiState, moves: string[] }`
 *   (was `{ moveCodes, startBoard, startTurn }` in the Xiangqi port).
 */

export interface SaveGameInput {
  /** UCI move codes, in play order. */
  moveCodes: string[];
  /** The state the game started from (the deal, or a setup position). */
  startState: JieqiState;
  /** From the player's perspective. */
  result: "win" | "loss" | "draw";
  level: number;
  playerColor: Color;
}

/** A `cu_games` row. */
export interface SavedGame {
  id: string;
  user_id: string | null;
  player_color: string;
  ai_level: number;
  result: string;
  plies: number;
  moves: string;
  full_fen: string;
  public_fen: string;
  /** Owner opted this game into public sharing (migration 012). */
  is_shared: boolean;
  created_at: string;
}

export interface SaveGameResult {
  error: string | null;
  /** XP granted by the server RPC (null on error / when not recorded). */
  xpGain: number | null;
}

/** Save a finished vs-computer game via the record RPC. */
export async function saveGame(input: SaveGameInput): Promise<SaveGameResult> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase not configured", xpGain: null };
  if (input.moveCodes.length === 0)
    return { error: "No moves to save", xpGain: null };
  const { data, error } = await sb.rpc("cu_record_game_result", {
    p_color: input.playerColor,
    p_level: input.level,
    p_result: input.result,
    p_plies: input.moveCodes.length,
    p_moves: input.moveCodes.join(","),
    p_full_fen: toFen(input.startState),
    p_public_fen: toPublicFen(input.startState),
  });
  if (error) return { error: error.message, xpGain: null };
  return { error: null, xpGain: typeof data === "number" ? data : null };
}

/**
 * Mark a saved game as publicly shareable, via the owner-only DEFINER
 * RPC `cu_set_game_shared(p_id, p_shared)` (migration 012). Returns
 * true when the caller owns the game and the flag was updated.
 */
export async function markGameShared(gameId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.rpc("cu_set_game_shared", {
    p_id: gameId,
    p_shared: true,
  });
  if (error) return false;
  return data === true;
}

/**
 * Fetch a saved game by id for a share link, via the DEFINER RPC
 * `cu_fetch_shared_game(p_id)` (migration 012): it returns the row as
 * jsonb ONLY when the owner marked it shared (cu_games RLS itself stays
 * owner-only), and null otherwise — including for guests.
 */
export async function fetchSharedGame(
  gameId: string
): Promise<SavedGame | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("cu_fetch_shared_game", {
    p_id: gameId,
  });
  if (error || !data) return null;
  return data as SavedGame;
}

/** Fetch the user's saved games, newest first. */
export async function fetchGames(limit = 50): Promise<{
  games: SavedGame[];
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { games: [], error: "Supabase not configured" };
  const { data, error } = await sb
    .from("cu_games")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { games: [], error: error.message };
  return { games: (data ?? []) as SavedGame[], error: null };
}

/** Delete a saved game (owner only, via RLS). */
export async function deleteGame(id: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase not configured";
  const { error } = await sb.from("cu_games").delete().eq("id", id);
  return error ? error.message : null;
}

/**
 * Decode a saved game into replay data.
 * NEW SHAPE: `{ state, moves }` — `state` is the JieqiState the game
 * started from (core parseFen of the stored FULL FEN), `moves` the UCI
 * move codes to replay from it.
 */
export function decodeGame(g: SavedGame): {
  state: JieqiState;
  moves: string[];
} {
  const moves = g.moves ? g.moves.split(",").filter(Boolean) : [];
  let state: JieqiState;
  try {
    if (!g.full_fen) throw new Error("empty full_fen");
    state = parseFen(g.full_fen);
  } catch {
    // Unreachable for rows written by saveGame/saveCvcGame (they always
    // store a full FEN); a corrupt row degrades to a fresh deal rather
    // than crashing the replay view.
    state = createGame(0);
  }
  return { state, moves };
}

/** Win/loss/draw totals for the stats panel (own games, CvC excluded). */
export async function fetchStats(): Promise<{
  wins: number;
  losses: number;
  draws: number;
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb)
    return { wins: 0, losses: 0, draws: 0, error: "Supabase not configured" };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user)
    return { wins: 0, losses: 0, draws: 0, error: "Not logged in" };
  const { data, error } = await sb
    .from("cu_games")
    .select("result")
    .eq("user_id", user.id)
    .neq("player_color", "cvc"); // spectator games aren't the user's W/L/D
  if (error) return { wins: 0, losses: 0, draws: 0, error: error.message };
  let wins = 0,
    losses = 0,
    draws = 0;
  for (const r of data ?? []) {
    if (r.result === "win") wins++;
    else if (r.result === "loss") losses++;
    else draws++;
  }
  return { wins, losses, draws, error: null };
}

/**
 * Save a finished computer-vs-computer game to history WITHOUT stats/Elo
 * (the record RPC writes the row only for p_color='cvc'). The result is
 * stored from RED's point of view (win = Red won).
 */
export async function saveCvcGame(input: {
  moveCodes: string[];
  startState: JieqiState;
  winner: Color | null;
  level: number;
}): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase not configured" };
  if (input.moveCodes.length === 0) return { error: "No moves to save" };
  const { error } = await sb.rpc("cu_record_game_result", {
    p_color: "cvc",
    p_level: input.level,
    p_result:
      input.winner === null ? "draw" : input.winner === "red" ? "win" : "loss",
    p_plies: input.moveCodes.length,
    p_moves: input.moveCodes.join(","),
    p_full_fen: toFen(input.startState),
    p_public_fen: toPublicFen(input.startState),
  });
  return { error: error ? error.message : null };
}
