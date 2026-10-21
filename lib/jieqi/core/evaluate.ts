// Minimal static evaluation — a hook for the future AI ladder, NOT the AI
// itself. It is computed from PUBLIC information only (it works identically
// on a true state or on what a player could know), which keeps it honest
// for a hidden-information game:
//
//   - A revealed piece scores its flat material value (a revealed pawn that
//     has crossed the river scores the higher crossed value, by its true
//     current position).
//   - A covered piece scores the EXPECTED value of its side's still-unknown
//     pieces: the standard 15-piece set minus that side's revealed pieces
//     minus its captured pieces, averaged — plus a small "host option"
//     bonus: a fraction of the difference between its host type's value and
//     the expectation, reflecting that its first move is made as the host.
//     The bonus never uses the piece's real identity (which is exactly the
//     point: two deals that look the same publicly evaluate the same).

import {
  Color,
  DARK_MULTISET,
  FILES,
  JBoard,
  JieqiState,
  PieceType,
  RANKS,
} from "./types";

export const PIECE_VALUES: Record<PieceType, number> = {
  K: 100000,
  R: 600,
  C: 300,
  N: 285,
  B: 120,
  A: 120,
  P: 60,
};

/** Extra value of a pawn that has crossed the river. */
export const CROSSED_PAWN_BONUS = 60;

/** Fraction of (host value − expectation) credited to a covered piece. */
export const HOST_OPTION_FRACTION = 0.15;

function crossedRiver(color: Color, y: number): boolean {
  return color === "red" ? y <= 4 : y >= 5;
}

function revealedValue(p: { trueType: PieceType; color: Color }, y: number): number {
  let v = PIECE_VALUES[p.trueType];
  if (p.trueType === "P" && crossedRiver(p.color, y)) v += CROSSED_PAWN_BONUS;
  return v;
}

/** Expected value of one still-unknown (covered) piece of `color`. */
export function expectedDarkValue(state: JieqiState, color: Color): number {
  const remaining = new Map<PieceType, number>();
  for (const t of DARK_MULTISET) remaining.set(t, (remaining.get(t) ?? 0) + 1);
  const consume = (t: PieceType) => {
    remaining.set(t, (remaining.get(t) ?? 0) - 1);
  };
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = state.board[y][x];
      if (p && p.color === color && !p.covered) consume(p.trueType);
    }
  }
  for (const c of state.captured) {
    if (c.color === color) consume(c.trueType);
  }
  let total = 0;
  let count = 0;
  for (const [t, n] of remaining) {
    if (n > 0) {
      total += PIECE_VALUES[t] * n;
      count += n;
    }
  }
  return count === 0 ? 0 : total / count;
}

/** Material score of the board from `color`'s perspective (centipawn-ish). */
export function evaluateBoard(board: JBoard, state: JieqiState, color: Color): number {
  const darkValue: Record<Color, number> = {
    red: expectedDarkValue(state, "red"),
    black: expectedDarkValue(state, "black"),
  };
  let score = 0;
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (!p) continue;
      let v: number;
      if (p.covered) {
        const exp = darkValue[p.color];
        v = exp + HOST_OPTION_FRACTION * (PIECE_VALUES[p.fakeType] - exp);
      } else {
        v = revealedValue(p, y);
      }
      score += p.color === color ? v : -v;
    }
  }
  return score;
}

/** Static evaluation from the perspective of the side to move. */
export function evaluate(state: JieqiState): number {
  return evaluateBoard(state.board, state, state.turn);
}
