// Agent A verification: adapter + PIMC AI + mate solver + fast-legality fuzz.
// Run: cd ~/workspace/co-up/engine && npx tsx ~/workspace/cotuongup/scripts/agent-a-test.ts
import {
  applyMove,
  createGame,
  gameStatus,
  isAttacked,
  legalMoves,
  makeState,
  maskState,
  parseFen,
  positionKey,
  toFen,
} from "../lib/jieqi/core/index";
import { maskedFen } from "../lib/jieqi/core/fen";
import {
  capturedLists,
  initialState,
  remainingDark,
  remainingDarkList,
  viewBoard,
  viewBoardMasked,
} from "../lib/jieqi/engine";
import { INITIAL_PUBLIC_FEN, initialPublicFen } from "../lib/jieqi/fen";
import {
  buildSample,
  findBestMove,
  isAttackedFast,
  isInCheckFast,
  legalMovesFast,
  steerMoves,
  type ScoredMove,
} from "../lib/jieqi/ai";
import { findMate, findMateMove, mateIn } from "../lib/jieqi/mate";
import { moveEntryText } from "../lib/jieqi/notation";
import { rngFromSeed } from "../lib/jieqi/core/rng";
import type { JieqiState, Move } from "../lib/jieqi/types";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ok  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label} ${extra}`);
  }
}
const key = (m: Move) => `${m.fromX},${m.fromY}->${m.toX},${m.toY}`;

// ---------------------------------------------------------------- adapter
console.log("== adapter ==");
{
  check(
    "initialPublicFen matches design string",
    initialPublicFen() ===
      "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1" &&
      INITIAL_PUBLIC_FEN === initialPublicFen()
  );
  const a = initialState(42);
  const b = initialState(42);
  check("initialState(seed) deterministic", toFen(a) === toFen(b));
  check(
    "masked initial FEN is the public string",
    maskedFen(maskState(a)) === initialPublicFen()
  );
  const vb = viewBoard(a);
  const vm = viewBoardMasked(maskState(a));
  let leak = false;
  let viewsAgree = true;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = a.board[y][x];
      const v = vb[y][x];
      const w = vm[y][x];
      if (!p) {
        if (v || w) viewsAgree = false;
        continue;
      }
      if (!v || !w) {
        viewsAgree = false;
        continue;
      }
      if (p.covered && v.faceType !== p.fakeType) leak = true;
      if (v.faceType !== w.faceType || v.covered !== w.covered || v.hostType !== w.hostType) {
        viewsAgree = false;
      }
      if (v.id !== p.id) viewsAgree = false;
    }
  }
  check("viewBoard: covered faceType == hostType (no leak)", !leak);
  check("viewBoard == viewBoardMasked (faces/hosts/ids)", viewsAgree);

  const rd = remainingDark(a);
  check(
    "remainingDark initial = full multiset",
    rd.red.R === 2 && rd.red.P === 5 && rd.black.C === 2 && rd.red.K === 0 &&
      remainingDarkList(a).red.length === 15 &&
      remainingDarkList(a).black.length === 15
  );
  check(
    "remainingDark identical from masked state",
    JSON.stringify(remainingDark(maskState(a))) === JSON.stringify(rd)
  );
  check(
    "capturedLists empty at start",
    capturedLists(a).red.length === 0 && capturedLists(a).black.length === 0
  );
  // FEN round-trip through the adapter's core re-exports
  const s2 = parseFen(toFen(a));
  check("full FEN round-trips", toFen(s2) === toFen(a));
}

// ------------------------------------------------------- fast legality fuzz
console.log("== fast legality fuzz (vs core) ==");
{
  let moveSets = 0;
  let attackChecks = 0;
  let mismatches = 0;
  let state = createGame(99);
  const rnd = rngFromSeed(1234);
  for (let game = 0; game < 6; game++) {
    state = createGame(100 + game);
    for (let ply = 0; ply < 120; ply++) {
      const core = legalMoves(state).map(key).sort();
      const fast = legalMovesFast(state).map(key).sort();
      moveSets++;
      if (JSON.stringify(core) !== JSON.stringify(fast)) {
        mismatches++;
        if (mismatches <= 2) {
          console.log("  moveset mismatch", JSON.stringify({ core, fast }));
        }
      }
      // attack test on every square, both colors, every few plies
      if (ply % 3 === 0) {
        for (const color of ["red", "black"] as const) {
          for (let y = 0; y < 10; y++) {
            for (let x = 0; x < 9; x++) {
              attackChecks++;
              if (
                isAttacked(state.board, x, y, color) !==
                isAttackedFast(state.board, x, y, color)
              ) {
                mismatches++;
              }
            }
          }
          if (
            // core isInCheck(board, color)
            (legalMoves(state).length >= 0 &&
              // compare via gameStatus for side to move only
              true)
          ) {
            // noop guard
          }
        }
        const st = gameStatus(state);
        if (st.inCheck !== isInCheckFast(state.board, state.turn)) mismatches++;
      }
      if (gameStatus(state).over) break;
      const ms = legalMoves(state);
      state = applyMove(state, ms[Math.floor(rnd() * ms.length)]).state;
    }
  }
  console.log(`  compared ${moveSets} move sets, ${attackChecks} attack squares`);
  check("fast legality == core legality", mismatches === 0, `mismatches=${mismatches}`);
}

// ------------------------------------------------------------- sample sanity
console.log("== determinization samples ==");
{
  const s = initialState(7);
  const masked = maskState(s);
  const rng = rngFromSeed(5);
  let okCount = true;
  let okMask = true;
  for (let i = 0; i < 30; i++) {
    const sample = buildSample(masked, rng);
    // piece accounting: 32 pieces, same covered squares/colors/hosts
    let n = 0;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 9; x++) {
        const p = sample.board[y][x];
        const mc = masked.board[y][x];
        if (p) n++;
        if (!!p !== !!mc) okMask = false;
        if (p && mc && (p.color !== mc.color || p.covered !== mc.covered || p.fakeType !== mc.fakeType)) {
          okMask = false;
        }
      }
    }
    if (n !== 32) okCount = false;
    // sample must itself be a legal position: legalMoves computable
    if (legalMoves(sample).length === 0) okMask = false;
  }
  check("samples keep 32 pieces", okCount);
  check("samples agree with masked view (color/covered/host)", okMask);
}

// ------------------------------------------------------------ findBestMove
console.log("== findBestMove on the initial masked position ==");
for (const level of [1, 6, 12]) {
  const s = initialState(123);
  const t0 = Date.now();
  const { move, stats } = findBestMove(s, level);
  const dt = Date.now() - t0;
  const legal = legalMoves(s);
  check(
    `level ${level} returns a core-legal move`,
    !!move && legal.some((m) => key(m) === key(move)),
    `move=${move ? key(move) : "null"}`
  );
  console.log(
    `  level ${level}: move=${move ? key(move) : "-"} nodes=${stats.nodes} depth=${stats.depth} ${dt}ms`
  );
}

// ------------------------------------------------- AI-vs-AI + steering audit
console.log("== 40-ply AI-vs-AI at level 5 + repetition steering ==");
{
  let state: JieqiState = initialState(2024);
  let steeringViolations = 0;
  let plies = 0;
  for (let ply = 0; ply < 40; ply++) {
    if (gameStatus(state).over) break;
    const { move } = findBestMove(state, 5);
    if (!move) break;
    // steering audit: the played move must not reach a 3rd MASKED
    // occurrence if any legal alternative avoids it.
    const repAfterOf = (st: JieqiState, m: Move): number => {
      const next = applyMove(st, m).state;
      const k = positionKey(next.board, next.turn, true);
      return next.maskedKeyHistory.filter((h) => h === k).length;
    };
    const rep = repAfterOf(state, move);
    if (rep >= 3) {
      const hasAlternative = legalMoves(state).some(
        (m) => repAfterOf(state, m) < 3
      );
      if (hasAlternative) steeringViolations++;
    }
    state = applyMove(state, move).state;
    plies++;
  }
  console.log(`  played ${plies} plies, status=${JSON.stringify(gameStatus(state))}`);
  check("AI-vs-AI played plies without crashing", plies >= 20, `plies=${plies}`);
  check("steering never chose a 3rd occurrence with an alternative", steeringViolations === 0);
}

// steerMoves unit: penalty / exclusion / deviation on a fabricated history
{
  let s = initialState(3);
  // fabricate: pretend the current masked key occurred twice already
  const curKey = s.maskedKeyHistory[s.maskedKeyHistory.length - 1];
  s = { ...s, maskedKeyHistory: [...s.maskedKeyHistory, curKey] };
  const moves = legalMoves(s);
  const scored: ScoredMove[] = moves.map((m, i) => ({ move: m, score: i * 10, rounds: 1 }));
  const steered = steerMoves(s, scored, { full: true });
  check(
    "steerMoves: deviation bonus for novel replies when opponent repeats",
    steered.every(
      (sm) =>
        sm.repetitionCountAfter !== 1 || sm.adjusted === sm.score + 40
    )
  );
  const light = steerMoves(s, scored, { full: false });
  check(
    "steerMoves light mode: no penalty/bonus, exclusion only",
    light.every((sm) => sm.adjusted === sm.score && sm.excluded === (sm.repetitionCountAfter >= 3))
  );
}

// ---------------------------------------------------------------- mate solver
console.log("== mate solver (fully-revealed fixture) ==");
{
  // Core checkmate fixture with the mating rook pulled back to (0,2):
  // R(0,2)->(4,2) is checkmate in 1.
  const fixture = makeState(
    [
      { x: 4, y: 0, color: "black", trueType: "K" },
      { x: 0, y: 2, color: "red", trueType: "R" },
      { x: 3, y: 5, color: "red", trueType: "R" },
      { x: 5, y: 8, color: "red", trueType: "C" },
      { x: 5, y: 4, color: "red", trueType: "P" },
      { x: 0, y: 9, color: "red", trueType: "K" },
    ],
    { turn: "red" }
  );
  const m1 = findMateMove(fixture, 1);
  check("findMateMove finds a mate-in-1", !!m1, `got ${m1 ? key(m1) : "null"}`);
  if (m1) {
    const after = applyMove(fixture, m1).state;
    const st = gameStatus(after);
    check(
      "the found move really checkmates",
      st.over && st.winner === "red" && st.reason === "checkmate",
      JSON.stringify(st)
    );
  }
  check("findMate alias agrees", !!findMate(fixture, 1));
  const mi = mateIn(fixture, 2);
  check("mateIn reports mateIn=1", !!mi && mi.mateIn === 1);
  check(
    "no mate-in-1 from the initial position",
    findMateMove(initialState(1), 1) === null
  );
}

// ---------------------------------------------------------------- notation
console.log("== notation flip suffix ==");
{
  const s = initialState(11);
  const covered = legalMoves(s).find((m) => s.board[m.fromY][m.fromX]?.covered);
  check("initial position has a covered mover", !!covered);
  if (covered) {
    const rec = applyMove(s, covered).record;
    const piece = s.board[covered.fromY][covered.fromX]!;
    const text = moveEntryText(piece.color, piece.fakeType, covered, "vi", rec);
    check(
      "flip suffix appended (=<revealed type, vi)",
      rec.flipped && text.includes("="),
      text
    );
    const plain = moveEntryText(piece.color, piece.fakeType, covered, "vi");
    check("no suffix without record", !plain.includes("="), plain);
    console.log(`  example: ${text}`);
  }
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (fail > 0) process.exit(1);
