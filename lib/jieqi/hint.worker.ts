// Deep hint search, run off the main thread so the UI never freezes.
// Iterative deepening over the PIMC search (searchDepthQ): the AI sees
// only the masked position and samples the hidden identities, like the
// in-game levels — just with more depth/time. Protocol adapted from
// PacClone: the request now carries a full JieqiState (which includes
// the side to move) instead of { board, turn }.

import { searchDepthQ } from "./ai";
import type { JieqiState, Move } from "./types";

export interface HintRequest {
  state: JieqiState;
  /** Deepest depth to attempt (iterative deepening from 1). */
  maxDepth: number;
  /** Total time budget in ms across all depths. */
  timeCapMs: number;
}

export interface HintProgress {
  type: "progress";
  depth: number;
  /** Centipawns from the side-to-move's perspective at this depth. */
  score: number;
  nodes: number;
  elapsedMs: number;
}

export interface HintDone {
  type: "done";
  move: Move | null;
  /** Centipawns from the side-to-move's perspective at the final depth. */
  score: number;
  /** Deepest fully completed depth. */
  depth: number;
  nodes: number;
  elapsedMs: number;
}

const post = (msg: HintProgress | HintDone) => {
  (self as unknown as { postMessage(m: unknown): void }).postMessage(msg);
};

self.onmessage = (e: MessageEvent<HintRequest>) => {
  const { state, maxDepth, timeCapMs } = e.data;
  const t0 = Date.now();
  let best: Move | null = null;
  let bestDepth = 0;
  let nodes = 0;

  let pvMove: Move | null = null;
  let lastScore = 0;
  for (let d = 1; d <= maxDepth; d++) {
    const remaining = timeCapMs - (Date.now() - t0);
    // Need a meaningful slice of time for the next depth.
    if (remaining < 300) break;
    const r = searchDepthQ(state, d, remaining, pvMove);
    nodes = r.stats.nodes;
    lastScore = r.score;
    post({ type: "progress", depth: d, score: r.score, nodes, elapsedMs: Date.now() - t0 });
    if (!r.completed) break;
    if (r.move) {
      best = r.move;
      pvMove = r.move;
      bestDepth = d;
    }
    // Forced mate found: no need to search deeper.
    if (Math.abs(r.score) > 90000) break;
  }

  post({ type: "done", move: best, score: lastScore, depth: bestDepth, nodes, elapsedMs: Date.now() - t0 });
};

export {};
