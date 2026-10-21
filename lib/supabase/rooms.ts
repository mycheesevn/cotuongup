import { getSupabase } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { MaskedState, MoveRecord } from "@/lib/jieqi/core";

// Cờ Úp rooms client (server-authoritative — see ROOMS_SPEC.md).
// Tables/RPCs are cu_-prefixed. Match CREATION and MOVES never touch
// tables/RPCs from the client: they go through /api/rooms/start and
// /api/rooms/move, because the deal and the true state are server-only
// secrets (`cu_match_secrets` has no client policies at all). Clients
// only ever receive the public `cu_matches` row + a MaskedState.

export interface Room {
  id: string;
  code: string;
  name: string;
  leader_id: string;
  max_players: number;
  status: "lobby" | "playing" | "closed";
  turn_order: string[];
  is_public: boolean;
  rules: string;
  created_at: string;
}

export interface TournamentPairing {
  red: string;
  black: string;
  result: "red" | "black" | "draw" | null;
  match_id: string | null;
}

export interface RoomTournament {
  id: string;
  room_id: string;
  name: string;
  status: "open" | "finished";
  pairings: TournamentPairing[];
  created_at: string;
  finished_at: string | null;
}

export interface PublicRoom {
  id: string;
  code: string;
  name: string;
  member_count: number;
  max_players: number;
  has_active_match: boolean;
}

export interface HotRoom {
  room_id: string;
  name: string;
  code: string;
  matches_7d: number;
  member_count: number;
}

export interface XpEarned {
  play_xp: number;
  host_xp: number;
  daily_xp: number;
}

export interface MemberProfile {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface RoomMember {
  user_id: string;
  role: "player" | "spectator";
  joined_at: string;
  profile: MemberProfile | null;
}

/** End-of-game public reveal (stamped on the match row at finish). */
export interface RevealedLayout {
  layout: string;
  true_fen: string;
}

export interface RoomMatch {
  id: string;
  room_id: string | null;
  /** 'room' matches live in a room; 'corr' matches are correspondence. */
  mode: "room" | "corr";
  match_no: number | null;
  red_id: string | null;
  black_id: string | null;
  status: "active" | "finished" | "cancelled";
  /** Public FEN (6 fields, no hidden identities) of the current position. */
  public_fen: string;
  /** Comma-joined UCI moves; a flipping move carries its revealed type
   *  as a suffix letter (e.g. "b9c7c"). Empty string = no moves yet. */
  moves: string;
  /** SHA-256 commitment to the secret deal, published at creation. */
  commitment: string;
  result: "red" | "black" | "draw" | null;
  reason: string | null;
  winner_id: string | null;
  /** User id with a pending draw offer, or null. */
  draw_offer_by: string | null;
  /** Full true layout, revealed only when the match finishes. */
  revealed_layout: RevealedLayout | null;
  /** Deal seed, revealed only when the match finishes (audit vs commitment). */
  revealed_seed: string | null;
  tournament_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface RoomComment {
  id: string;
  match_id: string | null;
  move_number: number;
  user_id: string;
  body: string;
  created_at: string;
  profile: MemberProfile | null;
}

/** Room-scoped chat message: members only, lives for the room (not a match). */
export interface RoomMessage {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: MemberProfile | null;
}

export interface RoomSummary extends Room {
  member_count: number;
}

/** Map RPC/server error codes to translation keys handled by the UI. */
export function roomErrorKey(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
  if (msg.includes("room_not_found")) return "roomNotFound";
  if (msg.includes("room_full")) return "roomFull";
  if (msg.includes("room_closed")) return "roomClosed";
  if (msg.includes("not_enough_players")) return "roomNeedTwoPlayers";
  if (msg.includes("match_in_progress")) return "roomMatchInProgress";
  if (msg.includes("not_leader")) return "roomNotLeader";
  return "roomGenericError";
}

function profileOf(row: unknown): MemberProfile | null {
  const p = (row as { profiles?: MemberProfile | MemberProfile[] | null })
    ?.profiles;
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function toMember(row: Record<string, unknown>): RoomMember {
  return {
    user_id: row.user_id as string,
    role: row.role as "player" | "spectator",
    joined_at: row.joined_at as string,
    profile: profileOf(row),
  };
}

function toComment(row: Record<string, unknown>): RoomComment {
  return {
    id: row.id as string,
    match_id: (row.match_id as string) ?? null,
    move_number: (row.move_number as number) ?? 0,
    user_id: row.user_id as string,
    body: row.body as string,
    created_at: row.created_at as string,
    profile: profileOf(row),
  };
}

function toMessage(row: Record<string, unknown>): RoomMessage {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    body: row.body as string,
    created_at: row.created_at as string,
    profile: profileOf(row),
  };
}

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

// ---------------------------------------------------------------------------
// Server-authoritative API routes (/api/rooms/*)
// ---------------------------------------------------------------------------

/** POST to a rooms API route with the session Bearer token (family pattern). */
async function roomsApiPost<T>(
  path: string,
  body: unknown
): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  const res = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error ?? `http_${res.status}`));
  }
  return json as T;
}

export interface StartMatchResult {
  match: RoomMatch;
  masked: MaskedState;
}

export interface SubmitMoveResult {
  match: RoomMatch;
  masked: MaskedState;
  record: MoveRecord;
  xp: XpEarned | null;
}

export interface MatchActionResult {
  match: RoomMatch;
  masked: MaskedState;
  xp: XpEarned | null;
}

export interface MatchStateResult {
  match: RoomMatch;
  masked: MaskedState;
  revealed: { seed: string; layout: string } | null;
}

export type RoomMatchAction =
  | "resign"
  | "draw_offer"
  | "draw_accept"
  | "draw_decline";

/**
 * Submit a move to the server-authoritative move route. The client NEVER
 * applies a room move locally — the returned MaskedState is the truth.
 */
export async function submitRoomMove(
  matchId: string,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<SubmitMoveResult> {
  return roomsApiPost<SubmitMoveResult>("/api/rooms/move", {
    matchId,
    from,
    to,
  });
}

/** Resign / draw-offer flow through the same move route. */
export async function submitRoomAction(
  matchId: string,
  action: RoomMatchAction
): Promise<MatchActionResult> {
  return roomsApiPost<MatchActionResult>("/api/rooms/move", {
    matchId,
    action,
  });
}

/** Authoritative masked state for late joiners / reconnects / spectators. */
export async function fetchMatchMasked(
  matchId: string
): Promise<MatchStateResult> {
  return roomsApiPost<MatchStateResult>("/api/rooms/state", { matchId });
}

/** Create a room; the creator becomes leader. Returns the room (with code). */
export async function createRoom(
  name: string,
  maxPlayers: number
): Promise<Room> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data, error } = await sb.rpc("cu_create_room", {
    p_name: name,
    p_max_players: maxPlayers,
  });
  if (error || !data) throw error ?? new Error("create_failed");
  return data as Room;
}

/** Join a room by invite code. Idempotent for existing members. */
export async function joinRoom(code: string): Promise<Room> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data, error } = await sb.rpc("cu_join_room", { p_code: code });
  if (error || !data) throw error ?? new Error("join_failed");
  return data as Room;
}

/** Finished room matches the current user played in, newest first. */
export interface MyRoomMatch extends RoomMatch {
  room_name: string;
  /** Display name of the opponent ("" when unknown). */
  opponent_name: string;
  my_color: "red" | "black";
}
export async function fetchMyRoomMatches(): Promise<MyRoomMatch[]> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return [];
  const { data, error } = await sb
    .from("cu_matches")
    .select("*")
    .eq("mode", "room")
    .or(`red_id.eq.${uid},black_id.eq.${uid}`)
    .eq("status", "finished")
    .order("finished_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  const matches = data as RoomMatch[];
  if (matches.length === 0) return [];
  const roomIds = [
    ...new Set(
      matches.map((m) => m.room_id).filter((x): x is string => !!x)
    ),
  ];
  const oppIds = [
    ...new Set(
      matches
        .map((m) => (m.red_id === uid ? m.black_id : m.red_id))
        .filter((x): x is string => !!x)
    ),
  ];
  const [roomsRes, profsRes] = await Promise.all([
    roomIds.length > 0
      ? sb.from("cu_rooms").select("id,name").in("id", roomIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    oppIds.length > 0
      ? sb.from("profiles").select("id,full_name,username").in("id", oppIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; username: string | null }[] }),
  ]);
  const roomName = new Map<string, string>(
    ((roomsRes.data ?? []) as { id: string; name: string }[]).map((r) => [
      r.id,
      r.name,
    ])
  );
  const profName = new Map<string, string>(
    ((profsRes.data ?? []) as { id: string; full_name: string | null; username: string | null }[]).map(
      (p) => [p.id, p.full_name?.trim() || p.username?.trim() || ""]
    )
  );
  return matches.map((m) => {
    const myColor = m.red_id === uid ? "red" : "black";
    const oppId = myColor === "red" ? m.black_id : m.red_id;
    return {
      ...m,
      room_name: (m.room_id && roomName.get(m.room_id)) || "",
      opponent_name: (oppId && profName.get(oppId)) || "",
      my_color: myColor,
    };
  });
}

/** Rooms the current user belongs to (excluding closed), with member counts. */
export async function fetchMyRooms(): Promise<RoomSummary[]> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return [];
  const { data: mems } = await sb
    .from("cu_room_members")
    .select("room_id")
    .eq("user_id", uid);
  const ids = (mems ?? []).map((m) => m.room_id as string);
  if (ids.length === 0) return [];
  const { data: rooms } = await sb
    .from("cu_rooms")
    .select("*")
    .in("id", ids)
    .neq("status", "closed")
    .order("created_at", { ascending: false });
  const { data: allMems } = await sb
    .from("cu_room_members")
    .select("room_id")
    .in("room_id", ids);
  const counts = new Map<string, number>();
  for (const m of allMems ?? [])
    counts.set(m.room_id as string, (counts.get(m.room_id as string) ?? 0) + 1);
  return ((rooms ?? []) as Room[]).map((r) => ({
    ...r,
    member_count: counts.get(r.id) ?? 0,
  }));
}

export interface RoomDetail {
  room: Room;
  members: RoomMember[];
  activeMatch: RoomMatch | null;
  pastMatches: RoomMatch[];
}

/** Full room state: room row, members with profiles, active + recent matches. */
export async function fetchRoomDetail(roomId: string): Promise<RoomDetail> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const [{ data: room }, { data: memRows }, { data: matchRows }] =
    await Promise.all([
      sb.from("cu_rooms").select("*").eq("id", roomId).single(),
      sb
        .from("cu_room_members")
        .select(
          "user_id, role, joined_at, profiles!cu_room_members_user_id_fkey(username, full_name, avatar_url)"
        )
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true }),
      sb
        .from("cu_matches")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  if (!room) throw new Error("room_not_found");
  const matches = (matchRows ?? []) as RoomMatch[];
  return {
    room: room as Room,
    members: (memRows ?? []).map((r) =>
      toMember(r as Record<string, unknown>)
    ),
    activeMatch: matches.find((m) => m.status === "active") ?? null,
    pastMatches: matches.filter((m) => m.status !== "active"),
  };
}

export async function leaveRoom(roomId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_leave_room", { p_room_id: roomId });
  if (error) throw error;
}

/** Leader-only: update the room's written rules (nội quy). */
export async function updateRoomRules(
  roomId: string,
  rules: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_update_room_rules", {
    p_room_id: roomId,
    p_rules: rules,
  });
  if (error) throw error;
}

export async function setTurnOrder(
  roomId: string,
  order: string[]
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_set_turn_order", {
    p_room_id: roomId,
    p_order: order,
  });
  if (error) throw error;
}

export async function setMemberRole(
  roomId: string,
  userId: string,
  role: "player" | "spectator"
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_set_member_role", {
    p_room_id: roomId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function kickMember(
  roomId: string,
  userId: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_kick_member", {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function closeRoom(roomId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_close_room", { p_room_id: roomId });
  if (error) throw error;
}

/**
 * Owner-only permanent room deletion. Blocked by the server while a match
 * is active ('match_in_progress'). The room keeps its rows (soft close) so
 * finished-match history survives; members are ejected live via the
 * realtime cu_rooms UPDATE.
 */
export async function deleteRoom(roomId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_delete_room", { p_room_id: roomId });
  if (error) throw error;
}

/**
 * Start the room's next match (rotation). SERVER-AUTHORITATIVE: the deal
 * happens in /api/rooms/start with the TS engine — there is deliberately
 * no start-match RPC (a fresh hidden deal cannot be an RPC's job here).
 * Leader only; the route enforces it.
 */
export async function startNextMatch(roomId: string): Promise<RoomMatch> {
  const { match } = await roomsApiPost<StartMatchResult>("/api/rooms/start", {
    roomId,
  });
  return match;
}

/**
 * Rematch: same two players, swapped colors, fresh server deal.
 * Either player of the finished match can trigger it.
 */
export async function requestRematch(
  roomId: string,
  rematchOf: string
): Promise<RoomMatch> {
  const { match } = await roomsApiPost<StartMatchResult>("/api/rooms/start", {
    roomId,
    rematchOf,
  });
  return match;
}

export async function cancelMatch(matchId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_cancel_match", { p_match_id: matchId });
  if (error) throw error;
}

/**
 * @deprecated Server-authoritative rooms finalize matches inside
 * /api/rooms/move (via `cu_record_room_result`) — clients must NOT
 * report results. Kept as a no-op wrapper so legacy call sites compile;
 * it returns zero XP because the real XP arrives with the move route's
 * response (`SubmitMoveResult.xp`).
 */
export async function finishMatch(
  _matchId: string,
  _result: "red" | "black" | "draw",
  _reason: string
): Promise<XpEarned> {
  void _matchId;
  void _result;
  void _reason;
  return { play_xp: 0, host_xp: 0, daily_xp: 0 };
}

/** Public lobby: open rooms anyone can join. */
export async function listPublicRooms(): Promise<PublicRoom[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("cu_list_public_rooms");
  if (error || !data) return [];
  return data as PublicRoom[];
}

/** Hottest rooms by finished matches in the last 7 days. */
export async function fetchHotRooms(): Promise<HotRoom[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("cu_room_leaderboard");
  if (error || !data) return [];
  return data as HotRoom[];
}

export async function setRoomPublic(
  roomId: string,
  isPublic: boolean
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_set_room_public", {
    p_room_id: roomId,
    p_public: isPublic,
  });
  if (error) throw error;
}

export async function fetchTournaments(
  roomId: string
): Promise<RoomTournament[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("cu_tournaments")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as RoomTournament[];
}

export async function createTournament(
  roomId: string,
  name: string
): Promise<RoomTournament> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data, error } = await sb.rpc("cu_create_tournament", {
    p_room_id: roomId,
    p_name: name,
  });
  if (error || !data) throw error ?? new Error("create_failed");
  return data as RoomTournament;
}

/**
 * Start the tournament's next pairing match — via /api/rooms/start
 * (fresh server deal, like every match creation). Leader only.
 */
export async function tournamentNextMatch(
  tournamentId: string,
  roomId: string
): Promise<RoomMatch> {
  const { match } = await roomsApiPost<StartMatchResult>("/api/rooms/start", {
    roomId,
    tournamentId,
  });
  return match;
}

export async function cancelTournament(tournamentId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb.rpc("cu_cancel_tournament", {
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
}

/** Standings from tournament pairings: points (win=1, draw=0.5), wins. */
export function tournamentStandings(
  pairings: TournamentPairing[]
): { userId: string; pts: number; wins: number; played: number }[] {
  const map = new Map<string, { pts: number; wins: number; played: number }>();
  const acc = (id: string) => {
    let r = map.get(id);
    if (!r) {
      r = { pts: 0, wins: 0, played: 0 };
      map.set(id, r);
    }
    return r;
  };
  for (const p of pairings) {
    if (!p.result) continue;
    const r = acc(p.red);
    const b = acc(p.black);
    r.played++;
    b.played++;
    if (p.result === "draw") {
      r.pts += 0.5;
      b.pts += 0.5;
    } else {
      const w = p.result === "red" ? r : b;
      w.pts += 1;
      w.wins += 1;
    }
  }
  return [...map.entries()]
    .map(([userId, v]) => ({ userId, ...v }))
    .sort((a, b) => b.pts - a.pts || b.wins - a.wins);
}

export async function fetchComments(
  roomId: string,
  matchId: string
): Promise<RoomComment[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("cu_room_comments")
    .select(
      "id, match_id, move_number, user_id, body, created_at, profiles!cu_room_comments_user_id_fkey(username, full_name, avatar_url)"
    )
    .eq("room_id", roomId)
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((r) => toComment(r as Record<string, unknown>));
}

export async function postComment(
  roomId: string,
  matchId: string,
  moveNumber: number,
  body: string
): Promise<RoomComment> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  const text = body.trim().slice(0, 500);
  if (!text) throw new Error("empty");
  const { data, error } = await sb
    .from("cu_room_comments")
    .insert({
      room_id: roomId,
      match_id: matchId,
      move_number: moveNumber,
      user_id: uid,
      body: text,
    })
    .select(
      "id, match_id, move_number, user_id, body, created_at, profiles!cu_room_comments_user_id_fkey(username, full_name, avatar_url)"
    )
    .single();
  if (error || !data) throw error ?? new Error("post_failed");
  return toComment(data as Record<string, unknown>);
}

/**
 * Room chat: latest messages, newest first in storage, reversed for display.
 * Pass `before` (a created_at timestamp) to page backwards ("load more").
 */
export async function fetchRoomMessages(
  roomId: string,
  limit = 50,
  before?: string
): Promise<RoomMessage[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb
    .from("cu_room_messages")
    .select(
      "id, user_id, body, created_at, profiles!cu_room_messages_user_id_fkey(username, full_name, avatar_url)"
    )
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);
  const { data } = await q;
  return (data ?? [])
    .map((r) => toMessage(r as Record<string, unknown>))
    .reverse();
}

export async function postRoomMessage(
  roomId: string,
  body: string
): Promise<RoomMessage> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  const text = body.trim().slice(0, 500);
  if (!text) throw new Error("empty");
  const { data, error } = await sb
    .from("cu_room_messages")
    .insert({ room_id: roomId, user_id: uid, body: text })
    .select(
      "id, user_id, body, created_at, profiles!cu_room_messages_user_id_fkey(username, full_name, avatar_url)"
    )
    .single();
  if (error || !data) throw error ?? new Error("post_failed");
  return toMessage(data as Record<string, unknown>);
}

export interface MatchReaction {
  id: string;
  match_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export const REACTION_EMOJIS = ["👏", "🔥", "😱", "👍", "😮"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Send a reaction to the live match (client-throttled by the caller). */
export async function sendReaction(
  roomId: string,
  matchId: string,
  emoji: ReactionEmoji
): Promise<void> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  const { error } = await sb.from("cu_match_reactions").insert({
    room_id: roomId,
    match_id: matchId,
    user_id: uid,
    emoji,
  });
  if (error) throw error;
}

export interface RoomEvents {
  onRoom?: (room: Room) => void;
  onMembers?: () => void;
  onMatches?: () => void;
  onTournaments?: () => void;
  onComment?: (comment: RoomComment) => void;
  onRoomMessage?: (message: RoomMessage) => void;
  onReaction?: (reaction: MatchReaction) => void;
  onKicked?: () => void;
}

/**
 * Realtime subscription for a room: room row, members, matches, new comments.
 * All subscribed tables carry PUBLIC/masked data only — `cu_match_secrets`
 * is never in the publication (ROOMS_SPEC §3). Returns an unsubscribe fn.
 */
export function subscribeRoom(
  roomId: string,
  events: RoomEvents,
  myUserId: string
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const ch: RealtimeChannel = sb.channel(`cu-room:${roomId}`);
  ch.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "cu_rooms",
      filter: `id=eq.${roomId}`,
    },
    (payload) => events.onRoom?.(payload.new as Room)
  );
  ch.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "cu_room_members",
      filter: `room_id=eq.${roomId}`,
    },
    (payload) => {
      if (
        payload.eventType === "DELETE" &&
        (payload.old as { user_id?: string })?.user_id === myUserId
      ) {
        events.onKicked?.();
      } else {
        events.onMembers?.();
      }
    }
  );
  ch.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "cu_matches",
      filter: `room_id=eq.${roomId}`,
    },
    () => events.onMatches?.()
  );
  ch.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "cu_tournaments",
      filter: `room_id=eq.${roomId}`,
    },
    () => events.onTournaments?.()
  );
  ch.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "cu_room_comments",
      filter: `room_id=eq.${roomId}`,
    },
    async (payload) => {
      const row = payload.new as Record<string, unknown>;
      // Attach the author's profile for display.
      const { data } = await sb
        .from("profiles")
        .select("username, full_name, avatar_url")
        .eq("id", row.user_id as string)
        .single();
      events.onComment?.(toComment({ ...row, profiles: data ?? null }));
    }
  );
  ch.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "cu_room_messages",
      filter: `room_id=eq.${roomId}`,
    },
    async (payload) => {
      const row = payload.new as Record<string, unknown>;
      // Attach the author's profile for display (same as comments).
      const { data } = await sb
        .from("profiles")
        .select("username, full_name, avatar_url")
        .eq("id", row.user_id as string)
        .single();
      events.onRoomMessage?.(toMessage({ ...row, profiles: data ?? null }));
    }
  );
  ch.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "cu_match_reactions",
      filter: `room_id=eq.${roomId}`,
    },
    (payload) => {
      const row = payload.new as Record<string, unknown>;
      events.onReaction?.({
        id: String(row.id ?? ""),
        match_id: String(row.match_id ?? ""),
        user_id: String(row.user_id ?? ""),
        emoji: String(row.emoji ?? "👏"),
        created_at: String(row.created_at ?? ""),
      });
    }
  );
  ch.subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}

/** Display name for a member profile (full name → username → fallback). */
export function memberName(
  profile: MemberProfile | null,
  fallback: string
): string {
  return (
    profile?.full_name?.trim() || profile?.username?.trim() || fallback
  );
}
