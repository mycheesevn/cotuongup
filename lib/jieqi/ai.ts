// Computer opponent for Cờ Úp: determinization / PIMC over the MASKED
// state, per design §4.3 (~/workspace/co-up/design.md).
//
// HONESTY INVARIANT: the AI never reads a covered piece's true identity.
// Every entry point starts from maskState(state); concrete worlds are
// SAMPLED from the public unknown multisets (remainingDark) and built with
// the core's makeState. Each sample is then searched as a perfect-
// information Jieqi game (core legalMoves/applyMove inside the sample —
// a sampled identity only ever affects play after that piece flips,
// exactly as in a real game). Root move scores are sample averages.
//
// Fully-revealed positions degenerate cleanly: the unknown multisets are
// empty, every "sample" is the position itself, and the search is a plain
// negamax.
//
// REPETITION STEERING (ruling 7 addendum, MANDATORY): root move choice
// goes through steerMoves() — a move whose resulting MASKED position key
// would reach a 3rd occurrence is excluded while any alternative exists,
// a 2nd occurrence costs −50cp, and when the opponent has just repeated
// a position the AI gets a deviation bonus for replying with a novel
// position. Levels 1–2 keep only the 3rd-occurrence exclusion.
//
// Performance note: the core's legalMoves/isInCheck are built for
// correctness (full pseudo-move generation per candidate). This module
// carries its own fast attack test (isAttackedFast / legalMovesFast,
// fuzz-verified against the core in scripts/agent-a-test.ts) used only
// INSIDE the search; root moves always come from the core's legalMoves.

import { applyMove, gameStatus, legalMoves, pseudoMoves, findGeneral } from "./core/engine";
import { maskState } from "./core/mask";
import { makeState, type Placement } from "./core/build";
import { maskedFen } from "./core/fen";
import { rngFromSeed, seedFromString, shuffle } from "./core/rng";
import { positionKey } from "./core/engine";
import { remainingDark } from "./engine";
import { evaluatePublic, evaluatePublicFor, evaluateSampledFor } from "./evaluate";
import type {
  Color,
  JBoard,
  JieqiState,
  JPiece,
  Level,
  MaskedState,
  Move,
  PieceType,
} from "./types";

const MATE = 100000;
/** Scores with |s| > MATE_BOUND are mate scores. */
const MATE_BOUND = MATE - 1000;

/**
 * Material values (the core evaluator's scale: PIECE_VALUES in
 * lib/jieqi/core/evaluate.ts, with K priceless → 0 here as in PacClone).
 * Note vs PacClone: C 285→300, N 270→285, P 30→60 — the verified Jieqi
 * core's values win.
 */
export const VALUES: Record<PieceType, number> = {
  K: 0,
  R: 600,
  C: 300,
  N: 285,
  B: 120,
  A: 120,
  P: 60,
};

export interface LevelConfig {
  level: number;
  label: string;
  description: string;
  /** Negamax depth (plies) searched inside each sampled world. */
  depth: number;
  jitter: number;
  /** Max search time in ms; 0 = no cap. */
  timeCapMs: number;
  /** Target number of determinization samples (adaptive under the cap). */
  samples: number;
  /** Quiescence search at the horizon (captures + check evasions). */
  useQuiescence: boolean;
  /** Two-stage PIMC (high levels): shallow stage depth used to prune the
   *  root candidate set before the deep stage. */
  stageADepth?: number;
  pruneAfterRounds?: number;
  pruneKeep?: number;
}

export const MAX_LEVEL = 12;

export const LEVELS: LevelConfig[] = [
  { level: 1, label: "Level 1", description: "Absolute beginner", depth: 1, jitter: 500, timeCapMs: 0, samples: 1, useQuiescence: false },
  { level: 2, label: "Level 2", description: "Beginner", depth: 1, jitter: 250, timeCapMs: 0, samples: 2, useQuiescence: false },
  { level: 3, label: "Level 3", description: "Casual", depth: 1, jitter: 100, timeCapMs: 0, samples: 4, useQuiescence: false },
  { level: 4, label: "Level 4", description: "Improving", depth: 2, jitter: 0, timeCapMs: 0, samples: 4, useQuiescence: false },
  { level: 5, label: "Level 5", description: "Club player", depth: 2, jitter: 120, timeCapMs: 900, samples: 6, useQuiescence: false },
  { level: 6, label: "Level 6", description: "Strong club player", depth: 2, jitter: 40, timeCapMs: 1200, samples: 8, useQuiescence: false },
  { level: 7, label: "Level 7", description: "Expert", depth: 3, jitter: 0, timeCapMs: 2500, samples: 16, useQuiescence: false },
  { level: 8, label: "Level 8", description: "Candidate master", depth: 3, jitter: 0, timeCapMs: 3500, samples: 28, useQuiescence: true },
  { level: 9, label: "Level 9", description: "Master", depth: 4, jitter: 0, timeCapMs: 4500, samples: 48, useQuiescence: true, stageADepth: 2, pruneAfterRounds: 8, pruneKeep: 10 },
  { level: 10, label: "Level 10", description: "Grandmaster", depth: 4, jitter: 0, timeCapMs: 6000, samples: 80, useQuiescence: true, stageADepth: 2, pruneAfterRounds: 8, pruneKeep: 8 },
  { level: 11, label: "Level 11", description: "Relentless", depth: 5, jitter: 0, timeCapMs: 8000, samples: 128, useQuiescence: true, stageADepth: 2, pruneAfterRounds: 8, pruneKeep: 6 },
  { level: 12, label: "Level 12", description: "Nightmare", depth: 6, jitter: 0, timeCapMs: 10000, samples: 192, useQuiescence: true, stageADepth: 2, pruneAfterRounds: 8, pruneKeep: 6 },
];

export function getLevelConfig(level: Level): LevelConfig {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  return LEVELS[clamped - 1];
}

// ---------------------------------------------------------------------------
// Fast legality (search-internal; semantics mirror core pieceMoves exactly,
// including covered pieces moving as their host and the Jieqi relaxations
// for revealed advisors/elephants). Fuzz-verified against the core.
// ---------------------------------------------------------------------------

function inBoardF(x: number, y: number): boolean {
  return x >= 0 && x < 9 && y >= 0 && y < 10;
}
function inPalaceF(color: Color, x: number, y: number): boolean {
  if (x < 3 || x > 5) return false;
  return color === "black" ? y >= 0 && y <= 2 : y >= 7 && y <= 9;
}
function crossedRiverF(color: Color, y: number): boolean {
  return color === "red" ? y <= 4 : y >= 5;
}
function eff(p: JPiece): PieceType {
  return p.covered ? p.fakeType : p.trueType;
}

const ORTHO_F: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
const DIAG1_F: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const KNIGHT_F: ReadonlyArray<readonly [number, number]> = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

/** Direct attack test: is (x, y) attacked by any piece of byColor? */
export function isAttackedFast(
  board: JBoard,
  x: number,
  y: number,
  byColor: Color
): boolean {
  const target = board[y][x];
  if (target && target.color === byColor) return false;

  // Pawns: forward from behind; sideways once across the river (a covered
  // pawn sits on its home square, never across — handled naturally).
  const behindY = byColor === "red" ? y + 1 : y - 1;
  if (behindY >= 0 && behindY < 10) {
    const p = board[behindY][x];
    if (p && p.color === byColor && eff(p) === "P") return true;
  }
  if (crossedRiverF(byColor, y)) {
    for (const sx of [x - 1, x + 1]) {
      if (sx < 0 || sx > 8) continue;
      const p = board[y][sx];
      if (p && p.color === byColor && eff(p) === "P") return true;
    }
  }

  // Knights (leg square from the knight's perspective).
  for (const [dx, dy] of KNIGHT_F) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBoardF(nx, ny)) continue;
    const p = board[ny][nx];
    if (!p || p.color !== byColor || eff(p) !== "N") continue;
    const legX = Math.abs(dx) === 2 ? nx - dx / 2 : nx;
    const legY = Math.abs(dy) === 2 ? ny - dy / 2 : ny;
    if (!board[legY][legX]) return true;
  }

  // Advisors: covered (host) advisors are palace-bound; revealed are free.
  for (const [dx, dy] of DIAG1_F) {
    const ax = x + dx;
    const ay = y + dy;
    if (!inBoardF(ax, ay)) continue;
    const p = board[ay][ax];
    if (p && p.color === byColor && eff(p) === "A") {
      if (!p.covered || inPalaceF(byColor, x, y)) return true;
    }
  }

  // Elephants: eye must be clear; covered (host) elephants are river-bound.
  for (const [dx, dy] of DIAG1_F) {
    const ex = x + 2 * dx;
    const ey = y + 2 * dy;
    if (!inBoardF(ex, ey)) continue;
    const p = board[ey][ex];
    if (!p || p.color !== byColor || eff(p) !== "B") continue;
    if (board[y + dy][x + dx]) continue;
    if (p.covered) {
      if (byColor === "black" && y > 4) continue;
      if (byColor === "red" && y < 5) continue;
    }
    return true;
  }

  // Rooks, cannons, generals along the four rays.
  const targetOccupied = !!target;
  for (const [dx, dy] of ORTHO_F) {
    let nx = x + dx;
    let ny = y + dy;
    let dist = 1;
    let screens = 0;
    while (inBoardF(nx, ny)) {
      const p = board[ny][nx];
      if (p) {
        if (screens === 0) {
          if (p.color === byColor) {
            const t = eff(p);
            if (t === "R") return true;
            if (t === "C" && !targetOccupied) return true;
            if (t === "K") {
              if (dist === 1 && inPalaceF(byColor, x, y)) return true;
              if (
                dx === 0 &&
                target &&
                target.trueType === "K" &&
                target.color !== byColor
              ) {
                return true; // flying generals
              }
            }
          }
          screens = 1;
        } else {
          if (p.color === byColor && eff(p) === "C" && targetOccupied) {
            return true; // capture over exactly one screen
          }
          break;
        }
      }
      nx += dx;
      ny += dy;
      dist++;
    }
  }
  return false;
}

export function isInCheckFast(board: JBoard, color: Color): boolean {
  const k = findGeneral(board, color);
  if (!k) return false;
  return isAttackedFast(board, k.x, k.y, color === "red" ? "black" : "red");
}

/** Board after a move, legality view only (mirrors core boardAfterMove:
 *  a covered mover flips face-up). */
function boardAfterLocal(board: JBoard, m: Move): JBoard {
  const nb = board.map((row) => row.slice());
  const piece = nb[m.fromY][m.fromX];
  if (piece && piece.covered) {
    nb[m.toY][m.toX] = { ...piece, covered: false };
  } else {
    nb[m.toY][m.toX] = piece;
  }
  nb[m.fromY][m.fromX] = null;
  return nb;
}

/** Legal moves via core pseudoMoves + the fast attack test. */
export function legalMovesFast(state: JieqiState): Move[] {
  const turn = state.turn;
  return pseudoMoves(state.board, turn).filter(
    (m) => !isInCheckFast(boardAfterLocal(state.board, m), turn)
  );
}

function legalCapturesFast(state: JieqiState): Move[] {
  const turn = state.turn;
  return pseudoMoves(state.board, turn).filter(
    (m) =>
      !!state.board[m.toY][m.toX] &&
      !isInCheckFast(boardAfterLocal(state.board, m), turn)
  );
}

// ---------------------------------------------------------------------------
// Determinization: sample concrete worlds consistent with public info.
// ---------------------------------------------------------------------------

/**
 * Build ONE sampled true state from a masked state: covered squares get a
 * random assignment of their side's unknown multiset (shuffled with `rng`).
 * Exported for tests/diagnostics; the AI uses it internally per round.
 */
export function buildSample(masked: MaskedState, rng: () => number): JieqiState {
  const counts = remainingDark(masked);
  const pools: Record<Color, PieceType[]> = { red: [], black: [] };
  for (const color of ["red", "black"] as const) {
    for (const t of Object.keys(counts[color]) as PieceType[]) {
      for (let i = 0; i < Math.max(0, counts[color][t]); i++) {
        pools[color].push(t);
      }
    }
    shuffle(pools[color], rng);
  }
  const idx: Record<Color, number> = { red: 0, black: 0 };
  const placements: Placement[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const cell = masked.board[y][x];
      if (!cell) continue;
      if (cell.covered) {
        // Fallback "P" only for non-standard setup positions whose covered
        // count exceeds the standard unknown multiset (real games match).
        const t = pools[cell.color][idx[cell.color]++] ?? "P";
        placements.push({
          x, y, color: cell.color, trueType: t, covered: true,
          fakeType: cell.fakeType,
        });
      } else {
        placements.push({
          x, y, color: cell.color,
          trueType: cell.trueType as PieceType,
          covered: false, fakeType: cell.fakeType,
        });
      }
    }
  }
  const captured: JPiece[] = masked.captured.map((c, i) => ({
    id: 1000 + i,
    color: c.color,
    trueType: c.trueType,
    fakeType: c.trueType,
    covered: c.wasCovered,
  }));
  return makeState(placements, {
    turn: masked.turn,
    pliesSinceCaptureOrFlip: masked.pliesSinceCaptureOrFlip,
    moveNumber: masked.moveNumber,
    captured,
  });
}

// ---------------------------------------------------------------------------
// Negamax + quiescence inside ONE sampled world.
// ---------------------------------------------------------------------------

interface SearchCtx {
  nodes: number;
  deadline: number;
  aborted: boolean;
  useQuiescence: boolean;
}

function checkAbort(ctx: SearchCtx): boolean {
  if ((ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) ctx.aborted = true;
  return ctx.aborted;
}

function orderMoves(state: JieqiState, moves: Move[]): void {
  const scored = moves.map((m) => {
    const victim = state.board[m.toY][m.toX];
    let s = 0;
    if (victim) {
      const vVal = victim.covered
        ? VALUES[victim.fakeType]
        : VALUES[victim.trueType];
      const mover = state.board[m.fromY][m.fromX];
      const aVal = mover ? VALUES[eff(mover)] : 60;
      s = 2000000 + 10 * vVal - aVal;
    }
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  for (let i = 0; i < moves.length; i++) moves[i] = scored[i].m;
}

function quiescence(
  state: JieqiState,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchCtx
): number {
  if (checkAbort(ctx)) return 0;
  ctx.nodes++;
  const inCheck = isInCheckFast(state.board, state.turn);
  if (state.pliesSinceCaptureOrFlip >= 120 && !inCheck) return 0;
  if (inCheck) {
    const evasions = legalMovesFast(state);
    if (evasions.length === 0) return -MATE + ply;
    if (ply >= 24) return evaluateSampledFor(state, state.turn);
    orderMoves(state, evasions);
    let best = -Infinity;
    for (const m of evasions) {
      const s = -quiescence(applyMove(state, m).state, -beta, -alpha, ply + 1, ctx);
      if (ctx.aborted) return 0;
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    return best;
  }
  const standPat = evaluateSampledFor(state, state.turn);
  if (ply >= 24) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  const captures = legalCapturesFast(state);
  orderMoves(state, captures);
  let best = standPat;
  for (const m of captures) {
    const victim = state.board[m.toY][m.toX] as JPiece;
    const vVal = victim.covered
      ? VALUES[victim.fakeType]
      : VALUES[victim.trueType];
    if (standPat + vVal + 200 < alpha) continue; // delta pruning
    const s = -quiescence(applyMove(state, m).state, -beta, -alpha, ply + 1, ctx);
    if (ctx.aborted) return 0;
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

function negamax(
  state: JieqiState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchCtx
): number {
  if (checkAbort(ctx)) return 0;
  ctx.nodes++;
  if (depth <= 0) {
    if (state.pliesSinceCaptureOrFlip >= 120) {
      // Boundary-ply precedence (mate beats draw) is approximated at the
      // horizon: an in-check side still gets its quiescence/eval say.
      if (!isInCheckFast(state.board, state.turn)) return 0;
    }
    return ctx.useQuiescence
      ? quiescence(state, alpha, beta, ply, ctx)
      : evaluateSampledFor(state, state.turn);
  }
  const moves = legalMovesFast(state);
  if (moves.length === 0) return -MATE + ply; // checkmate or stalemate
  if (state.pliesSinceCaptureOrFlip >= 120) return 0;
  orderMoves(state, moves);
  let best = -Infinity;
  for (const m of moves) {
    const s = -negamax(applyMove(state, m).state, depth - 1, -beta, -alpha, ply + 1, ctx);
    if (ctx.aborted) return 0;
    if (s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// PIMC root: average per-move scores over sampled worlds.
// ---------------------------------------------------------------------------

export interface ScoredMove {
  move: Move;
  /** Sample-averaged centipawns from the side-to-move's perspective. */
  score: number;
  /** Completed sample rounds that contributed to this score. */
  rounds: number;
}

interface PimcOptions {
  samples: number;
  depth: number;
  stageADepth?: number;
  pruneAfterRounds?: number;
  pruneKeep?: number;
  useQuiescence: boolean;
  deadline: number;
  rng: () => number;
  firstMove?: Move | null;
}

interface PimcResult {
  scored: ScoredMove[];
  nodes: number;
  roundsCompleted: number;
  plannedSamples: number;
  aborted: boolean;
}

const moveKey = (m: Move): string =>
  `${m.fromX},${m.fromY},${m.toX},${m.toY}`;

function sameMove(a: Move | null | undefined, b: Move | null | undefined): boolean {
  return (
    !!a && !!b &&
    a.fromX === b.fromX && a.fromY === b.fromY &&
    a.toX === b.toX && a.toY === b.toY
  );
}

function pimcRoot(state: JieqiState, opts: PimcOptions): PimcResult {
  const masked = maskState(state);
  const rootMoves = legalMoves(state); // core, authoritative
  const empty: PimcResult = {
    scored: [], nodes: 0, roundsCompleted: 0,
    plannedSamples: opts.samples, aborted: false,
  };
  if (rootMoves.length === 0) return empty;

  const ctx: SearchCtx = {
    nodes: 0, deadline: opts.deadline, aborted: false,
    useQuiescence: opts.useQuiescence,
  };
  type Acc = { sum: number; rounds: number };
  const shallow = new Map<string, Acc>();
  const deep = new Map<string, Acc>();
  const twoStage =
    opts.stageADepth !== undefined &&
    opts.stageADepth < opts.depth &&
    (opts.pruneKeep ?? 0) > 0;
  let stage: 0 | 1 = twoStage ? 0 : 1;
  let candidates = rootMoves.slice();
  if (opts.firstMove) {
    candidates.sort((a, b) =>
      sameMove(a, opts.firstMove) ? -1 : sameMove(b, opts.firstMove) ? 1 : 0
    );
  }
  let roundsCompleted = 0;
  let shallowRounds = 0;

  for (let round = 0; round < opts.samples; round++) {
    if (round > 0 && Date.now() > opts.deadline) {
      ctx.aborted = true;
      break;
    }
    const sample = buildSample(masked, opts.rng);
    const d = stage === 0 ? (opts.stageADepth as number) : opts.depth;
    const acc = stage === 0 ? shallow : deep;
    const roundScores: { m: Move; v: number }[] = [];
    let roundAborted = false;
    for (const m of candidates) {
      const next = applyMove(sample, m).state;
      const v = -negamax(next, d - 1, -Infinity, Infinity, 1, ctx);
      if (ctx.aborted) {
        roundAborted = true;
        break;
      }
      roundScores.push({ m, v });
    }
    if (roundAborted) break; // discard the partial round entirely
    for (const { m, v } of roundScores) {
      const k = moveKey(m);
      const a = acc.get(k) ?? { sum: 0, rounds: 0 };
      a.sum += v;
      a.rounds++;
      acc.set(k, a);
    }
    roundsCompleted++;
    if (stage === 0) {
      shallowRounds++;
      if (shallowRounds >= (opts.pruneAfterRounds ?? 4)) {
        const avg = (m: Move): number => {
          const a = shallow.get(moveKey(m));
          return a && a.rounds > 0 ? a.sum / a.rounds : -Infinity;
        };
        candidates = candidates
          .slice()
          .sort((a, b) => avg(b) - avg(a))
          .slice(0, opts.pruneKeep);
        stage = 1;
      }
    }
  }

  const scored: ScoredMove[] = rootMoves.map((m) => {
    const k = moveKey(m);
    const da = deep.get(k);
    if (da && da.rounds > 0) {
      return { move: m, score: da.sum / da.rounds, rounds: da.rounds };
    }
    const sa = shallow.get(k);
    if (sa && sa.rounds > 0) {
      return { move: m, score: sa.sum / sa.rounds, rounds: sa.rounds };
    }
    // No completed round (deadline hit immediately): 1-ply public eval.
    const next = applyMove(state, m).state;
    return { move: m, score: -evaluatePublic(next), rounds: 0 };
  });

  return {
    scored,
    nodes: ctx.nodes,
    roundsCompleted,
    plannedSamples: opts.samples,
    aborted: ctx.aborted,
  };
}

// ---------------------------------------------------------------------------
// Repetition steering (ruling 7 addendum) — exported per the contract.
// ---------------------------------------------------------------------------

export interface SteeredMove extends ScoredMove {
  /** Score after repetition penalty / deviation bonus. */
  adjusted: number;
  /** Masked-position occurrence count the move would reach (>= 1). */
  repetitionCountAfter: number;
  /** True when the move reaches a 3rd occurrence (excluded if any
   *  non-excluded alternative exists). */
  excluded: boolean;
}

/**
 * Apply repetition steering to scored root moves.
 *
 * Counts use MASKED position keys (public information): the occurrences of
 * the resulting masked key in state.maskedKeyHistory, plus the move itself.
 * `opts.seen`, when given, REPLACES the history-derived counts — a
 * Map from masked position key (core positionKey(board, turn, true)) to
 * its occurrence count, for callers that track history themselves.
 *
 * - full mode (levels >= 3, the default): 3rd occurrence excluded,
 *   2nd occurrence −50cp, and a +40cp deviation bonus for moves reaching a
 *   novel position when the current position has already occurred before
 *   (i.e. the opponent just repeated — the AI proactively changes line).
 * - light mode (full: false; levels 1–2): only the exclusion applies.
 */
export function steerMoves(
  state: JieqiState,
  scored: ScoredMove[],
  opts?: { full?: boolean; seen?: Map<string, number> }
): SteeredMove[] {
  const full = opts?.full ?? true;
  const histCounts = new Map<string, number>();
  for (const k of state.maskedKeyHistory) {
    histCounts.set(k, (histCounts.get(k) ?? 0) + 1);
  }
  const currentKey =
    state.maskedKeyHistory[state.maskedKeyHistory.length - 1];
  const currentCount = opts?.seen
    ? (opts.seen.get(currentKey) ?? histCounts.get(currentKey) ?? 1)
    : (histCounts.get(currentKey) ?? 1);
  const opponentRepeating = currentCount >= 2;

  return scored.map((sm) => {
    const next = applyMove(state, sm.move).state;
    const keyAfter = positionKey(next.board, next.turn, true);
    const before = opts?.seen
      ? (opts.seen.get(keyAfter) ?? histCounts.get(keyAfter) ?? 0)
      : (histCounts.get(keyAfter) ?? 0);
    const repetitionCountAfter = before + 1;
    const excluded = repetitionCountAfter >= 3;
    let adjusted = sm.score;
    if (full) {
      if (repetitionCountAfter === 2) adjusted -= 50;
      if (opponentRepeating && repetitionCountAfter === 1) adjusted += 40;
    }
    return { ...sm, adjusted, repetitionCountAfter, excluded };
  });
}

/** Pick the steered winner: best adjusted non-excluded move; if every
 *  move is excluded, the least-bad excluded one (no draw is adjudicated). */
function pickSteered(steered: SteeredMove[], jitter: number): SteeredMove | null {
  if (steered.length === 0) return null;
  const open = steered.filter((s) => !s.excluded);
  const pool = open.length > 0 ? open : steered;
  let best: SteeredMove | null = null;
  let bestVal = -Infinity;
  for (const s of pool) {
    const v = jitter > 0 ? s.adjusted + Math.random() * jitter : s.adjusted;
    if (v > bestVal) {
      bestVal = v;
      best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public API (signatures adapted from PacClone's board-based ones:
// PacClone took (board, turn, ...); here the JieqiState carries the turn).
// ---------------------------------------------------------------------------

export interface SearchStats {
  nodes: number;
  depth: number;
  timeMs: number;
}

/**
 * Best move for the side to move at the given level (1–12).
 * PacClone signature: findBestMove(board, turn, level, seen?) — now
 * findBestMove(state, level, seen?) where `seen`, if given, maps MASKED
 * position keys to occurrence counts (see steerMoves). Null when the
 * game is already over / no legal moves exist.
 */
export function findBestMove(
  state: JieqiState,
  level: Level,
  seen?: Map<string, number>
): { move: Move | null; stats: SearchStats } {
  const t0 = Date.now();
  const cfg = getLevelConfig(level);
  const done = (
    move: Move | null,
    nodes: number
  ): { move: Move | null; stats: SearchStats } => ({
    move,
    stats: { nodes, depth: cfg.depth, timeMs: Date.now() - t0 },
  });
  if (gameStatus(state).over) return done(null, 0);
  const rng = rngFromSeed(
    (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  );
  const deadline =
    cfg.timeCapMs > 0 ? t0 + cfg.timeCapMs : Infinity;
  const r = pimcRoot(state, {
    samples: cfg.samples,
    depth: cfg.depth,
    stageADepth: cfg.stageADepth,
    pruneAfterRounds: cfg.pruneAfterRounds,
    pruneKeep: cfg.pruneKeep,
    useQuiescence: cfg.useQuiescence,
    deadline,
    rng,
  });
  if (r.scored.length === 0) return done(null, r.nodes);
  const steered = steerMoves(state, r.scored, {
    full: cfg.level >= 3,
    seen,
  });
  const pick = pickSteered(steered, cfg.jitter);
  return done(pick?.move ?? null, r.nodes);
}

export interface PositionAnalysis {
  bestMove: Move | null;
  /** Centipawns from the side-to-move's perspective. */
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

/**
 * Deterministic PIMC analysis (iterative deepening 2→4 over 20 samples,
 * seeded by the masked position so repeat calls agree). Used by the
 * analysis view and the live-eval worker path.
 */
export function analyzePosition(
  state: JieqiState,
  timeCapMs = 4000
): PositionAnalysis {
  const t0 = Date.now();
  const status = gameStatus(state);
  if (status.over) {
    return {
      bestMove: null,
      score: status.winner === null ? 0 : -MATE,
      depth: 0,
      nodes: 0,
      timeMs: 0,
    };
  }
  const deadline = t0 + Math.max(50, timeCapMs);
  const seedBase = seedFromString(maskedFen(maskState(state)));
  let best: PositionAnalysis = {
    bestMove: null, score: 0, depth: 0, nodes: 0, timeMs: 0,
  };
  let totalNodes = 0;
  for (const d of [2, 3, 4]) {
    if (d > 2 && Date.now() > t0 + timeCapMs * 0.6) break;
    const rng = rngFromSeed((seedBase ^ Math.imul(d, 0x85ebca6b)) >>> 0);
    const r = pimcRoot(state, {
      samples: 20,
      depth: d,
      useQuiescence: d >= 3,
      deadline,
      rng,
    });
    totalNodes += r.nodes;
    const top = r.scored.slice().sort((a, b) => b.score - a.score)[0];
    if (top) {
      best = {
        bestMove: top.move,
        score: top.score,
        depth: d,
        nodes: totalNodes,
        timeMs: Date.now() - t0,
      };
    }
    if (r.aborted) break;
    if (top && Math.abs(top.score) > MATE_BOUND) break;
  }
  return best;
}

export interface DepthSearchResult {
  move: Move | null;
  /** Centipawns from the side-to-move's perspective. */
  score: number;
  stats: SearchStats;
  /** False when the time cap cut the planned sample rounds short. */
  completed: boolean;
}

/**
 * Single-depth deterministic PIMC search, for hints (the worker in
 * hint.worker.ts iterative-deepens this). PacClone signature was
 * searchDepthQ(board, turn, depth, timeCapMs, firstMove?) — now
 * searchDepthQ(state, depth, timeCapMs, firstMove?).
 */
export function searchDepthQ(
  state: JieqiState,
  depth: number,
  timeCapMs: number,
  firstMove?: Move | null
): DepthSearchResult {
  const t0 = Date.now();
  const status = gameStatus(state);
  if (status.over) {
    return {
      move: null,
      score: status.winner === null ? 0 : -MATE,
      stats: { nodes: 0, depth, timeMs: Date.now() - t0 },
      completed: true,
    };
  }
  const samples = depth <= 1 ? 4 : depth === 2 ? 8 : depth === 3 ? 16 : 24;
  const rng = rngFromSeed(
    (seedFromString(maskedFen(maskState(state))) ^
      Math.imul(depth, 0x85ebca6b)) >>>
      0
  );
  const r = pimcRoot(state, {
    samples,
    depth,
    useQuiescence: depth >= 3,
    deadline: t0 + Math.max(50, timeCapMs),
    rng,
    firstMove,
  });
  const top = r.scored.slice().sort((a, b) => b.score - a.score)[0];
  return {
    move: top?.move ?? null,
    score: top?.score ?? 0,
    stats: { nodes: r.nodes, depth, timeMs: Date.now() - t0 },
    completed: r.roundsCompleted >= samples,
  };
}

/** Public-information static evaluation (side-to-move perspective). */
export function evaluateBelief(state: JieqiState): number {
  return evaluatePublic(state);
}

export { evaluatePublicFor };
