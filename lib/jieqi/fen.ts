// App-facing FEN module: the core's extended Jieqi FEN, re-exported.
//
// Core exports: toFen (full 7-field FEN incl. the secret hidden field),
// parseFen (full FEN only — it refuses a public FEN with covered pieces),
// toPublicFen, maskedFen, moveToUci / parseUci, squareToUci, TYPE_TO_LETTER.

export * from "./core/fen";

import { createGame } from "./core/setup";
import { toFen as coreToFen } from "./core/fen";

/** The design doc's canonical initial PUBLIC FEN (identical for every deal). */
export const INITIAL_PUBLIC_FEN =
  "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1";

/** Public FEN of a fresh deal — seed-independent by design. */
export function initialPublicFen(): string {
  return INITIAL_PUBLIC_FEN;
}

/** Full FEN (with hidden field) of a fresh deal from `seed` (default 0). */
export function initialFen(seed: number | string = 0): string {
  return coreToFen(createGame(seed));
}
