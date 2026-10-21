// Post-game coach review: turn the human's classified moves into an
// accuracy score, the costliest mistakes, and one genuine strength.
//
// Pure and unit-testable: every input is data (no engine calls here).
// The UI computes per-ply swings with lib/jieqi/analysis.ts
// (classifyMove: swing = scoreAfter - scoreBefore in the mover's
// perspective) and hands the human's plies to buildCoachReport().

import type { MoveClass } from "./analysis";
import type { Color, Move } from "./types";

/** One human move, classified against the engine (see analysis.ts). */
export interface HumanPly {
  /** 0-based ply index in the game. */
  ply: number;
  /** Color the human was playing. */
  mover: Color;
  /** Centipawns from the mover's perspective: scoreAfter - scoreBefore. */
  swing: number;
  /** Centipawns lost: max(0, -swing). */
  loss: number;
  /** Engine classification of the move. */
  cls: MoveClass;
  /** Human-readable move text, e.g. "Pháo đỏ 1,7→4,7". */
  moveText: string;
  /** The engine's best move (null when the position was already over). */
  bestMove: Move | null;
  /** Human-readable text of the engine's best move ("—" when none). */
  bestMoveText: string;
  /** Eval before the move, centipawns, mover's perspective. */
  evalBefore: number;
  /** Eval after the move, centipawns, mover's perspective. */
  evalAfter: number;
}

export interface CoachMistake {
  /** 0-based ply index in the game (position BEFORE the mistake). */
  ply: number;
  /** 1-based overall move number (matches the move list). */
  moveNumber: number;
  mover: Color;
  moveText: string;
  bestMove: Move | null;
  bestMoveText: string;
  evalBefore: number; // mover POV cp
  evalAfter: number; // mover POV cp
  loss: number; // cp
  cls: Extract<MoveClass, "mistake" | "blunder">;
}

export type StrengthKind =
  | "brilliant"
  | "streak"
  | "bestRate"
  | "strongFinish"
  | "solidPhase";

export interface CoachStrength {
  kind: StrengthKind;
  /** Brilliant move text. */
  moveText?: string;
  /** Brilliant move gain, e.g. "+1.5" pawns. */
  gainPawns?: string;
  /** Streak length (engine-level moves in a row). */
  streak?: number;
  /** Streak endpoints as overall move numbers. */
  fromMove?: number;
  toMove?: number;
  /** Best-move rate, percent. */
  rate?: number;
  /** First/second half accuracy (strong finish). */
  halfBefore?: number;
  halfAfter?: number;
  /** Lowest-loss phase (solid phase fallback). */
  phase?: "opening" | "middlegame" | "endgame";
}

export interface CoachReport {
  /** 0..100. */
  accuracy: number;
  /** Mean centipawn loss per human move. */
  meanLoss: number;
  /** Human moves analyzed. */
  moves: number;
  mistakes: CoachMistake[];
  strength: CoachStrength;
}

/**
 * Accuracy mapping: 100·exp(−meanLoss/180), rounded. Monotonic decreasing
 * in mean centipawn loss: 0cp → 100, 50cp → 76, 100cp → 57, 200cp → 33,
 * 400cp → 11. The constant 180 places a club-level game (~50cp/move
 * average loss) in the mid-70s and a blunder-filled game under 35.
 */
export function accuracyFromMeanLoss(meanLoss: number): number {
  const a = 100 * Math.exp(-Math.max(0, meanLoss) / 180);
  return Math.max(0, Math.min(100, Math.round(a)));
}

export const moveNumberOf = (ply: number): number => Math.floor(ply / 2) + 1;

type Phase = "opening" | "middlegame" | "endgame";

function phaseOf(moveNumber: number): Phase {
  if (moveNumber <= 10) return "opening";
  if (moveNumber > 30) return "endgame";
  return "middlegame";
}

/** Build the coach report from the human's classified plies (game order). */
export function buildCoachReport(humanPlies: HumanPly[]): CoachReport {
  const n = humanPlies.length;
  const meanLoss =
    n === 0 ? 0 : humanPlies.reduce((s, p) => s + p.loss, 0) / n;

  // Costliest mistakes: mistake/blunder class only, largest loss first.
  const mistakes: CoachMistake[] = humanPlies
    .filter(
      (p): p is HumanPly & { cls: "mistake" | "blunder" } =>
        p.cls === "mistake" || p.cls === "blunder"
    )
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .map((p) => ({
      ply: p.ply,
      moveNumber: moveNumberOf(p.ply),
      mover: p.mover,
      moveText: p.moveText,
      bestMove: p.bestMove,
      bestMoveText: p.bestMoveText,
      evalBefore: p.evalBefore,
      evalAfter: p.evalAfter,
      loss: p.loss,
      cls: p.cls,
    }));

  return {
    accuracy: n === 0 ? 0 : accuracyFromMeanLoss(meanLoss),
    meanLoss,
    moves: n,
    mistakes,
    strength: pickStrength(humanPlies),
  };
}

function meanLossOf(xs: HumanPly[]): number {
  return xs.reduce((s, p) => s + p.loss, 0) / Math.max(1, xs.length);
}

/**
 * One genuine strength, picked from real data by priority:
 * brilliant gain → long engine-level streak → high best-move rate →
 * stronger second half → most solid phase. Never generic.
 */
function pickStrength(humanPlies: HumanPly[]): CoachStrength {
  const n = humanPlies.length;

  // 1. A best-class move that gained >= 150cp — the standout moment.
  let brilliant: HumanPly | null = null;
  for (const p of humanPlies) {
    if (
      p.cls === "best" &&
      p.swing >= 150 &&
      (!brilliant || p.swing > brilliant.swing)
    ) {
      brilliant = p;
    }
  }
  if (brilliant) {
    return {
      kind: "brilliant",
      moveText: brilliant.moveText,
      gainPawns: `+${(brilliant.swing / 100).toFixed(1)}`,
    };
  }

  // 2. Longest run of consecutive best/good moves (game order) >= 6.
  // Plain for-loop: TS cannot narrow variables assigned in closures.
  let runLen = 0;
  let runFrom = 0;
  let bestLen = 0;
  let bestFrom = 0;
  let bestTo = 0;
  for (let i = 0; i < humanPlies.length; i++) {
    const p = humanPlies[i];
    if (p.cls === "best" || p.cls === "good") {
      if (runLen === 0) runFrom = i;
      runLen++;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestFrom = runFrom;
        bestTo = i;
      }
    } else {
      runLen = 0;
    }
  }
  if (bestLen >= 6) {
    return {
      kind: "streak",
      streak: bestLen,
      fromMove: moveNumberOf(humanPlies[bestFrom].ply),
      toMove: moveNumberOf(humanPlies[bestTo].ply),
    };
  }

  // 3. Best-move rate >= 40%.
  if (n > 0) {
    const rate = Math.round(
      (humanPlies.filter((p) => p.cls === "best").length / n) * 100
    );
    if (rate >= 40) return { kind: "bestRate", rate };
  }

  // 4. Second half more accurate than the first.
  if (n >= 4) {
    const half = Math.floor(n / 2);
    const a1 = accuracyFromMeanLoss(meanLossOf(humanPlies.slice(0, half)));
    const a2 = accuracyFromMeanLoss(meanLossOf(humanPlies.slice(half)));
    if (a2 > a1 + 3) return { kind: "strongFinish", halfBefore: a1, halfAfter: a2 };
  }

  // 5. Fallback: the phase with the lowest mean loss — always real data.
  if (n > 0) {
    const byPhase = new Map<Phase, number[]>();
    for (const p of humanPlies) {
      const ph = phaseOf(moveNumberOf(p.ply));
      const arr = byPhase.get(ph);
      if (arr) arr.push(p.loss);
      else byPhase.set(ph, [p.loss]);
    }
    let phase: Phase = "opening";
    let bestMean = Infinity;
    for (const [ph, losses] of byPhase) {
      const m = losses.reduce((s, l) => s + l, 0) / losses.length;
      if (m < bestMean) {
        bestMean = m;
        phase = ph;
      }
    }
    return { kind: "solidPhase", phase };
  }

  return { kind: "solidPhase", phase: "opening" };
}
