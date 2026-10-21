// App-facing types for Cờ Úp (Jieqi / Dark Xiangqi).
//
// The game state is the verified core's `JieqiState` (see lib/jieqi/core) —
// there is no longer a Xiangqi-style `Board`/`Piece` pair: a physical piece
// is a `JPiece` { id, color, trueType, fakeType, covered }, and what the UI
// renders is a `ViewPiece` produced by engine.ts (viewBoard /
// viewBoardMasked). All core types are re-exported here so components keep
// importing from "@/lib/jieqi/types" as in PacClone.

export * from "./core/types";

import type { Color, PieceType } from "./core/types";

/** Traditional characters. Red (bottom) on the left, Black (top) on the right. */
export const PIECE_CHARS: Record<Color, Record<PieceType, string>> = {
  red: { K: "帥", A: "仕", B: "相", N: "傌", R: "俥", C: "砲", P: "兵" },
  black: { K: "將", A: "士", B: "象", N: "馬", R: "車", C: "炮", P: "卒" },
};

export const PIECE_NAMES: Record<PieceType, string> = {
  K: "General",
  A: "Advisor",
  B: "Elephant",
  N: "Horse",
  R: "Chariot",
  C: "Cannon",
  P: "Soldier",
};

export type Difficulty = "easy" | "normal" | "hard";

/** AI strength level, 1 (weakest) to 12 (strongest). */
export type Level = number;

export const DIFFICULTIES: Record<
  Difficulty,
  { label: string; description: string }
> = {
  easy: { label: "Easy", description: "Casual play, makes mistakes" },
  normal: { label: "Normal", description: "Solid club-level play" },
  hard: { label: "Hard", description: "Deep search, tough to beat" },
};

/**
 * What the Board renders for one square.
 *
 * - `faceType`: the type whose glyph is drawn when the piece is face-up
 *   (its `trueType`). For a COVERED piece this field is deliberately NOT
 *   the true identity: it equals `hostType` (the movement/host type),
 *   which is public information, so a ViewPiece is always leak-safe —
 *   including the ones built from a MaskedState.
 * - `hostType`: the piece whose starting square this physical piece sits
 *   on (core `fakeType`). A covered piece moves as its host; the Board
 *   draws the brass back with a subtle host glyph from this field.
 * - `covered`: render the brass back instead of the face.
 */
export interface ViewPiece {
  id: number;
  color: Color;
  faceType: PieceType;
  covered: boolean;
  hostType: PieceType;
}

/** viewBoard output: board[y][x] of ViewPiece | null. */
export type ViewBoard = (ViewPiece | null)[][];
