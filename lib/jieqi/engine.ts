// App-facing engine adapter for Cờ Úp.
//
// Everything rules-related is the verified core (lib/jieqi/core) re-exported
// unchanged: createGame / createGameWithRng, legalMoves(state),
// legalMovesForSquare(state, x, y), applyMove(state, move) -> { state,
// record }, gameStatus(state), isInCheck(board, color), isAttacked,
// pseudoMoves, effectiveType, findGeneral, positionKey, repetitionCount,
// maskState, makeState, commitment/verify helpers, core evaluate, ...
//
// This module adds only the app-shaped helpers the contract asks for:
// initialState, viewBoard / viewBoardMasked, capturedLists, remainingDark.

export * from "./core";

import { createGame } from "./core/setup";
import { findGeneral } from "./core/engine";
import { DARK_MULTISET } from "./core/types";
import type {
  CapturedInfo,
  Color,
  JBoard,
  JieqiState,
  MaskedState,
  PieceType,
} from "./core/types";
import type { ViewBoard, ViewPiece } from "./types";

/** PacClone name for the core's findGeneral (components ported from
 *  PacClone call it findKing). Same signature: (board, color). */
export function findKing(
  board: JBoard,
  color: Color
): { x: number; y: number } | null {
  return findGeneral(board, color);
}

/**
 * Deal a new game. With an explicit seed the deal is deterministic (rooms,
 * replays, tests). Without one, a fresh random seed is used so consecutive
 * local games don't repeat the same layout.
 */
export function initialState(seed?: number | string): JieqiState {
  if (seed !== undefined) return createGame(seed);
  const randomSeed =
    (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  return createGame(randomSeed);
}

/**
 * Render model of a TRUE state (local play only — a true state must never
 * be sent to another client mid-game; rooms use viewBoardMasked).
 * Covered pieces expose faceType = hostType (never their true identity),
 * so the result is safe to render and to log.
 */
export function viewBoard(state: JieqiState): ViewBoard {
  return state.board.map((row) =>
    row.map((p): ViewPiece | null =>
      p
        ? {
            id: p.id,
            color: p.color,
            faceType: p.covered ? p.fakeType : p.trueType,
            covered: p.covered,
            hostType: p.fakeType,
          }
        : null
    )
  );
}

/**
 * Render model of a MASKED state (rooms, spectators, the AI's belief view).
 * MaskedPiece carries no piece id, so ids are square-derived (y * 9 + x):
 * stable for covered pieces (they never move while covered — the pieces
 * whose flip animation matters), positional for revealed ones.
 */
export function viewBoardMasked(m: MaskedState): ViewBoard {
  return m.board.map((row, y) =>
    row.map((p, x): ViewPiece | null =>
      p
        ? {
            id: y * 9 + x,
            color: p.color,
            faceType: p.covered
              ? p.fakeType
              : (p.trueType as PieceType),
            covered: p.covered,
            hostType: p.fakeType,
          }
        : null
    )
  );
}

/** Captured pieces per color, in capture order (trays). Identities are
 *  public: a captured covered piece was revealed at capture (ruling 3). */
export function capturedLists(
  state: JieqiState
): Record<Color, CapturedInfo[]> {
  const out: Record<Color, CapturedInfo[]> = { red: [], black: [] };
  for (const c of state.captured) {
    out[c.color].push({
      color: c.color,
      trueType: c.trueType,
      wasCovered: c.covered,
    });
  }
  return out;
}

type AnyState = JieqiState | MaskedState;

/**
 * Per-color multiset of still-unknown (covered, not yet revealed or
 * captured) identities — pure public information: the standard 15-piece
 * dark multiset minus that side's revealed pieces minus its captured
 * pieces. Powers the "bộ bài còn úp" panel. Accepts a true state (local
 * play) or a masked state (rooms); the answer is identical either way.
 */
export function remainingDark(
  s: AnyState
): Record<Color, Record<PieceType, number>> {
  const out: Record<Color, Record<PieceType, number>> = {
    red: { K: 0, A: 0, B: 0, N: 0, R: 0, C: 0, P: 0 },
    black: { K: 0, A: 0, B: 0, N: 0, R: 0, C: 0, P: 0 },
  };
  for (const color of ["red", "black"] as const) {
    for (const t of DARK_MULTISET) out[color][t]++;
  }
  for (const row of s.board) {
    for (const p of row) {
      if (!p || p.covered) continue;
      // Revealed piece: its identity is known. (In a masked state a
      // revealed piece's trueType is non-null by construction.) Generals
      // are never part of the dark multiset — skip them.
      if (p.trueType && p.trueType !== "K") out[p.color][p.trueType]--;
    }
  }
  for (const c of s.captured) {
    if (c.trueType !== "K") out[c.color][c.trueType]--;
  }
  return out;
}

/** remainingDark as flat multisets (one entry per piece), for list UIs. */
export function remainingDarkList(s: AnyState): Record<Color, PieceType[]> {
  const counts = remainingDark(s);
  const out: Record<Color, PieceType[]> = { red: [], black: [] };
  for (const color of ["red", "black"] as const) {
    for (const t of Object.keys(counts[color]) as PieceType[]) {
      for (let i = 0; i < counts[color][t]; i++) out[color].push(t);
    }
  }
  return out;
}
