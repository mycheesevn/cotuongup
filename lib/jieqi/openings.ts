// Xiangqi opening book: recognizes common openings from the move list.
// Move codes are "fromX fromY toX toY" (e.g. "1747" = cannon (1,7) -> (4,7)).

import type { Move } from "./types";

export interface Opening {
  name: { en: string; vi: string };
  moves: string[];
}

export function moveCode(m: Move): string {
  return `${m.fromX}${m.fromY}${m.toX}${m.toY}`;
}

export const OPENINGS: Opening[] = [
  {
    name: { en: "Central Cannon vs Same-Direction Cannon", vi: "Pháo đầu – Thuận pháo" },
    moves: ["1747", "1424"],
  },
  {
    name: { en: "Central Cannon vs Opposite Cannon", vi: "Pháo đầu – Liệt pháo" },
    moves: ["1747", "7242"],
  },
  {
    name: { en: "Central Cannon vs Screen Horses", vi: "Pháo đầu – Bình phong mã" },
    moves: ["1747", "1022"],
  },
  {
    name: { en: "Central Cannon", vi: "Pháo đầu" },
    moves: ["1747"],
  },
  {
    name: { en: "Central Cannon", vi: "Pháo đầu" },
    moves: ["7747"],
  },
  {
    name: { en: "Elephant Opening", vi: "Phi tượng cục" },
    moves: ["2947"],
  },
  {
    name: { en: "Elephant Opening", vi: "Phi tượng cục" },
    moves: ["6947"],
  },
  {
    name: { en: "Horse Opening", vi: "Khởi mã cục" },
    moves: ["1927"],
  },
  {
    name: { en: "Horse Opening", vi: "Khởi mã cục" },
    moves: ["7967"],
  },
];

/** Longest book line matching the start of the played move codes. */
export function detectOpening(codes: string[]): Opening | null {
  let best: Opening | null = null;
  for (const o of OPENINGS) {
    if (o.moves.length > codes.length) continue;
    if (!o.moves.every((m, i) => m === codes[i])) continue;
    if (!best || o.moves.length > best.moves.length) best = o;
  }
  return best;
}
