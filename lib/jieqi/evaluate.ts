// Static evaluation glue for the Jieqi AI (see ai.ts).
//
// Two honest flavours, both expressed from a given color's perspective
// (positive = good for that color), material + piece-square tables:
//
// - evaluatePublicFor: PUBLIC information only. A covered piece scores the
//   expected value of its side's still-unknown identities (core
//   expectedDarkValue) plus a host-option blend and half the host's PST
//   bonus. Used by the low heuristic levels — it never peeks.
//
// - evaluateSampledFor: for ONE determinization sample. The position is a
//   concrete (sampled) true state, so a covered piece scores its SAMPLED
//   identity blended toward its host value — exactly how the core's public
//   evaluator treats the expectation, with the sample in place of the mean.
//   This is standard PIMC: each sample is solved as a perfect-information
//   world; no real hidden identity is ever read (ai.ts only ever feeds
//   this function states built from maskState(state)).

import { expectedDarkValue, PIECE_VALUES } from "./core/evaluate";
import { pstBonus } from "./pst";
import type { Color, JieqiState, PieceType } from "./types";

export const CROSSED_PAWN_BONUS = 60;
const HOST_OPTION_FRACTION = 0.15;

function crossedRiver(color: Color, y: number): boolean {
  return color === "red" ? y <= 4 : y >= 5;
}

function revealedValue(
  trueType: PieceType,
  color: Color,
  x: number,
  y: number
): number {
  let v = PIECE_VALUES[trueType] + pstBonus(trueType, color, x, y);
  if (trueType === "P" && crossedRiver(color, y)) v += CROSSED_PAWN_BONUS;
  return v;
}

function coveredValue(
  identityValue: number,
  hostType: PieceType,
  color: Color,
  x: number,
  y: number
): number {
  const host = PIECE_VALUES[hostType];
  return (
    identityValue +
    HOST_OPTION_FRACTION * (host - identityValue) +
    pstBonus(hostType, color, x, y) * 0.5
  );
}

function evaluateFor(
  state: JieqiState,
  color: Color,
  sampled: boolean
): number {
  const expected: Record<Color, number> = {
    red: expectedDarkValue(state, "red"),
    black: expectedDarkValue(state, "black"),
  };
  let score = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = state.board[y][x];
      if (!p) continue;
      const v = p.covered
        ? coveredValue(
            sampled ? PIECE_VALUES[p.trueType] : expected[p.color],
            p.fakeType,
            p.color,
            x,
            y
          )
        : revealedValue(p.trueType, p.color, x, y);
      score += p.color === color ? v : -v;
    }
  }
  return score;
}

/** Public-information evaluation (no peeking) from `color`'s perspective. */
export function evaluatePublicFor(state: JieqiState, color: Color): number {
  return evaluateFor(state, color, false);
}

/** Evaluation of one sampled determinization from `color`'s perspective. */
export function evaluateSampledFor(state: JieqiState, color: Color): number {
  return evaluateFor(state, color, true);
}

/** Public-information evaluation from the side-to-move's perspective. */
export function evaluatePublic(state: JieqiState): number {
  return evaluatePublicFor(state, state.turn);
}
