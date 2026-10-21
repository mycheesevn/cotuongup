// Verify every library lesson in lib/jieqi/library.ts: replay each
// lesson from its start FEN through the core engine — every step move
// must be legal at that point; a "mate" quiz step's move must deliver
// checkmate; an "exact" quiz step's move must be legal (it is the
// lesson's prescribed move). Explore steps carry no move.
// Run: bun run scripts/verify-library.ts

import { LIBRARY } from "../lib/jieqi/library";
import {
  applyMove,
  gameStatus,
  legalMoves,
  parseFen,
} from "../lib/jieqi/core";
import type { JieqiState, Move } from "../lib/jieqi/core";

function parseCoordMove(s: string): Move {
  const [a, b] = s.split(">");
  const [fromX, fromY] = a.split(",").map(Number);
  const [toX, toY] = b.split(",").map(Number);
  return { fromX, fromY, toX, toY };
}

let fail = 0;
let lessons = 0;
let moves = 0;
for (const ch of LIBRARY) {
  for (const lesson of ch.lessons) {
    lessons++;
    let state: JieqiState;
    try {
      state = parseFen(lesson.startFen);
    } catch (e) {
      fail++;
      console.log(`${lesson.id}: start FEN does not parse: ${(e as Error).message}`);
      continue;
    }
    if (state.turn !== lesson.startTurn) {
      fail++;
      console.log(`${lesson.id}: FEN turn ${state.turn} != startTurn ${lesson.startTurn}`);
    }
    lesson.steps.forEach((step, i) => {
      if (!step.move) return;
      moves++;
      const m = parseCoordMove(step.move);
      const legal = legalMoves(state).some(
        (x) =>
          x.fromX === m.fromX && x.fromY === m.fromY && x.toX === m.toX && x.toY === m.toY
      );
      if (!legal) {
        fail++;
        console.log(`${lesson.id} step ${i + 1}: move ${step.move} is ILLEGAL`);
        return;
      }
      const next = applyMove(state, m).state;
      if (step.quiz === "mate") {
        const st = gameStatus(next);
        if (!(st.over && st.reason === "checkmate")) {
          fail++;
          console.log(`${lesson.id} step ${i + 1}: quiz=mate but move does not checkmate`);
        }
      }
      state = next;
    });
  }
}
console.log(
  fail === 0
    ? `verify-library: all ${lessons} lessons / ${moves} moves PASS`
    : `verify-library: ${fail} problem(s) found`
);
process.exit(fail === 0 ? 0 : 1);
