// Server-authoritative match logic for Cờ Úp rooms + correspondence.
// See ROOMS_SPEC.md (normative). This module is the ONLY place that
// touches true (unmasked) game state outside the engine core:
//
//   - Pure layer (no DB, unit-testable): dealMatch, rebuildTrueState,
//     validateAndApply, revealPayload, row builders.
//   - DB layer: createMatch / startRoomMatch / startCorrMatch /
//     applyMoveAs / actOnMatch / getMaskedForViewer, written against a
//     minimal structural Db interface so tests can drive them with an
//     in-memory fake. The API routes pass the service-role client.
//
// SECURITY INVARIANT: a `cu_matches` row and a MaskedState are the only
// match representations that may reach a client mid-game. The seed and
// the true FEN live exclusively in `cu_match_secrets` (service role).

import {
  applyMove,
  commitmentForSeed,
  createGame,
  gameStatus,
  layoutString,
  legalMoves,
  maskState,
  moveToUci,
  parseFen,
  parseUci,
  toFen,
  toPublicFen,
  TYPE_TO_LETTER,
  type Color,
  type JieqiState,
  type MaskedState,
  type Move,
  type MoveRecord,
} from "../jieqi/core";

// ---------------------------------------------------------------------------
// Errors: `code` is contractual (routes map it to HTTP status + JSON error).
// ---------------------------------------------------------------------------

export class ServerMatchError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const err = {
  notFound: () => new ServerMatchError("match_not_found", 404),
  roomNotFound: () => new ServerMatchError("room_not_found", 404),
  notAPlayer: () => new ServerMatchError("not_a_player", 403),
  notYourTurn: () => new ServerMatchError("not_your_turn", 403),
  notLeader: () => new ServerMatchError("not_leader", 403),
  notActive: () => new ServerMatchError("match_not_active", 409),
  inProgress: () => new ServerMatchError("match_in_progress", 409),
  illegal: () => new ServerMatchError("illegal_move", 422),
  needTwo: () => new ServerMatchError("not_enough_players", 422),
  forbidden: () => new ServerMatchError("forbidden", 403),
};

// ---------------------------------------------------------------------------
// Row shapes (mirror ROOMS_SPEC.md §1.3 / §1.4)
// ---------------------------------------------------------------------------

export interface CuMatchRow {
  id: string;
  room_id: string | null;
  mode: "room" | "corr";
  match_no: number | null;
  red_id: string | null;
  black_id: string | null;
  status: "active" | "finished" | "cancelled";
  public_fen: string;
  moves: string;
  commitment: string;
  result: "red" | "black" | "draw" | null;
  reason: string | null;
  winner_id: string | null;
  draw_offer_by: string | null;
  revealed_layout: { layout: string; true_fen: string } | null;
  revealed_seed: string | null;
  tournament_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface CuSecretRow {
  match_id: string;
  seed: string;
  true_layout: {
    layout: string;
    pieces: {
      x: number;
      y: number;
      color: Color;
      trueType: string;
      fakeType: string;
      covered: boolean;
    }[];
  };
  true_fen: string;
}

/** Minimal structural DB surface (the service-role Supabase client fits). */
export interface Db {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

// ---------------------------------------------------------------------------
// Pure layer
// ---------------------------------------------------------------------------

/** 32 bytes of cryptographic randomness as hex — the deal seed. */
export function newSeed(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Deal {
  state: JieqiState;
  publicFen: string;
  trueFen: string;
  commitment: string;
  trueLayout: CuSecretRow["true_layout"];
}

/** Deal a fresh game from a seed and derive every public/secret artifact. */
export function dealMatch(seed: string): Deal {
  const state = createGame(seed);
  const pieces: CuSecretRow["true_layout"]["pieces"] = [];
  for (let y = 0; y < state.board.length; y++) {
    for (let x = 0; x < state.board[y].length; x++) {
      const p = state.board[y][x];
      if (p) {
        pieces.push({
          x,
          y,
          color: p.color,
          trueType: p.trueType,
          fakeType: p.fakeType,
          covered: p.covered,
        });
      }
    }
  }
  return {
    state,
    publicFen: toPublicFen(state),
    trueFen: toFen(state),
    commitment: commitmentForSeed(seed),
    trueLayout: { layout: layoutString(state), pieces },
  };
}

export function splitMoves(moves: string): string[] {
  return moves ? moves.split(",").filter(Boolean) : [];
}

export function joinMoves(ucis: string[]): string {
  return ucis.join(",");
}

/**
 * Rebuild the true state by replaying the public move list over a fresh
 * deal. Deterministic, and it restores the FULL engine state (including
 * repetition history, which a bare `parseFen(true_fen)` would lose).
 * The flip suffix of every UCI is checked against the engine's record —
 * a mismatch means the stored chain is corrupt.
 */
export function rebuildTrueState(seed: string, moves: string): JieqiState {
  let state = createGame(seed);
  for (const uci of splitMoves(moves)) {
    const { move, revealedType } = parseUci(uci);
    const { state: next, record } = applyMove(state, move);
    const suffix = record.flipped
      ? TYPE_TO_LETTER[record.revealedType as keyof typeof TYPE_TO_LETTER]
      : null;
    const expected = revealedType
      ? TYPE_TO_LETTER[revealedType as keyof typeof TYPE_TO_LETTER]
      : null;
    if (suffix !== expected) throw new Error("move_chain_mismatch");
    state = next;
  }
  return state;
}

/** Rebuild, tolerating a corrupt chain by falling back to the stored FEN. */
export function rebuildOrParse(seed: string, moves: string, trueFen: string): JieqiState {
  try {
    return rebuildTrueState(seed, moves);
  } catch {
    return parseFen(trueFen);
  }
}

export interface AppliedMove {
  next: JieqiState;
  record: MoveRecord;
  uci: string;
  over: boolean;
  result: "red" | "black" | "draw" | null;
  reason: string | null;
}

/** Validate `move` against the true state's legal moves and apply it. */
export function validateAndApply(state: JieqiState, move: Move): AppliedMove {
  const legal = legalMoves(state);
  const ok = legal.some(
    (m) =>
      m.fromX === move.fromX &&
      m.fromY === move.fromY &&
      m.toX === move.toX &&
      m.toY === move.toY
  );
  if (!ok) throw err.illegal();
  const { state: next, record } = applyMove(state, move);
  const status = gameStatus(next);
  return {
    next,
    record,
    uci: moveToUci(move, record.revealedType),
    over: status.over,
    result: status.over ? (status.winner ?? "draw") : null,
    reason: status.reason,
  };
}

/** The end-of-game reveal payload (public from finalization on). */
export function revealPayload(
  state: JieqiState,
  seed: string
): { revealed_layout: { layout: string; true_fen: string }; revealed_seed: string } {
  return {
    revealed_layout: { layout: layoutString(state), true_fen: toFen(state) },
    revealed_seed: seed,
  };
}

/** Insert-row builders — the exact shapes persisted for a new match. */
export function buildMatchInsert(
  params: {
    roomId: string | null;
    mode: "room" | "corr";
    redId: string;
    blackId: string;
    tournamentId?: string | null;
    matchNo?: number | null;
  },
  deal: Deal
): Omit<CuMatchRow, "id" | "created_at" | "updated_at" | "finished_at"> {
  return {
    room_id: params.roomId,
    mode: params.mode,
    match_no: params.matchNo ?? null,
    red_id: params.redId,
    black_id: params.blackId,
    status: "active",
    public_fen: deal.publicFen,
    moves: "",
    commitment: deal.commitment,
    result: null,
    reason: null,
    winner_id: null,
    draw_offer_by: null,
    revealed_layout: null,
    revealed_seed: null,
    tournament_id: params.tournamentId ?? null,
  };
}

export function buildSecretInsert(
  matchId: string,
  seed: string,
  deal: Deal
): CuSecretRow {
  return {
    match_id: matchId,
    seed,
    true_layout: deal.trueLayout,
    true_fen: deal.trueFen,
  };
}

export function colorOf(match: CuMatchRow, userId: string): Color | null {
  if (match.red_id === userId) return "red";
  if (match.black_id === userId) return "black";
  return null;
}

export function winnerIdFor(
  match: CuMatchRow,
  result: "red" | "black" | "draw"
): string | null {
  return result === "red" ? match.red_id : result === "black" ? match.black_id : null;
}

// ---------------------------------------------------------------------------
// DB layer
// ---------------------------------------------------------------------------

async function getMatch(db: Db, matchId: string): Promise<CuMatchRow> {
  const { data, error } = await db
    .from("cu_matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (error || !data) throw err.notFound();
  return data as CuMatchRow;
}

async function getSecret(db: Db, matchId: string): Promise<CuSecretRow> {
  const { data, error } = await db
    .from("cu_match_secrets")
    .select("*")
    .eq("match_id", matchId)
    .single();
  if (error || !data) throw err.notFound();
  return data as CuSecretRow;
}

async function refreshMatch(db: Db, matchId: string): Promise<CuMatchRow> {
  return getMatch(db, matchId);
}

/** Deal + persist a new match (secret first-class, public row masked). */
export async function createMatch(
  db: Db,
  params: {
    roomId: string | null;
    mode: "room" | "corr";
    redId: string;
    blackId: string;
    tournamentId?: string | null;
    matchNo?: number | null;
  }
): Promise<{ match: CuMatchRow; masked: MaskedState }> {
  const seed = newSeed();
  const deal = dealMatch(seed);
  const { data, error } = await db
    .from("cu_matches")
    .insert(buildMatchInsert(params, deal))
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  const match = data as CuMatchRow;
  const sec = buildSecretInsert(match.id, seed, deal);
  const { error: secErr } = await db.from("cu_match_secrets").insert(sec);
  if (secErr) throw new Error(secErr.message);
  return { match, masked: maskState(deal.state) };
}

interface RoomRow {
  id: string;
  leader_id: string;
  status: string;
  turn_order: string[];
  is_public: boolean;
}

async function getRoom(db: Db, roomId: string): Promise<RoomRow> {
  const { data, error } = await db
    .from("cu_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  if (error || !data) throw err.roomNotFound();
  return data as RoomRow;
}

async function roomPlayersInOrder(
  db: Db,
  room: RoomRow
): Promise<string[]> {
  const { data } = await db
    .from("cu_room_members")
    .select("user_id, role, joined_at")
    .eq("room_id", room.id);
  const rows = (data ?? []) as {
    user_id: string;
    role: string;
    joined_at: string;
  }[];
  const players = rows.filter((r) => r.role === "player");
  const byJoin = [...players].sort((a, b) =>
    a.joined_at < b.joined_at ? -1 : 1
  );
  const ordered: string[] = [];
  for (const id of room.turn_order ?? []) {
    if (players.some((p) => p.user_id === id) && !ordered.includes(id)) {
      ordered.push(id);
    }
  }
  for (const p of byJoin) {
    if (!ordered.includes(p.user_id)) ordered.push(p.user_id);
  }
  return ordered;
}

async function assertNoActiveMatch(db: Db, roomId: string): Promise<void> {
  const { data } = await db
    .from("cu_matches")
    .select("id")
    .eq("room_id", roomId)
    .eq("status", "active")
    .limit(1);
  if (data && data.length > 0) throw err.inProgress();
}

async function nextMatchNo(db: Db, roomId: string): Promise<number> {
  const { data } = await db
    .from("cu_matches")
    .select("match_no")
    .eq("room_id", roomId)
    .order("match_no", { ascending: false })
    .limit(1);
  const top = (data?.[0]?.match_no as number | null) ?? 0;
  return top + 1;
}

async function setRoomPlaying(db: Db, roomId: string): Promise<void> {
  await db.from("cu_rooms").update({ status: "playing" }).eq("id", roomId);
}

/**
 * Start the next match for a room: rotation start (leader only), rematch
 * (either player of the finished match, colors swapped), or the next
 * tournament pairing (leader only). All need a fresh deal → this route.
 */
export async function startRoomMatch(
  db: Db,
  params: {
    roomId: string;
    callerId: string;
    rematchOf?: string;
    tournamentId?: string;
  }
): Promise<{ match: CuMatchRow; masked: MaskedState }> {
  const room = await getRoom(db, params.roomId);
  if (room.status === "closed") throw new ServerMatchError("room_closed", 409);
  await assertNoActiveMatch(db, params.roomId);

  if (params.rematchOf) {
    const prev = await getMatch(db, params.rematchOf);
    if (prev.room_id !== params.roomId || prev.status !== "finished") {
      throw err.notActive();
    }
    if (colorOf(prev, params.callerId) === null) throw err.notAPlayer();
    if (!prev.red_id || !prev.black_id) throw err.notFound();
    const created = await createMatch(db, {
      roomId: params.roomId,
      mode: "room",
      redId: prev.black_id,
      blackId: prev.red_id,
      tournamentId: null,
      matchNo: await nextMatchNo(db, params.roomId),
    });
    await setRoomPlaying(db, params.roomId);
    return created;
  }

  if (params.tournamentId) {
    if (room.leader_id !== params.callerId) throw err.notLeader();
    const { data, error } = await db
      .from("cu_tournaments")
      .select("*")
      .eq("id", params.tournamentId)
      .single();
    if (error || !data) throw new ServerMatchError("tournament_not_found", 404);
    const t = data as {
      id: string;
      room_id: string;
      status: string;
      pairings: { red: string; black: string; result: string | null; match_id: string | null }[];
    };
    if (t.room_id !== params.roomId) throw err.forbidden();
    if (t.status !== "open") {
      throw new ServerMatchError("tournament_finished", 409);
    }
    const idx = t.pairings.findIndex((p) => p.result === null && !p.match_id);
    if (idx < 0) throw new ServerMatchError("tournament_finished", 409);
    const pairing = t.pairings[idx];
    const created = await createMatch(db, {
      roomId: params.roomId,
      mode: "room",
      redId: pairing.red,
      blackId: pairing.black,
      tournamentId: t.id,
      matchNo: await nextMatchNo(db, params.roomId),
    });
    const pairings = t.pairings.map((p, i) =>
      i === idx ? { ...p, match_id: created.match.id } : p
    );
    await db
      .from("cu_tournaments")
      .update({ pairings })
      .eq("id", t.id);
    await setRoomPlaying(db, params.roomId);
    return created;
  }

  // Plain rotation start — leader only (family rule, as PacClone).
  if (room.leader_id !== params.callerId) throw err.notLeader();
  const order = await roomPlayersInOrder(db, room);
  if (order.length < 2) throw err.needTwo();
  const [redId, blackId] = order;
  const created = await createMatch(db, {
    roomId: params.roomId,
    mode: "room",
    redId,
    blackId,
    matchNo: await nextMatchNo(db, params.roomId),
  });
  // Rotate: the Red player goes to the back of the queue.
  const rotated = [...order.slice(1), order[0]];
  await db
    .from("cu_rooms")
    .update({ turn_order: rotated, status: "playing" })
    .eq("id", params.roomId);
  return created;
}

/** Create a correspondence match: caller plays Red. */
export async function startCorrMatch(
  db: Db,
  params: { callerId: string; opponentId: string }
): Promise<{ match: CuMatchRow; masked: MaskedState }> {
  if (params.opponentId === params.callerId) {
    throw new ServerMatchError("self", 422);
  }
  return createMatch(db, {
    roomId: null,
    mode: "corr",
    redId: params.callerId,
    blackId: params.opponentId,
  });
}

/** Load match + secret + rebuilt true state (route-internal). */
export async function loadMatchState(
  db: Db,
  matchId: string
): Promise<{ match: CuMatchRow; secret: CuSecretRow; state: JieqiState }> {
  const match = await getMatch(db, matchId);
  const secret = await getSecret(db, matchId);
  const state = rebuildOrParse(secret.seed, match.moves, secret.true_fen);
  return { match, secret, state };
}

export interface XpSlice {
  play_xp: number;
  host_xp: number;
  daily_xp: number;
}

/**
 * Finalize a match through `cu_record_room_result` (spec §5): the RPC
 * records Elo/XP + room/tournament write-back and stamps the reveal;
 * this wrapper just calls it and slices the caller's XP for the toast.
 */
export async function finalizeMatch(
  db: Db,
  match: CuMatchRow,
  state: JieqiState,
  seed: string,
  result: "red" | "black" | "draw",
  reason: string,
  callerId: string
): Promise<{ match: CuMatchRow; xp: XpSlice }> {
  const reveal = revealPayload(state, seed);
  const { data, error } = await db.rpc("cu_record_room_result", {
    p_match_id: match.id,
    p_result: result,
    p_reason: reason,
    p_revealed_layout: reveal.revealed_layout,
    p_revealed_seed: reveal.revealed_seed,
  });
  if (error) throw new Error(error.message);
  const b = (data ?? {}) as {
    red_play_xp?: number;
    black_play_xp?: number;
    host_xp?: number;
    host_user_id?: string;
  };
  const xp: XpSlice = {
    play_xp:
      callerId === match.red_id
        ? (b.red_play_xp ?? 0)
        : callerId === match.black_id
          ? (b.black_play_xp ?? 0)
          : 0,
    host_xp: callerId === b.host_user_id ? (b.host_xp ?? 0) : 0,
    // Daily-participation XP is awarded by the RPC but not broken out in
    // its return contract (spec §4); it shows up in stats/quests.
    daily_xp: 0,
  };
  const fresh = await refreshMatch(db, match.id);
  return { match: fresh, xp };
}

export interface MoveOutcome {
  match: CuMatchRow;
  masked: MaskedState;
  record: MoveRecord;
  xp: XpSlice | null;
}

/** Apply a player's move authoritatively. Throws ServerMatchError. */
export async function applyMoveAs(
  db: Db,
  params: { matchId: string; userId: string; move: Move }
): Promise<MoveOutcome> {
  const { match, secret, state } = await loadMatchState(db, params.matchId);
  if (match.status !== "active") throw err.notActive();
  const myColor = colorOf(match, params.userId);
  if (myColor === null) throw err.notAPlayer();
  if (state.turn !== myColor) throw err.notYourTurn();

  const applied = validateAndApply(state, params.move);
  const ucis = [...splitMoves(match.moves), applied.uci];
  const now = new Date().toISOString();

  const { error: secErr } = await db
    .from("cu_match_secrets")
    .update({ true_fen: toFen(applied.next), updated_at: now })
    .eq("match_id", match.id);
  if (secErr) throw new Error(secErr.message);

  const patch: Record<string, unknown> = {
    public_fen: toPublicFen(applied.next),
    moves: joinMoves(ucis),
    // Any move settles a pending draw offer (explicit decline semantics).
    draw_offer_by: null,
    updated_at: now,
  };
  const { error: mErr } = await db
    .from("cu_matches")
    .update(patch)
    .eq("id", match.id)
    .eq("status", "active");
  if (mErr) throw new Error(mErr.message);

  let fresh = await refreshMatch(db, match.id);
  let xp: XpSlice | null = null;
  if (applied.over && applied.result && applied.reason) {
    const fin = await finalizeMatch(
      db,
      fresh,
      applied.next,
      secret.seed,
      applied.result,
      applied.reason,
      params.userId
    );
    fresh = fin.match;
    xp = fin.xp;
  }
  return { match: fresh, masked: maskState(applied.next), record: applied.record, xp };
}

export type MatchAction = "resign" | "draw_offer" | "draw_accept" | "draw_decline";

export interface ActionOutcome {
  match: CuMatchRow;
  masked: MaskedState;
  xp: XpSlice | null;
}

/** Resign / draw-offer flow. Throws ServerMatchError. */
export async function actOnMatch(
  db: Db,
  params: { matchId: string; userId: string; action: MatchAction }
): Promise<ActionOutcome> {
  const { match, secret, state } = await loadMatchState(db, params.matchId);
  if (match.status !== "active") throw err.notActive();
  const myColor = colorOf(match, params.userId);
  if (myColor === null) throw err.notAPlayer();
  const masked = maskState(state);

  switch (params.action) {
    case "resign": {
      const result: "red" | "black" = myColor === "red" ? "black" : "red";
      const fin = await finalizeMatch(
        db,
        match,
        state,
        secret.seed,
        result,
        "resign",
        params.userId
      );
      return { match: fin.match, masked, xp: fin.xp };
    }
    case "draw_offer": {
      if (match.draw_offer_by === params.userId) {
        throw new ServerMatchError("draw_already_offered", 409);
      }
      if (match.draw_offer_by) {
        throw new ServerMatchError("draw_pending", 409);
      }
      const { error } = await db
        .from("cu_matches")
        .update({ draw_offer_by: params.userId, updated_at: new Date().toISOString() })
        .eq("id", match.id)
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return { match: await refreshMatch(db, match.id), masked, xp: null };
    }
    case "draw_accept": {
      if (!match.draw_offer_by || match.draw_offer_by === params.userId) {
        throw new ServerMatchError("no_draw_offer", 409);
      }
      const fin = await finalizeMatch(
        db,
        match,
        state,
        secret.seed,
        "draw",
        "draw-agreed",
        params.userId
      );
      return { match: fin.match, masked, xp: fin.xp };
    }
    case "draw_decline": {
      if (!match.draw_offer_by || match.draw_offer_by === params.userId) {
        throw new ServerMatchError("no_draw_offer", 409);
      }
      const { error } = await db
        .from("cu_matches")
        .update({ draw_offer_by: null, updated_at: new Date().toISOString() })
        .eq("id", match.id)
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return { match: await refreshMatch(db, match.id), masked, xp: null };
    }
  }
}

/**
 * Masked state for a viewer (late joiner / spectator / corr player).
 * Room matches: members always; signed-in non-members only when the
 * room is public. Corr matches: players only. Anonymous callers are
 * rejected by the route before this runs (guests use the
 * `cu_guest_room_detail` RPC + realtime instead).
 */
export async function getMaskedForViewer(
  db: Db,
  params: { matchId: string; userId: string }
): Promise<{
  match: CuMatchRow;
  masked: MaskedState;
  revealed: { seed: string; layout: string } | null;
}> {
  const { match, secret, state } = await loadMatchState(db, params.matchId);
  if (match.mode === "corr") {
    if (colorOf(match, params.userId) === null) throw err.forbidden();
  } else if (match.room_id) {
    if (colorOf(match, params.userId) === null) {
      const { data } = await db
        .from("cu_room_members")
        .select("user_id")
        .eq("room_id", match.room_id)
        .eq("user_id", params.userId)
        .limit(1);
      const isMember = !!(data && data.length > 0);
      if (!isMember) {
        const room = await getRoom(db, match.room_id);
        if (!room.is_public) throw err.forbidden();
      }
    }
  }
  const revealed =
    match.status === "finished" && match.revealed_seed
      ? { seed: match.revealed_seed, layout: match.revealed_layout?.layout ?? layoutString(state) }
      : null;
  // The secret is referenced ONLY to rebuild state above; it is never
  // returned. `void secret` documents that the seed stays server-side
  // until the match row itself publishes it at finish.
  void secret;
  return { match, masked: maskState(state), revealed };
}
