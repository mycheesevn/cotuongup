// Forced-mate solver over JieqiState: finds a first move that forces
// CHECKMATE within a given number of attacker moves. Built only on the
// verified core (legalMoves, applyMove, gameStatus).
//
// Daily puzzles are FULLY-REVEALED positions (ruling 10), and this solver
// is meant for those: it searches the true state it is given. (The game
// AI in ai.ts is the component that must never peek — it works from
// maskState; a puzzle position has nothing left to hide.)

import { applyMove, gameStatus, legalMoves } from "./core/engine";
import type { JieqiState, Move } from "./types";
import { opposite } from "./types";

interface MoveInfo {
  m: Move;
  next: JieqiState;
  isCheck: boolean;
  isCapture: boolean;
}

/**
 * Find a first move for the side to move that forces checkmate within
 * `movesToMate` attacker moves. Returns null when no forced mate exists.
 * (PacClone's findMateMove took (board, turn, movesToMate); the state now
 * carries the turn.)
 */
export function findMateMove(
  state: JieqiState,
  movesToMate: number
): Move | null {
  if (movesToMate < 1) return null;
  if (gameStatus(state).over) return null;
  return searchAttacker(state, movesToMate * 2 - 1);
}

/**
 * Contract-named alias: findMate(state, maxMoves) — same search as
 * findMateMove; `maxMoves` counts ATTACKER moves (mate-in-N), not plies.
 */
export function findMate(
  state: JieqiState,
  maxMoves: number
): Move | null {
  return findMateMove(state, maxMoves);
}

/** Smallest N <= maxMoves with a forced mate, or null. */
export function mateIn(
  state: JieqiState,
  maxMoves: number
): { move: Move; mateIn: number } | null {
  for (let n = 1; n <= maxMoves; n++) {
    const move = findMateMove(state, n);
    if (move) return { move, mateIn: n };
  }
  return null;
}

function moveInfos(state: JieqiState): MoveInfo[] {
  const opp = opposite(state.turn);
  const infos: MoveInfo[] = legalMoves(state).map((m) => {
    const next = applyMove(state, m).state;
    return {
      m,
      next,
      isCheck: gameStatus(next).inCheck,
      isCapture: !!state.board[m.toY][m.toX],
    };
  });
  // Checking moves first, then captures — mating lines start with checks.
  infos.sort((a, b) => {
    if (a.isCheck !== b.isCheck) return a.isCheck ? -1 : 1;
    if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
    return 0;
  });
  return infos;
}

function searchAttacker(state: JieqiState, pliesLeft: number): Move | null {
  const attacker = state.turn;
  const finalPly = pliesLeft <= 1;
  for (const { m, next, isCheck } of moveInfos(state)) {
    if (finalPly && !isCheck) continue; // only a check can be mate
    const st = gameStatus(next);
    if (st.over && st.winner === attacker && st.reason === "checkmate") {
      return m;
    }
    if (finalPly) continue;
    if (allRepliesMated(next, pliesLeft - 1)) return m;
  }
  return null;
}

function allRepliesMated(state: JieqiState, pliesLeft: number): boolean {
  // `state` is the defender-to-move position after an attacker move.
  const defender = state.turn;
  const attacker = opposite(defender);
  const replies = legalMoves(state);
  if (replies.length === 0) {
    const st = gameStatus(state);
    return st.over && st.winner === attacker && st.reason === "checkmate";
  }
  for (const r of replies) {
    const next = applyMove(state, r).state;
    if (!searchAttacker(next, pliesLeft - 1)) return false;
  }
  return true;
}
