// Position keys for Cờ Úp — a thin helper over the core engine's
// canonical positionKey (the old Xiangqi Zobrist table keyed Board+Piece,
// which no longer exists). Keys are strings, Map-friendly, and come in two
// flavours: TRUE keys (use a covered piece's real identity — local use
// only) and MASKED keys (covered pieces collapse to one dark token —
// computable from public information, safe for rooms / repetition maps).

import { positionKey } from "./core/engine";
import type { JieqiState } from "./types";

export type ZKey = string;

/** True-identity key of the state's current position. */
export function zobristHash(state: JieqiState): ZKey {
  return (
    state.keyHistory[state.keyHistory.length - 1] ??
    positionKey(state.board, state.turn, false)
  );
}

/** Public (masked) key of the state's current position. */
export function zobristHashMasked(state: JieqiState): ZKey {
  return (
    state.maskedKeyHistory[state.maskedKeyHistory.length - 1] ??
    positionKey(state.board, state.turn, true)
  );
}

export { positionKey };
