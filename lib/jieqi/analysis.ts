// Game analysis: replay positions, per-ply engine analysis, move
// classification. Adapted from PacClone to JieqiState: a "position" is a
// full state (replay needs the true layout, so callers pass the game's
// start state — from its full FEN via parseFen — into positionAt /
// analyzePly). Move codes may be PacClone digit codes ("1747") or Jieqi
// UCI ("b9c7" / "b9c7c" with the flip suffix).

import { analyzePosition } from "./ai";
import { applyMove } from "./core/engine";
import { parseUci } from "./core/fen";
import { effectiveType } from "./core/engine";
import { initialState } from "./engine";
import type { Color, JieqiState, Move } from "./types";
import { opposite } from "./types";
import { moveEntryText } from "./notation";
import type { Lang } from "./i18n";

export const MATE_CP = 100000;

/** Decode a move code: digit code "1747" or UCI "b9c7[c]". */
export function decodeMove(code: string): Move {
  if (/^\d{4}$/.test(code)) {
    return {
      fromX: Number(code[0]),
      fromY: Number(code[1]),
      toX: Number(code[2]),
      toY: Number(code[3]),
    };
  }
  return parseUci(code).move;
}

/** UCI encoding of a move (flip suffix added when revealedType is given). */
export function encodeMove(
  move: Move,
  revealedType?: import("./types").PieceType | null
): string {
  const files = "abcdefghi";
  const base =
    files[move.fromX] + String(move.fromY) + files[move.toX] + String(move.toY);
  if (!revealedType) return base;
  const letters: Record<string, string> = {
    K: "k", R: "r", N: "n", C: "c", B: "b", A: "a", P: "p",
  };
  return base + (letters[revealedType] ?? "");
}

/**
 * State after the first `ply` moves of the game. `start` should be the
 * game's true start state; the default (a fixed seed-0 deal) exists only
 * so pure move-list utilities have a deterministic fallback.
 */
export function positionAt(
  codes: string[],
  ply: number,
  start: JieqiState = initialState(0)
): JieqiState {
  let s = start;
  const n = Math.min(ply, codes.length);
  for (let i = 0; i < n; i++) {
    s = applyMove(s, decodeMove(codes[i])).state;
  }
  return s;
}

/** Side to move at the given ply (ply 0 = `startTurn`). */
export function sideAtPly(ply: number, startTurn: Color = "red"): Color {
  return ply % 2 === 0 ? startTurn : opposite(startTurn);
}

export interface PlyAnalysis {
  ply: number;
  turn: Color;
  bestMove: Move | null;
  /** Centipawns from the side-to-move's perspective. */
  score: number;
  depth: number;
}

/** Engine analysis of the position at `ply` (bounded per-ply budget). */
export function analyzePly(
  codes: string[],
  ply: number,
  start: JieqiState = initialState(0),
  startTurn: Color = "red"
): PlyAnalysis {
  const state = positionAt(codes, ply, start);
  void startTurn; // the state's own turn is authoritative
  const r = analyzePosition(state, 1500);
  return { ply, turn: state.turn, bestMove: r.bestMove, score: r.score, depth: r.depth };
}

export type MoveClass = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

function sameMove(a: Move, b: Move | null): boolean {
  return (
    !!b &&
    a.fromX === b.fromX &&
    a.fromY === b.fromY &&
    a.toX === b.toX &&
    a.toY === b.toY
  );
}

export interface ClassifiedMove {
  /** Eval after the move, in centipawns from Red's perspective. */
  evalAfterRed: number;
  cls: MoveClass;
  bestMove: Move | null;
}

/**
 * Classify the move played at `before.ply` using the analysis before
 * (mover to move) and after (opponent to move) it. On positions with
 * covered pieces the underlying scores are masked-belief (PIMC)
 * evaluations — eval swings are measured on revealed/public information,
 * never on the hidden identities.
 */
export function classifyMove(
  before: PlyAnalysis,
  after: PlyAnalysis,
  played: Move
): ClassifiedMove {
  const mover = before.turn;
  const sign = mover === "red" ? 1 : -1;
  const scoreBefore = before.score; // mover's perspective
  const scoreAfter = -after.score; // convert to mover's perspective
  const swing = scoreAfter - scoreBefore;
  let cls: MoveClass;
  if (sameMove(played, before.bestMove)) cls = "best";
  else if (swing >= -25) cls = "good";
  else if (swing >= -80) cls = "inaccuracy";
  else if (swing >= -200) cls = "mistake";
  else cls = "blunder";
  return { evalAfterRed: scoreAfter * sign, cls, bestMove: before.bestMove };
}

/** Format an eval (centipawns, Red's perspective) for display. */
export function formatEval(cpRed: number): string {
  const a = Math.abs(cpRed);
  if (a >= MATE_CP - 1000) {
    const moves = Math.max(1, Math.ceil((MATE_CP - a) / 2));
    return `#${moves}`;
  }
  const p = cpRed / 100;
  return p > 0 ? `+${p.toFixed(1)}` : p.toFixed(1);
}

/** Red's share of the eval bar, 0..1. */
export function evalShare(cpRed: number): number {
  if (cpRed >= MATE_CP - 1000) return 1;
  if (cpRed <= -(MATE_CP - 1000)) return 0;
  return 1 / (1 + Math.pow(10, -cpRed / 400));
}

/**
 * Human-readable move text for a move played FROM `state`, e.g.
 * "Pháo đỏ 1,7→4,7" (vi) or "Red Cannon 1,7→4,7" (en) — with the flip
 * suffix ("=Xe") appended when the move flips a covered piece: the record
 * is recomputed by applying the move to the (true, replay) state.
 */
export function moveText(state: JieqiState, move: Move, lang: Lang = "en"): string {
  const p = state.board[move.fromY]?.[move.fromX];
  if (!p) return "?";
  let record: ReturnType<typeof applyMove>["record"] | null = null;
  try {
    record = applyMove(state, move).record;
  } catch {
    record = null;
  }
  return moveEntryText(p.color, effectiveType(p), move, lang, record);
}
