// Programmatic state construction — for tests, fixtures and (later) the
// setup editor. Unlike parseFen, pieces may be placed anywhere, and a
// covered piece's fakeType may be given explicitly.

import { positionKey } from "./engine";
import {
  Color,
  FILES,
  JBoard,
  JPiece,
  JieqiState,
  PieceType,
  RANKS,
} from "./types";
import { hostTypeAt } from "./setup";

export interface Placement {
  x: number;
  y: number;
  color: Color;
  trueType: PieceType;
  covered?: boolean;
  /** Host type for a covered piece; defaults to the square's home host. */
  fakeType?: PieceType;
}

export interface MakeStateOptions {
  turn?: Color;
  pliesSinceCaptureOrFlip?: number;
  moveNumber?: number;
  captured?: JPiece[];
}

export function makeState(
  placements: Placement[],
  opts: MakeStateOptions = {}
): JieqiState {
  const board: JBoard = Array.from({ length: RANKS }, () =>
    Array<JPiece | null>(FILES).fill(null)
  );
  let id = 0;
  for (const pl of placements) {
    if (board[pl.y][pl.x]) {
      throw new Error(`makeState: two pieces on ${pl.x},${pl.y}`);
    }
    const covered = !!pl.covered;
    board[pl.y][pl.x] = {
      id: id++,
      color: pl.color,
      trueType: pl.trueType,
      fakeType:
        pl.fakeType ??
        (covered ? hostTypeAt(pl.color, pl.x, pl.y) ?? pl.trueType : pl.trueType),
      covered,
    };
  }
  const turn = opts.turn ?? "red";
  return {
    board,
    turn,
    pliesSinceCaptureOrFlip: opts.pliesSinceCaptureOrFlip ?? 0,
    moveNumber: opts.moveNumber ?? 1,
    captured: opts.captured ?? [],
    keyHistory: [positionKey(board, turn, false)],
    maskedKeyHistory: [positionKey(board, turn, true)],
  };
}
