// The masked (public) view of a game. This is the ONLY state representation
// that may leave the server during a room game: covered pieces expose their
// color, position and host type — all public — and `trueType: null`.
//
// Leak-safety argument: maskState is the single choke point. It copies each
// covered piece into a fresh object whose trueType slot is null, and the
// repetition counts are folded from maskedKeyHistory (masked position keys),
// never from the true keys. tests/test-mask.ts asserts all of this over
// randomized games, including that two different deals produce byte-identical
// initial masked FENs.

import { countOccurrences } from "./engine";
import {
  CapturedInfo,
  JieqiState,
  MaskedBoard,
  MaskedState,
  FILES,
  RANKS,
} from "./types";

export function maskState(state: JieqiState): MaskedState {
  const board: MaskedBoard = Array.from({ length: RANKS }, (_, y) =>
    Array.from({ length: FILES }, (_, x) => {
      const p = state.board[y][x];
      if (!p) return null;
      return {
        color: p.color,
        covered: p.covered,
        trueType: p.covered ? null : p.trueType,
        fakeType: p.fakeType,
      };
    })
  );
  // Captured pieces are public, including whether they were face-down when
  // taken (the true state preserves that flag on the captured clones).
  const captured: CapturedInfo[] = state.captured.map((c) => ({
    color: c.color,
    trueType: c.trueType,
    wasCovered: c.covered,
  }));
  const maskedRepCounts: Record<string, number> = {};
  for (const k of state.maskedKeyHistory) {
    maskedRepCounts[k] = (maskedRepCounts[k] ?? 0) + 1;
  }
  const lastMaskedKey =
    state.maskedKeyHistory[state.maskedKeyHistory.length - 1];
  return {
    board,
    turn: state.turn,
    pliesSinceCaptureOrFlip: state.pliesSinceCaptureOrFlip,
    moveNumber: state.moveNumber,
    captured,
    maskedRepCounts,
    currentMaskedRepetitions: countOccurrences(
      state.maskedKeyHistory,
      lastMaskedKey
    ),
  };
}
