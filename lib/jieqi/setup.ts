// Custom position setup: the editor works on placements (a piece's TRUE
// identity + covered flag + host type), validates them against the Jieqi
// composition rules, and builds a real JieqiState via core makeState.

import { hostTypeAt, makeState } from "./core";
import type { Color, JieqiState, PieceType } from "./types";

export interface SetupPiece {
  color: Color;
  /** True identity (the hidden identity when covered). */
  trueType: PieceType;
  covered: boolean;
  /** Host (starting-square) type — movement identity while covered. */
  fakeType: PieceType;
}

export type SetupBoard = (SetupPiece | null)[][];

export type SetupError =
  | "kings"
  | "palace"
  | "facing"
  | "composition"
  | "coveredHome"
  | null;

const MULTISET: Record<PieceType, number> = {
  K: 1,
  A: 2,
  B: 2,
  N: 2,
  R: 2,
  C: 2,
  P: 5,
};

function inPalace(x: number, y: number, color: Color): boolean {
  if (x < 3 || x > 5) return false;
  return color === "red" ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

/** Returns the first validation problem, or null when playable. */
export function validateSetup(board: SetupBoard): SetupError {
  let redK = 0;
  let blackK = 0;
  let rk = { x: -1, y: -1 };
  let bk = { x: -1, y: -1 };
  const counts: Record<Color, Record<PieceType, number>> = {
    red: { K: 0, A: 0, B: 0, N: 0, R: 0, C: 0, P: 0 },
    black: { K: 0, A: 0, B: 0, N: 0, R: 0, C: 0, P: 0 },
  };
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      counts[p.color][p.trueType]++;
      if (counts[p.color][p.trueType] > MULTISET[p.trueType])
        return "composition";
      if (p.covered) {
        // A covered piece has never moved, so it can only ever sit on one
        // of its own side's home squares (also what FEN round-trips need).
        if (hostTypeAt(p.color, x, y) === null) return "coveredHome";
        if (p.trueType === "K") return "kings";
      }
      if (p.trueType === "K" && !p.covered) {
        if (p.color === "red") {
          redK++;
          rk = { x, y };
        } else {
          blackK++;
          bk = { x, y };
        }
      }
    }
  }
  if (redK !== 1 || blackK !== 1) return "kings";
  if (!inPalace(rk.x, rk.y, "red") || !inPalace(bk.x, bk.y, "black"))
    return "palace";
  if (rk.x === bk.x) {
    const [top, bottom] = rk.y < bk.y ? [rk.y, bk.y] : [bk.y, rk.y];
    let blocked = false;
    for (let y = top + 1; y < bottom; y++) {
      if (board[y][rk.x]) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return "facing";
  }
  return null;
}

/** Empty 9x10 editor board. */
export function emptyBoard(): SetupBoard {
  return Array.from({ length: 10 }, () =>
    Array.from({ length: 9 }, () => null)
  );
}

/** Editor board from a true state (deal, saved setup, puzzle position). */
export function setupBoardFromState(state: JieqiState): SetupBoard {
  return state.board.map((row) =>
    row.map((p) =>
      p
        ? {
            color: p.color,
            trueType: p.trueType,
            covered: p.covered,
            fakeType: p.fakeType,
          }
        : null
    )
  );
}

/** Build the playable JieqiState for an editor board + side to move. */
export function buildSetupState(board: SetupBoard, turn: Color): JieqiState {
  const placements = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      placements.push({
        x,
        y,
        color: p.color,
        trueType: p.trueType,
        covered: p.covered,
        fakeType: p.fakeType,
      });
    }
  }
  return makeState(placements, { turn });
}

/** True when the editor board contains any covered piece. */
export function hasCovered(board: SetupBoard): boolean {
  return board.some((row) => row.some((p) => p?.covered));
}
