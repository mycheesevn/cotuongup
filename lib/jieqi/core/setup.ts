// Game setup: seeded shuffle of the dark pieces onto their home squares,
// canonical layout encoding, and the anti-cheat commitment hash.
//
// Anti-cheat flow for rooms (design §7): before the game the server picks a
// secret seed, deals the game with createGame(seed), and PUBLISHES
// commitmentForSeed(seed). The seed itself stays in the server-only secrets
// table. When the game ends the server reveals the seed; anyone can then
// recompute the layout with createGame(seed) and check both the layout and
// the commitment — proving the cards were never re-dealt mid-game.

import { positionKey } from "./engine";
import { sha256Hex } from "./hash";
import { rngFromSeed, shuffle } from "./rng";
import {
  BACK_RANK,
  Color,
  DARK_MULTISET,
  FILES,
  JBoard,
  JPiece,
  JieqiState,
  PieceType,
  RANKS,
} from "./types";

/** The 15 home squares of one color that receive covered pieces, in a fixed
 * canonical order: back rank left→right (skipping the general), then the two
 * cannon squares, then the five pawn squares. */
export function homeSquares(color: Color): { x: number; y: number; host: PieceType }[] {
  const backY = color === "red" ? 9 : 0;
  const cannonY = color === "red" ? 7 : 2;
  const pawnY = color === "red" ? 6 : 3;
  const out: { x: number; y: number; host: PieceType }[] = [];
  for (let x = 0; x < FILES; x++) {
    if (BACK_RANK[x] === "K") continue;
    out.push({ x, y: backY, host: BACK_RANK[x] });
  }
  for (const x of [1, 7]) out.push({ x, y: cannonY, host: "C" });
  for (const x of [0, 2, 4, 6, 8]) out.push({ x, y: pawnY, host: "P" });
  return out;
}

/** Host (fake) type of a square, if it is one of `color`'s home squares. */
export function hostTypeAt(color: Color, x: number, y: number): PieceType | null {
  for (const s of homeSquares(color)) {
    if (s.x === x && s.y === y) return s.host;
  }
  return null;
}

function emptyBoard(): JBoard {
  return Array.from({ length: RANKS }, () =>
    Array<JPiece | null>(FILES).fill(null)
  );
}

/** Renumber piece ids in scan order (y 0..9, x 0..8) — deterministic ids make
 * createGame and parseFen produce identical states for the same layout. */
function renumberIds(board: JBoard): void {
  let id = 0;
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (p) p.id = id++;
    }
  }
}

/**
 * Deal a new game. With a seed, the layout is fully determined by the seed
 * (string seeds are hashed). An explicit RNG may be injected instead — used
 * by tests and by the server when it wants its own entropy source; in that
 * case reproducibility is the caller's responsibility.
 */
export function createGame(seed: number | string = 0): JieqiState {
  return createGameWithRng(rngFromSeed(seed));
}

export function createGameWithRng(rng: () => number): JieqiState {
  const board = emptyBoard();
  for (const color of ["black", "red"] as const) {
    const generalY = color === "red" ? 9 : 0;
    board[generalY][4] = {
      id: -1,
      color,
      trueType: "K",
      fakeType: "K",
      covered: false,
    };
    const pieces = shuffle([...DARK_MULTISET], rng);
    const squares = homeSquares(color);
    for (let i = 0; i < squares.length; i++) {
      const s = squares[i];
      board[s.y][s.x] = {
        id: -1,
        color,
        trueType: pieces[i],
        fakeType: s.host,
        covered: true,
      };
    }
  }
  renumberIds(board);
  const state: JieqiState = {
    board,
    turn: "red",
    pliesSinceCaptureOrFlip: 0,
    moveNumber: 1,
    captured: [],
    keyHistory: [positionKey(board, "red", false)],
    maskedKeyHistory: [positionKey(board, "red", true)],
  };
  return state;
}

/**
 * Canonical string of the TRUE layout: for every square, ".." if empty, else
 * color + trueType + "d" (covered) / "u" (face-up). This is what the
 * commitment binds. Two layouts with the same string are the same deal.
 */
export function layoutString(state: JieqiState): string {
  const parts: string[] = [];
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = state.board[y][x];
      if (!p) parts.push("..");
      else
        parts.push(
          (p.color === "red" ? "R" : "B") + p.trueType + (p.covered ? "d" : "u")
        );
    }
  }
  return parts.join("");
}

/** SHA-256 commitment for a seed: binds the seed AND the layout it deals. */
export function commitmentForSeed(seed: number | string): string {
  const layout = layoutString(createGame(seed));
  return sha256Hex(`jieqi-commit-v1|${String(seed)}|${layout}`);
}

/** Commitment for an already-dealt layout + its seed (same value as
 * commitmentForSeed when the state was dealt from that seed). */
export function commitmentForState(seed: number | string, state: JieqiState): string {
  return sha256Hex(`jieqi-commit-v1|${String(seed)}|${layoutString(state)}`);
}

/** Verify a revealed seed against a commitment published before the game. */
export function verifyCommitment(seed: number | string, commitment: string): boolean {
  return commitmentForSeed(seed) === commitment;
}
