// Jieqi rules engine: move generation, check detection, game status.
//
// Movement model (per the approved design, ~/workspace/co-up/design.md):
//   - A COVERED piece moves, captures and gives check exactly as the piece
//     whose starting square it occupies (its fakeType), using standard
//     Xiangqi rules for that type — palace-bound fake advisors, river-bound
//     fake elephants, forward-only fake pawns (a fake pawn is always still on
//     its home pawn square, which is on its own side of the river).
//   - The first time a covered piece moves it flips face-up; from then on it
//     plays as its trueType, with the Jieqi relaxations: revealed advisors
//     may leave the palace, revealed elephants may cross the river. A
//     revealed pawn's crossed-river status follows its true current square.
//   - The flying-generals rule applies; covered pieces count as blockers.
//   - A captured covered piece is revealed publicly at the moment of capture
//     (see MoveRecord.captured).
//   - Win by checkmate or stalemate (side to move with no legal move loses),
//     exactly as Xiangqi. 120 plies without a capture or a flip is a draw.
//
// The `strictXiangqi` option on move generation removes the advisor/elephant
// relaxations for REVEALED pieces. It exists solely as a verification hook:
// on fully-revealed positions the strict generator must agree move-for-move
// with PacClone's Xiangqi engine (see crosscheck/crosscheck.ts).

import {
  Color,
  FILES,
  GameStatus,
  JBoard,
  JPiece,
  JieqiState,
  Move,
  MoveRecord,
  PieceType,
  RANKS,
  opposite,
} from "./types";

export interface MoveGenOptions {
  /** Verification hook: revealed A/B obey Xiangqi palace/river limits. */
  strictXiangqi?: boolean;
}

function inBoard(x: number, y: number): boolean {
  return x >= 0 && x < FILES && y >= 0 && y < RANKS;
}

function inPalace(color: Color, x: number, y: number): boolean {
  if (x < 3 || x > 5) return false;
  return color === "black" ? y >= 0 && y <= 2 : y >= 7 && y <= 9;
}

function crossedRiver(color: Color, y: number): boolean {
  return color === "red" ? y <= 4 : y >= 5;
}

function isOwn(board: JBoard, x: number, y: number, color: Color): boolean {
  const p = board[y][x];
  return p !== null && p.color === color;
}

/** The type a piece currently moves/attacks as. */
export function effectiveType(p: JPiece): PieceType {
  return p.covered ? p.fakeType : p.trueType;
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG1: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const DIAG2: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [2, -2],
  [-2, 2],
  [-2, -2],
];
const KNIGHT: ReadonlyArray<readonly [number, number]> = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];

/** Pseudo-legal moves for the piece on (x, y). May leave the general in check. */
function pieceMoves(
  board: JBoard,
  x: number,
  y: number,
  strict: boolean
): Move[] {
  const piece = board[y][x];
  if (!piece) return [];
  const { color } = piece;
  const type = effectiveType(piece);
  // Xiangqi restrictions apply to covered pieces (as their fakeType) always,
  // and to revealed pieces only in strict verification mode.
  const restricted = piece.covered || strict;
  const moves: Move[] = [];
  const push = (toX: number, toY: number) => {
    if (inBoard(toX, toY) && !isOwn(board, toX, toY, color)) {
      moves.push({ fromX: x, fromY: y, toX, toY });
    }
  };

  switch (type) {
    case "K": {
      for (const [dx, dy] of ORTHO) {
        const nx = x + dx;
        const ny = y + dy;
        if (inPalace(color, nx, ny)) push(nx, ny);
      }
      // Flying general: capture the enemy general across an open file.
      // Any piece in between — covered or not — blocks.
      const enemy = opposite(color);
      for (let yy = 0; yy < RANKS; yy++) {
        const p = board[yy][x];
        if (p && p.color === enemy && effectiveType(p) === "K") {
          let blocked = false;
          const [lo, hi] = y < yy ? [y, yy] : [yy, y];
          for (let my = lo + 1; my < hi; my++) {
            if (board[my][x]) {
              blocked = true;
              break;
            }
          }
          if (!blocked) moves.push({ fromX: x, fromY: y, toX: x, toY: yy });
          break;
        }
      }
      break;
    }
    case "A": {
      for (const [dx, dy] of DIAG1) {
        const nx = x + dx;
        const ny = y + dy;
        // Revealed advisors ("Sĩ chiến") roam the whole board in Jieqi mode.
        if (restricted && !inPalace(color, nx, ny)) continue;
        push(nx, ny);
      }
      break;
    }
    case "B": {
      for (const [dx, dy] of DIAG2) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        if (restricted) {
          // Xiangqi elephants stay on their own side of the river.
          if (color === "black" && ny > 4) continue;
          if (color === "red" && ny < 5) continue;
        }
        // The "elephant's eye" (midpoint) must be empty.
        if (board[y + dy / 2][x + dx / 2]) continue;
        push(nx, ny);
      }
      break;
    }
    case "N": {
      for (const [dx, dy] of KNIGHT) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBoard(nx, ny)) continue;
        // The "leg" square must be empty.
        const legX = Math.abs(dx) === 2 ? x + dx / 2 : x;
        const legY = Math.abs(dy) === 2 ? y + dy / 2 : y;
        if (board[legY][legX]) continue;
        push(nx, ny);
      }
      break;
    }
    case "R": {
      for (const [dx, dy] of ORTHO) {
        let nx = x + dx;
        let ny = y + dy;
        while (inBoard(nx, ny)) {
          const p = board[ny][nx];
          if (!p) {
            moves.push({ fromX: x, fromY: y, toX: nx, toY: ny });
          } else {
            if (p.color !== color) {
              moves.push({ fromX: x, fromY: y, toX: nx, toY: ny });
            }
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    }
    case "C": {
      for (const [dx, dy] of ORTHO) {
        let nx = x + dx;
        let ny = y + dy;
        // Phase 1: slide like a chariot until the first piece (the screen).
        // The screen may be any piece of either color, covered or not.
        while (inBoard(nx, ny) && !board[ny][nx]) {
          moves.push({ fromX: x, fromY: y, toX: nx, toY: ny });
          nx += dx;
          ny += dy;
        }
        if (!inBoard(nx, ny)) continue;
        // Phase 2: jump the screen; capture the first piece beyond it.
        nx += dx;
        ny += dy;
        while (inBoard(nx, ny)) {
          const p = board[ny][nx];
          if (p) {
            if (p.color !== color) {
              moves.push({ fromX: x, fromY: y, toX: nx, toY: ny });
            }
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    }
    case "P": {
      // Covered pawns sit on their home pawn square (own side of the river),
      // so this yields forward-only movement for them automatically. A
      // revealed pawn uses its TRUE current position for the river test.
      const dy = color === "red" ? -1 : 1;
      push(x, y + dy);
      if (crossedRiver(color, y)) {
        push(x - 1, y);
        push(x + 1, y);
      }
      break;
    }
  }
  return moves;
}

/** All pseudo-legal moves for a color (may leave the general in check). */
export function pseudoMoves(
  board: JBoard,
  color: Color,
  opts: MoveGenOptions = {}
): Move[] {
  const strict = !!opts.strictXiangqi;
  const moves: Move[] = [];
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (p && p.color === color) moves.push(...pieceMoves(board, x, y, strict));
    }
  }
  return moves;
}

/** Board after a move, WITHOUT flipping/capture bookkeeping (legality core). */
function boardAfterMove(board: JBoard, m: Move): JBoard {
  const nb = board.map((row) => row.slice());
  const piece = nb[m.fromY][m.fromX];
  if (piece && piece.covered) {
    nb[m.toY][m.toX] = { ...piece, covered: false };
  } else {
    nb[m.toY][m.toX] = piece;
  }
  nb[m.fromY][m.fromX] = null;
  return nb;
}

export function findGeneral(
  board: JBoard,
  color: Color
): { x: number; y: number } | null {
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (p && p.color === color && p.trueType === "K") return { x, y };
    }
  }
  return null;
}

/** True if (x, y) is attacked by any piece of byColor (flying general counts). */
export function isAttacked(
  board: JBoard,
  x: number,
  y: number,
  byColor: Color,
  opts: MoveGenOptions = {}
): boolean {
  return pseudoMoves(board, byColor, opts).some(
    (m) => m.toX === x && m.toY === y
  );
}

export function isInCheck(
  board: JBoard,
  color: Color,
  opts: MoveGenOptions = {}
): boolean {
  const k = findGeneral(board, color);
  if (!k) return false;
  return isAttacked(board, k.x, k.y, opposite(color), opts);
}

/** Fully legal moves: pseudo-legal moves that don't leave the own general in check. */
export function legalMoves(
  state: JieqiState,
  opts: MoveGenOptions = {}
): Move[] {
  return pseudoMoves(state.board, state.turn, opts).filter((m) => {
    const nb = boardAfterMove(state.board, m);
    return !isInCheck(nb, state.turn, opts);
  });
}

export function legalMovesForSquare(
  state: JieqiState,
  x: number,
  y: number,
  opts: MoveGenOptions = {}
): Move[] {
  return legalMoves(state, opts).filter((m) => m.fromX === x && m.fromY === y);
}

/**
 * Canonical position key. With masked=false the key uses TRUE identities
 * (covered pieces keyed by their true type + covered flag); with masked=true
 * covered pieces collapse to a single "dark" token, so the key is computable
 * from public information alone.
 */
export function positionKey(board: JBoard, turn: Color, masked: boolean): string {
  const parts: string[] = [];
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = board[y][x];
      if (!p) {
        parts.push("..");
      } else if (masked && p.covered) {
        parts.push(p.color === "red" ? "X." : "x.");
      } else {
        parts.push(
          (p.color === "red" ? p.trueType : p.trueType.toLowerCase()) +
            (p.covered ? "d" : "u")
        );
      }
    }
  }
  return parts.join("") + (turn === "red" ? " w" : " b");
}

export function countOccurrences(history: string[], key: string): number {
  let n = 0;
  for (const k of history) if (k === key) n++;
  return n;
}

/** How many times the current (true) position has occurred, >= 1. */
export function repetitionCount(state: JieqiState): number {
  const key = state.keyHistory[state.keyHistory.length - 1];
  return countOccurrences(state.keyHistory, key);
}

/**
 * Apply a (legal) move, returning the next state and a public MoveRecord.
 * The input state is not mutated. Flip and capture-reveal semantics live
 * here: a covered mover flips face-up; a captured covered piece is revealed
 * in the record and in the captured list; either event (or any capture)
 * resets the 120-ply draw counter.
 */
export function applyMove(
  state: JieqiState,
  m: Move
): { state: JieqiState; record: MoveRecord } {
  const mover = state.board[m.fromY][m.fromX];
  if (!mover) throw new Error(`applyMove: no piece at ${m.fromX},${m.fromY}`);
  if (mover.color !== state.turn) {
    throw new Error(`applyMove: piece at ${m.fromX},${m.fromY} is not ${state.turn}'s`);
  }
  const target = state.board[m.toY][m.toX];
  const flipped = mover.covered;

  const board = boardAfterMove(state.board, m);

  const capturedList = state.captured.slice();
  let capturedInfo: MoveRecord["captured"] = null;
  if (target) {
    // The clone keeps its at-capture `covered` flag (it records that the
    // piece was face-down when taken); its identity is public from now on.
    capturedList.push({ ...target });
    capturedInfo = {
      color: target.color,
      trueType: target.trueType,
      wasCovered: target.covered,
    };
  }

  const nextTurn = opposite(state.turn);
  const key = positionKey(board, nextTurn, false);
  const maskedKey = positionKey(board, nextTurn, true);
  const keyHistory = [...state.keyHistory, key];
  const gaveCheck = isInCheck(board, nextTurn);

  const next: JieqiState = {
    board,
    turn: nextTurn,
    pliesSinceCaptureOrFlip: target || flipped ? 0 : state.pliesSinceCaptureOrFlip + 1,
    moveNumber: state.turn === "black" ? state.moveNumber + 1 : state.moveNumber,
    captured: capturedList,
    keyHistory,
    maskedKeyHistory: [...state.maskedKeyHistory, maskedKey],
  };

  const record: MoveRecord = {
    move: m,
    moverTrueType: mover.trueType,
    flipped,
    revealedType: flipped ? mover.trueType : null,
    captured: capturedInfo,
    gaveCheck,
    positionKeyAfter: key,
    repetitionCountAfter: countOccurrences(keyHistory, key),
  };
  return { state: next, record };
}

/**
 * Game status for the side to move. Checkmate and stalemate both lose for
 * the player who cannot move (Xiangqi rule), and take precedence over the
 * 120-ply draw: a "quiet" 120th ply that leaves the opponent without a legal
 * move still ends the game as mate/stalemate, not as a draw.
 */
export function gameStatus(state: JieqiState, opts: MoveGenOptions = {}): GameStatus {
  const inCheck = isInCheck(state.board, state.turn, opts);
  const moves = legalMoves(state, opts);
  if (moves.length === 0) {
    return {
      over: true,
      winner: opposite(state.turn),
      reason: inCheck ? "checkmate" : "stalemate",
      inCheck,
    };
  }
  if (state.pliesSinceCaptureOrFlip >= 120) {
    return { over: true, winner: null, reason: "draw-120", inCheck };
  }
  return { over: false, winner: null, reason: null, inCheck };
}

/** Node count of the legal move tree to `depth` — verification utility. */
export function perft(state: JieqiState, depth: number, opts: MoveGenOptions = {}): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(state, opts)) {
    nodes += perft(applyMove(state, m).state, depth - 1, opts);
  }
  return nodes;
}
