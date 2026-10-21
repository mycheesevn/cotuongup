// Verify every daily-puzzle fixture in lib/jieqi/puzzles.ts:
// - parses as a full Jieqi FEN with NO covered pieces (fully revealed),
// - Red to move, game not already over, Black not already in check
//   (reachable position),
// - mate.ts proves a forced mate in EXACTLY movesToMate Red moves
//   (mateIn returns the smallest N, so equality proves exactness).
// Run: bun run scripts/verify-puzzles.ts

import { PUZZLES, puzzleState } from "../lib/jieqi/puzzles";
import { gameStatus, isInCheck } from "../lib/jieqi/core";
import { mateIn } from "../lib/jieqi/mate";

let fail = 0;
for (const p of PUZZLES) {
  const problems: string[] = [];
  let state;
  try {
    state = puzzleState(p);
  } catch (e) {
    console.log(`#${p.id}: FEN does not parse: ${(e as Error).message}`);
    fail++;
    continue;
  }
  if (state.turn !== "red") problems.push("not Red to move");
  for (const row of state.board)
    for (const pc of row)
      if (pc?.covered) problems.push("has a covered piece");
  if (gameStatus(state).over) problems.push("game already over");
  if (isInCheck(state.board, "black"))
    problems.push("Black already in check (unreachable)");
  const m = mateIn(state, Math.max(3, p.movesToMate));
  if (!m) problems.push("no forced mate found");
  else if (m.mateIn !== p.movesToMate)
    problems.push(`mateIn=${m.mateIn} but fixture claims ${p.movesToMate}`);
  if (problems.length) {
    fail++;
    console.log(`#${p.id}: FAIL — ${problems.join("; ")}`);
  }
}
console.log(
  fail === 0
    ? `verify-puzzles: all ${PUZZLES.length} fixtures PASS`
    : `verify-puzzles: ${fail}/${PUZZLES.length} fixtures FAILED`
);
process.exit(fail === 0 ? 0 : 1);
