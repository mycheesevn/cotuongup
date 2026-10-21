// Generate engine-verified daily-puzzle fixtures for Cờ Úp.
//
// Every fixture is a FULLY-REVEALED Jieqi position (no covered pieces),
// Red to move, and is kept only when lib/jieqi/mate.ts proves a forced
// mate in EXACTLY the stated number of Red moves (no shorter mate, and
// the defender is not already checkmated/stalemated). Positions are
// sparse endgames sampled around the black palace, then deduplicated by
// FEN. Run: bun run scripts/gen-puzzle-fixtures.ts > fixtures.txt
// The output is pasted into lib/jieqi/puzzles.ts (which is then checked
// independently by scripts/verify-puzzles.ts).

import { makeState, toFen, gameStatus, isInCheck } from "../lib/jieqi/core";
import type { Placement } from "../lib/jieqi/core/build";
import { mateIn } from "../lib/jieqi/mate";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(20261021);
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T,>(arr: readonly T[]): T => arr[ri(arr.length)];

const ATTACKERS = ["R", "R", "C", "N", "P"] as const;
const DEFENDERS = ["A", "B", "N", "R", "C", "P"] as const;

interface Found {
  fen: string;
  mate: number;
}

const found: Found[] = [];
const seenFen = new Set<string>();
const want: Record<number, number> = { 1: 14, 2: 10, 3: 6 };
const have: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

let attempts = 0;
while (
  (have[1] < want[1] || have[2] < want[2] || have[3] < want[3]) &&
  attempts < 60000
) {
  attempts++;
  const placements: Placement[] = [];
  const used = new Set<string>();
  const put = (p: Placement) => {
    const k = `${p.x},${p.y}`;
    if (used.has(k)) return false;
    used.add(k);
    placements.push(p);
    return true;
  };
  // Black king in its palace; Red king in its palace, not facing.
  const bk = { x: 3 + ri(3), y: ri(3) };
  let rk = { x: 3 + ri(3), y: 7 + ri(3) };
  if (rk.x === bk.x) rk = { x: (rk.x + 1) % 3 + 3, y: rk.y };
  put({ x: bk.x, y: bk.y, color: "black", trueType: "K" });
  put({ x: rk.x, y: rk.y, color: "red", trueType: "K" });
  // 2–3 red attackers, biased toward the black half.
  const nAtk = 2 + ri(2);
  for (let i = 0; i < nAtk; i++) {
    const t = pick(ATTACKERS);
    for (let tries = 0; tries < 8; tries++) {
      if (put({ x: ri(9), y: ri(7), color: "red", trueType: t })) break;
    }
  }
  // 0–2 black defenders.
  const nDef = ri(3);
  for (let i = 0; i < nDef; i++) {
    const t = pick(DEFENDERS);
    for (let tries = 0; tries < 8; tries++) {
      if (put({ x: ri(9), y: ri(6), color: "black", trueType: t })) break;
    }
  }
  let state;
  try {
    state = makeState(placements, { turn: "red" });
  } catch {
    continue;
  }
  if (gameStatus(state).over) continue;
  // Reachable-position filter: the defender may not already be in check
  // on the attacker's move (that position could never occur in a game).
  if (isInCheck(state.board, "black")) continue;
  const m = mateIn(state, 3);
  if (!m) continue;
  if (have[m.mateIn] >= want[m.mateIn]) continue;
  const fen = toFen(state).trim();
  if (seenFen.has(fen)) continue;
  seenFen.add(fen);
  have[m.mateIn]++;
  found.push({ fen, mate: m.mateIn });
}

found.sort((a, b) => a.mate - b.mate);
found.forEach((f, i) => {
  console.log(`  { id: ${i + 1}, fen: "${f.fen}", movesToMate: ${f.mate} },`);
});
console.error(
  `attempts=${attempts} mate1=${have[1]} mate2=${have[2]} mate3=${have[3]}`
);
