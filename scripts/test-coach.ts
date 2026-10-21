// Unit tests for lib/jieqi/coach.ts (pure logic).
// Run with: npx tsx scripts/test-coach.ts

import {
  accuracyFromMeanLoss,
  buildCoachReport,
  type HumanPly,
} from "../lib/jieqi/coach";
import type { MoveClass } from "../lib/jieqi/analysis";

let passed = 0;
let failed = 0;

function ok(cond: boolean, name: string, detail?: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function mk(
  ply: number,
  cls: MoveClass,
  swing: number,
  moveText = `m${ply}`
): HumanPly {
  return {
    ply,
    mover: "red",
    swing,
    loss: Math.max(0, -swing),
    cls,
    moveText,
    bestMove: null,
    bestMoveText: "—",
    evalBefore: 0,
    evalAfter: swing,
  };
}

// --- Accuracy mapping -------------------------------------------------
ok(accuracyFromMeanLoss(0) === 100, "accuracy(0) = 100");
ok(accuracyFromMeanLoss(50) === 76, "accuracy(50) = 76");
ok(accuracyFromMeanLoss(100) === 57, "accuracy(100) = 57");
ok(accuracyFromMeanLoss(200) === 33, "accuracy(200) = 33");
ok(accuracyFromMeanLoss(400) === 11, "accuracy(400) = 11");
ok(
  accuracyFromMeanLoss(10) > accuracyFromMeanLoss(60) &&
    accuracyFromMeanLoss(60) > accuracyFromMeanLoss(300),
  "accuracy monotonic decreasing"
);
ok(accuracyFromMeanLoss(-5) === 100, "accuracy clamps negative loss to 100");

// --- Empty game --------------------------------------------------------
const empty = buildCoachReport([]);
ok(empty.accuracy === 0, "empty game accuracy 0");
ok(empty.moves === 0, "empty game moves 0");
ok(empty.mistakes.length === 0, "empty game no mistakes");

// --- Brilliant strength -------------------------------------------------
const withBrilliant = [
  mk(0, "good", -10),
  mk(2, "best", 180, "炮二平五"),
  mk(4, "good", -20),
];
const r1 = buildCoachReport(withBrilliant);
ok(r1.strength.kind === "brilliant", "brilliant move picked", JSON.stringify(r1.strength));
ok(r1.strength.moveText === "炮二平五", "brilliant move named");
ok(r1.strength.gainPawns === "+1.8", "brilliant gain +1.8");

// best-class with swing < 150 must NOT trigger brilliant.
const noBrilliant = [mk(0, "best", 100), mk(2, "good", -10)];
const r1b = buildCoachReport(noBrilliant);
ok(r1b.strength.kind !== "brilliant", "swing < 150 not brilliant");

// --- Streak strength ----------------------------------------------------
const streaky = Array.from({ length: 8 }, (_, k) => mk(k * 2, k % 3 === 0 ? "best" : "good", -15));
const r2 = buildCoachReport(streaky);
ok(r2.strength.kind === "streak", "streak picked", JSON.stringify(r2.strength));
ok(r2.strength.streak === 8, "streak length 8");
ok(r2.strength.fromMove === 1 && r2.strength.toMove === 8, "streak move range 1-8");

// --- Best-rate strength --------------------------------------------------
const ratey = Array.from({ length: 10 }, (_, k) =>
  mk(k * 2, k % 2 === 0 ? "best" : "inaccuracy", k % 2 === 0 ? 0 : -60)
);
const r3 = buildCoachReport(ratey);
ok(r3.strength.kind === "bestRate", "bestRate picked", JSON.stringify(r3.strength));
ok(r3.strength.rate === 50, "best rate 50%");

// --- Strong finish -------------------------------------------------------
const firstHalf = Array.from({ length: 4 }, (_, k) => mk(k * 2, "mistake", -150));
const secondHalf = Array.from({ length: 4 }, (_, k) => mk(8 + k * 2, "good", -10));
const r4 = buildCoachReport([...firstHalf, ...secondHalf]);
ok(r4.strength.kind === "strongFinish", "strongFinish picked", JSON.stringify(r4.strength));
ok(
  (r4.strength.halfAfter ?? 0) > (r4.strength.halfBefore ?? 0),
  "second half more accurate"
);

// --- Solid phase fallback -------------------------------------------------
// 48 human plies (moveNumbers 1..48): opening 1-10 loss 26, middlegame 11-30
// loss 60, endgame 31-48 loss 30. Halves score 78 vs 81 (no strongFinish,
// needs > 3 gap), no 6-streak, no brilliant — the fallback must pick the
// real lowest-loss phase: opening.
const phased: HumanPly[] = [];
for (let k = 0; k < 48; k++) {
  const swing = k < 10 ? -26 : k < 30 ? -60 : -30;
  phased.push(mk(k * 2, "inaccuracy", swing));
}
const r5 = buildCoachReport(phased);
ok(r5.strength.kind === "solidPhase", "solidPhase fallback picked", JSON.stringify(r5.strength));
ok(r5.strength.phase === "opening", "lowest-loss phase is opening");

// --- Mistake ordering ------------------------------------------------------
const messy = [
  mk(0, "good", -10),
  mk(2, "blunder", -300, "bad1"),
  mk(4, "inaccuracy", -79), // not a mistake class — must be excluded
  mk(6, "mistake", -150, "bad2"),
  mk(8, "blunder", -500, "bad3"),
  mk(10, "mistake", -50, "bad4"),
];
const r6 = buildCoachReport(messy);
ok(r6.mistakes.length === 3, "top 3 mistakes kept");
ok(
  r6.mistakes[0].loss === 500 &&
    r6.mistakes[1].loss === 300 &&
    r6.mistakes[2].loss === 150,
  "mistakes ordered by loss desc",
  JSON.stringify(r6.mistakes.map((m) => m.loss))
);
ok(
  r6.mistakes[0].moveText === "bad3" && r6.mistakes[2].moveText === "bad2",
  "mistake move texts carried"
);
ok(
  r6.mistakes.every((m) => m.cls === "mistake" || m.cls === "blunder"),
  "only mistake/blunder class in mistakes"
);

// Clean game: no mistakes at all.
const clean = [mk(0, "good", -10), mk(2, "best", 20), mk(4, "good", -5)];
const r7 = buildCoachReport(clean);
ok(r7.mistakes.length === 0, "clean game: no mistakes");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
