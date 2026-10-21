// Live position evaluation for the eval bar + brilliant-move detection.
// Runs the PIMC search in a Web Worker off the main thread. Each call
// spawns its own worker (cancel-safe); progress messages stream in per
// completed depth so the bar swings live as search deepens. On positions
// with covered pieces the eval is a masked-belief (sampled) evaluation —
// it reflects public information, never the hidden identities.
//
// Signature adapted from PacClone: requestLiveEval(board, turn, ...) is
// now requestLiveEval(state, ...) — the state carries the side to move.

import type { Color, JieqiState, Move } from "./types";
import type { HintProgress, HintDone } from "./hint.worker";

/** Mate scores from searchDepthQ exceed ±90000. */
export const MATE_THRESHOLD = 90000;

export interface EvalUpdate {
  /** Win probability for Red, 0..1. */
  winProbRed: number;
  /** Centipawns from Red's perspective (mate scores are huge). */
  cpRed: number;
  /** True when a forced mate was found. */
  mate: boolean;
  /** Search depth that produced this update. */
  depth: number;
  /** Engine's best move — set only on the final (done) update. */
  bestMove: Move | null;
  done: boolean;
}

/** Standard logistic: centipawns (Red perspective) -> Red win probability. */
export function scoreToWinProbRed(scoreCpSideToMove: number, turn: Color): number {
  if (Math.abs(scoreCpSideToMove) > MATE_THRESHOLD) {
    const moverMates = scoreCpSideToMove > 0;
    return moverMates === (turn === "red") ? 1 : 0;
  }
  const cpRed = turn === "red" ? scoreCpSideToMove : -scoreCpSideToMove;
  return 1 / (1 + Math.pow(10, -cpRed / 400));
}

/**
 * Evaluate a position in the background. `onUpdate` fires per completed
 * depth and once more on done. Returns a cancel function (also terminates
 * the worker). Safe to call repeatedly — each call is independent.
 */
export function requestLiveEval(
  state: JieqiState,
  onUpdate: (u: EvalUpdate) => void,
  opts?: { maxDepth?: number; timeCapMs?: number }
): () => void {
  const turn = state.turn;
  let cancelled = false;
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL("./hint.worker.ts", import.meta.url));
  } catch {
    return () => {};
  }
  const w: Worker = worker;
  const cleanup = () => {
    cancelled = true;
    try {
      w.terminate();
    } catch {
      /* ignore */
    }
  };
  const handle = (msg: HintProgress | HintDone) => {
    const done = msg.type === "done";
    const score = msg.score;
    onUpdate({
      winProbRed: scoreToWinProbRed(score, turn),
      cpRed: turn === "red" ? score : -score,
      mate: Math.abs(score) > MATE_THRESHOLD,
      depth: msg.depth,
      bestMove: done ? (msg as HintDone).move : null,
      done,
    });
    if (done) cleanup();
  };
  w.onmessage = (e: MessageEvent<HintProgress | HintDone>) => {
    if (!cancelled) handle(e.data);
  };
  w.onerror = cleanup;
  w.postMessage({
    state,
    maxDepth: opts?.maxDepth ?? 4,
    timeCapMs: opts?.timeCapMs ?? 1200,
  });
  return cleanup;
}
