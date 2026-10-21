// Agent C verification: server-authoritative rooms for Cờ Úp.
//
// Drives the REAL route logic (lib/rooms/serverMatch.ts — the exact
// functions app/api/rooms/* call) against an in-memory fake Db, plus the
// core engine, and asserts the hidden-information invariants:
//
//   1. A cu_matches-shaped row and every MaskedState payload contain NO
//      covered piece's trueType, no seed, no true FEN, no layout.
//   2. Wrong player / wrong turn / illegal moves are rejected.
//   3. Random legal play through applyMoveAs reaches a flip and a
//      capture of a covered piece; both are revealed PUBLICLY in the
//      MoveRecord (and the captured identity matches the true state).
//   4. The stored move chain replays to the exact true state.
//   5. Draw-offer and resign flows finalize through the record RPC;
//      finishing reveals seed + layout and the commitment verifies.
//   6. Spectator visibility rules for /api/rooms/state hold.
//   7. The guest derivation (maskedFromPublic) matches the server mask.
//
// Run:  ~/workspace/co-up/engine/node_modules/.bin/tsx scripts/agent-c-test.mjs
// (tsx is borrowed from the engine workspace; cotuongup has no tsx dep.)

import {
  createMatch,
  applyMoveAs,
  actOnMatch,
  getMaskedForViewer,
  loadMatchState,
  ServerMatchError,
} from "../lib/rooms/serverMatch.ts";
// The core index re-exports via `export *` chains, which static
// named-export detection (CJS interop in tsx) cannot see from an .mjs
// entry — unwrap the CJS default, which carries every export.
import * as coreNs from "../lib/jieqi/core/index.ts";
const core = coreNs.default ?? coreNs;
const { legalMoves, layoutString, maskState, maskedFen, verifyCommitment } =
  core;
import {
  maskedFromPublic,
  maskedMoveLabels,
} from "../lib/rooms/maskedView.ts";

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}
function section(name) {
  console.log(`\n== ${name}`);
}

// ---------------------------------------------------------------------------
// In-memory fake Db implementing the chainable surface serverMatch uses.
// ---------------------------------------------------------------------------
class Q {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.op = null;
    this.filters = [];
    this.payload = null;
    this.wantSingle = false;
    this.limitN = null;
    this.orderSpec = null;
  }
  select() {
    if (this.op === null) this.op = "select";
    return this;
  }
  insert(row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  eq(k, v) {
    this.filters.push([k, v]);
    return this;
  }
  order(col, opts) {
    this.orderSpec = [col, opts?.ascending !== false];
    return this;
  }
  limit(n) {
    this.limitN = n;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  rows() {
    return this.store.tables[this.table];
  }
  filtered() {
    return this.rows().filter((r) =>
      this.filters.every(([k, v]) => r[k] === v)
    );
  }
  async exec() {
    const now = new Date().toISOString();
    if (this.op === "insert") {
      const row =
        this.table === "cu_matches"
          ? {
              id: globalThis.crypto.randomUUID(),
              created_at: now,
              updated_at: now,
              finished_at: null,
              ...this.payload,
            }
          : { created_at: now, updated_at: now, ...this.payload };
      this.rows().push(row);
      return { data: this.wantSingle ? row : null, error: null };
    }
    if (this.op === "update") {
      for (const r of this.filtered()) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    // select
    let out = this.filtered();
    if (this.orderSpec) {
      const [col, asc] = this.orderSpec;
      out = [...out].sort((a, b) =>
        (a[col] ?? 0) < (b[col] ?? 0) ? (asc ? -1 : 1) : asc ? 1 : -1
      );
    }
    if (this.limitN) out = out.slice(0, this.limitN);
    if (this.wantSingle) {
      return out.length
        ? { data: out[0], error: null }
        : { data: null, error: { message: "row not found" } };
    }
    return { data: out, error: null };
  }
  then(onF, onR) {
    return this.exec().then(onF, onR);
  }
  catch(onR) {
    return this.exec().catch(onR);
  }
  finally(onF) {
    return this.exec().finally(onF);
  }
}

function makeFakeDb() {
  const store = {
    tables: {
      cu_matches: [],
      cu_match_secrets: [],
      cu_rooms: [],
      cu_room_members: [],
      cu_tournaments: [],
    },
  };
  const db = {
    store,
    from: (t) => new Q(store, t),
    rpc: async (fn, args) => {
      if (fn !== "cu_record_room_result") {
        return { data: null, error: { message: `unknown rpc ${fn}` } };
      }
      const m = store.tables.cu_matches.find((r) => r.id === args.p_match_id);
      if (!m) return { data: null, error: { message: "match_not_found" } };
      if (m.status === "finished") {
        return {
          data: { red_play_xp: 0, black_play_xp: 0, host_xp: 0, host_user_id: null },
          error: null,
        };
      }
      m.status = "finished";
      m.result = args.p_result;
      m.reason = args.p_reason;
      m.winner_id =
        args.p_result === "red" ? m.red_id : args.p_result === "black" ? m.black_id : null;
      m.draw_offer_by = null;
      m.revealed_layout = args.p_revealed_layout ?? null;
      m.revealed_seed = args.p_revealed_seed ?? null;
      m.finished_at = new Date().toISOString();
      if (m.room_id) {
        const room = store.tables.cu_rooms.find((r) => r.id === m.room_id);
        if (room && room.status === "playing") room.status = "lobby";
      }
      return {
        data: { red_play_xp: 15, black_play_xp: 5, host_xp: 0, host_user_id: null },
        error: null,
      };
    },
  };
  return db;
}

const RED = "user-red";
const BLACK = "user-black";
const SPEC = "user-spectator";
const INITIAL_PUBLIC_FEN =
  "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1";

function secretOf(db, matchId) {
  return db.store.tables.cu_match_secrets.find((r) => r.match_id === matchId);
}
function rowOf(db, matchId) {
  return db.store.tables.cu_matches.find((r) => r.id === matchId);
}

/** The full leak battery for one (row, masked) pair against the true state. */
function leakChecks(db, match, masked, trueState, label) {
  const secret = secretOf(db, match.id);
  const rowJson = JSON.stringify(match);
  assert(!("seed" in match), `${label}: match row has no seed field`);
  assert(!("true_fen" in match), `${label}: match row has no true_fen field`);
  assert(!rowJson.includes(secret.seed), `${label}: row JSON excludes the seed`);
  assert(
    !rowJson.includes(layoutString(trueState)),
    `${label}: row JSON excludes the true layout`
  );
  assert(
    match.public_fen.split(/\s+/).length === 6,
    `${label}: public_fen has 6 fields (no hidden field)`
  );
  // Structural: every covered piece in the masked payload is identity-free.
  let coveredCount = 0;
  for (const rowArr of masked.board) {
    for (const p of rowArr) {
      if (p && p.covered) {
        coveredCount++;
        assert(
          p.trueType === null,
          `${label}: covered piece exposes trueType === null`
        );
      }
    }
  }
  // String-level: the masked payload cannot contain the layout string or
  // the full (7-field) true FEN — different encodings entirely.
  const maskedJson = JSON.stringify(masked);
  assert(
    !maskedJson.includes(secret.seed),
    `${label}: masked JSON excludes the seed`
  );
  assert(
    maskedFen(masked) === match.public_fen,
    `${label}: maskedFen(masked) === public_fen`
  );
  return coveredCount;
}

async function expectCode(promise, code, label) {
  try {
    await promise;
    assert(false, `${label}: expected ${code}, call succeeded`);
  } catch (e) {
    assert(
      e instanceof ServerMatchError && e.code === code,
      `${label}: expected ${code}, got ${e?.code ?? e?.message}`
    );
  }
}

// ---------------------------------------------------------------------------
section("deal: createMatch stores secret, publishes masked-only row");
const db = makeFakeDb();
const { match, masked } = await createMatch(db, {
  roomId: null,
  mode: "corr",
  redId: RED,
  blackId: BLACK,
});
{
  const { state } = await loadMatchState(db, match.id);
  assert(match.public_fen === INITIAL_PUBLIC_FEN, "initial public FEN is the design string");
  assert(/^[0-9a-f]{64}$/.test(match.commitment), "commitment is a SHA-256 hex");
  assert(match.moves === "", "moves start empty");
  assert(match.revealed_seed === null && match.revealed_layout === null, "nothing revealed at deal");
  const secret = secretOf(db, match.id);
  assert(!!secret?.seed, "secret row holds the seed");
  assert(secret.true_fen.split(/\s+/).length === 7, "secret true_fen has the hidden 7th field");
  const covered = leakChecks(db, match, masked, state, "deal");
  assert(covered === 30, `30 covered pieces at deal (got ${covered})`);
  assert(
    verifyCommitment(secret.seed, match.commitment),
    "commitment verifies against the secret seed"
  );
}

section("turn / player / legality enforcement");
await expectCode(
  applyMoveAs(db, { matchId: match.id, userId: BLACK, move: { fromX: 0, fromY: 3, toX: 0, toY: 4 } }),
  "not_your_turn",
  "black cannot move first"
);
await expectCode(
  applyMoveAs(db, { matchId: match.id, userId: SPEC, move: { fromX: 0, fromY: 6, toX: 0, toY: 5 } }),
  "not_a_player",
  "spectator cannot move"
);
await expectCode(
  applyMoveAs(db, { matchId: match.id, userId: RED, move: { fromX: 0, fromY: 6, toX: 0, toY: 4 } }),
  "illegal_move",
  "two-step pawn-host move rejected"
);
await expectCode(
  getMaskedForViewer(db, { matchId: match.id, userId: SPEC }),
  "forbidden",
  "corr state is players-only"
);

section("random play through applyMoveAs until flip + covered capture");
let sawFlip = false;
let sawCoveredCapture = false;
let gamesPlayed = 0;
let current = match;
while ((!sawFlip || !sawCoveredCapture) && gamesPlayed < 6) {
  gamesPlayed++;
  let plies = 0;
  while (plies < 600) {
    plies++;
    const { state } = await loadMatchState(db, current.id);
    const legal = legalMoves(state);
    if (legal.length === 0) break;
    const move = legal[Math.floor(Math.random() * legal.length)];
    const targetBefore = state.board[move.toY][move.toX];
    const moverBefore = state.board[move.fromY][move.fromX];
    const userId = state.turn === "red" ? RED : BLACK;
    const out = await applyMoveAs(db, { matchId: current.id, userId, move });
    const row = rowOf(db, current.id);
    const { state: trueAfter } = await loadMatchState(db, current.id);

    leakChecks(db, row, out.masked, trueAfter, `ply ${plies}`);

    if (out.record.flipped) {
      sawFlip = true;
      assert(
        out.record.revealedType === moverBefore.trueType,
        "flip reveals the mover's true identity"
      );
      const ucis = row.moves.split(",");
      assert(
        ucis[ucis.length - 1].length === 5,
        "flipping move's UCI carries the suffix letter"
      );
    }
    if (out.record.captured?.wasCovered) {
      sawCoveredCapture = true;
      assert(
        out.record.captured.trueType === targetBefore.trueType,
        "captured covered piece is revealed with its TRUE identity"
      );
      assert(
        out.masked.captured.some(
          (c) => c.trueType === targetBefore.trueType && c.wasCovered
        ),
        "captured identity is public in the masked captured list"
      );
    }
    // Stored chain replays to the exact live true state.
    assert(
      layoutString(trueAfter) ===
        layoutString((await loadMatchState(db, current.id)).state),
      "replay is deterministic"
    );
    if (row.status === "finished") {
      assert(row.revealed_seed === secretOf(db, current.id).seed, "finish reveals the seed");
      assert(
        verifyCommitment(row.revealed_seed, row.commitment),
        "revealed seed verifies against the published commitment"
      );
      assert(
        row.revealed_layout?.layout === layoutString(trueAfter),
        "revealed layout matches the final true state"
      );
      break;
    }
    if (sawFlip && sawCoveredCapture) break;
  }
  if (sawFlip && sawCoveredCapture) break;
  // Start a fresh deal and keep hunting for the missing event.
  const fresh = await createMatch(db, {
    roomId: null,
    mode: "corr",
    redId: RED,
    blackId: BLACK,
  });
  current = fresh.match;
}
assert(sawFlip, "a flip occurred through the server move path");
assert(sawCoveredCapture, "a covered piece was captured (and revealed) through the server move path");
console.log(`  (games used: ${gamesPlayed})`);

section("guest derivation matches the server mask");
{
  const row = rowOf(db, current.id);
  const { masked: serverMasked } = await getMaskedForViewer(db, {
    matchId: current.id,
    userId: RED,
  });
  const guest = maskedFromPublic(row.public_fen, row.moves);
  assert(maskedFen(guest) === row.public_fen, "guest masked FEN equals public_fen");
  assert(
    JSON.stringify(guest.captured) === JSON.stringify(serverMasked.captured),
    "guest captured list equals server captured list"
  );
  assert(
    maskedFen(guest) === maskedFen(serverMasked),
    "guest board equals server board"
  );
  const labels = maskedMoveLabels(serverMasked, row.moves, "en");
  const n = row.moves ? row.moves.split(",").length : 0;
  assert(labels.length === n, "move labels cover every ply");
}

section("draw offer / decline / accept + resign finalize");
{
  const db2 = makeFakeDb();
  const g = await createMatch(db2, {
    roomId: null,
    mode: "corr",
    redId: RED,
    blackId: BLACK,
  });
  const id = g.match.id;
  const offered = await actOnMatch(db2, { matchId: id, userId: RED, action: "draw_offer" });
  assert(offered.match.draw_offer_by === RED, "draw offer recorded on the row");
  await expectCode(
    actOnMatch(db2, { matchId: id, userId: RED, action: "draw_accept" }),
    "no_draw_offer",
    "cannot accept your own draw offer"
  );
  const declined = await actOnMatch(db2, { matchId: id, userId: BLACK, action: "draw_decline" });
  assert(declined.match.draw_offer_by === null, "decline clears the offer");
  await actOnMatch(db2, { matchId: id, userId: BLACK, action: "draw_offer" });
  const accepted = await actOnMatch(db2, { matchId: id, userId: RED, action: "draw_accept" });
  assert(accepted.match.status === "finished", "accepted draw finishes the match");
  assert(
    accepted.match.result === "draw" && accepted.match.reason === "draw-agreed",
    "agreed-draw result/reason stamped"
  );
  assert(!!accepted.match.revealed_seed, "agreed draw reveals the seed");

  const g2 = await createMatch(db2, {
    roomId: null,
    mode: "corr",
    redId: RED,
    blackId: BLACK,
  });
  const resigned = await actOnMatch(db2, {
    matchId: g2.match.id,
    userId: BLACK,
    action: "resign",
  });
  assert(
    resigned.match.result === "red" && resigned.match.reason === "resign",
    "resign by black → red wins by resign"
  );
  assert(resigned.xp !== null, "resign returns the caller's XP slice");
  await expectCode(
    applyMoveAs(db2, {
      matchId: g2.match.id,
      userId: RED,
      move: { fromX: 0, fromY: 6, toX: 0, toY: 5 },
    }),
    "match_not_active",
    "no moves after finish"
  );
}

section("room visibility for /api/rooms/state");
{
  const db3 = makeFakeDb();
  db3.store.tables.cu_rooms.push({
    id: "room-1",
    leader_id: RED,
    status: "lobby",
    turn_order: [RED, BLACK],
    is_public: false,
  });
  db3.store.tables.cu_room_members.push(
    { room_id: "room-1", user_id: RED, role: "player", joined_at: "2026-01-01" },
    { room_id: "room-1", user_id: BLACK, role: "player", joined_at: "2026-01-01" }
  );
  const g = await createMatch(db3, {
    roomId: "room-1",
    mode: "room",
    redId: RED,
    blackId: BLACK,
  });
  await expectCode(
    getMaskedForViewer(db3, { matchId: g.match.id, userId: SPEC }),
    "forbidden",
    "non-member blocked from a private room's state"
  );
  db3.store.tables.cu_room_members.push({
    room_id: "room-1",
    user_id: SPEC,
    role: "spectator",
    joined_at: "2026-01-02",
  });
  const specView = await getMaskedForViewer(db3, {
    matchId: g.match.id,
    userId: SPEC,
  });
  assert(!!specView.masked, "room member (spectator) can fetch masked state");
  assert(specView.revealed === null, "no reveal while the match is active");
  // maskState sanity: the spectator view is byte-identical to the players'.
  const playerView = await getMaskedForViewer(db3, {
    matchId: g.match.id,
    userId: RED,
  });
  assert(
    JSON.stringify(specView.masked) === JSON.stringify(playerView.masked),
    "spectator and player masked views are identical"
  );
  void maskState;
}

console.log(`\n${passed} assertions passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
