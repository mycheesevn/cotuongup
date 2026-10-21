// Core types for Jieqi (揭棋) — Vietnamese "Cờ Úp" (dark xiangqi).
//
// Board coordinates mirror the family Xiangqi engine (PacClone):
//   x = file 0..8 (left to right), y = rank 0..9 (top to bottom).
//   Black starts at the top (y = 0..4), Red at the bottom (y = 5..9).
//
// A Jieqi piece is a PHYSICAL piece with two identities:
//   - trueType: what the piece really is. Hidden while the piece is covered.
//   - fakeType: the piece whose STARTING SQUARE the physical piece sits on.
//     While covered, the piece moves / captures / gives check exactly as
//     fakeType (standard Xiangqi rules for that type, at its current square).
//     The first time it moves, it flips face-up and from then on plays as
//     trueType (with the Jieqi relaxations for advisors and elephants).
// Generals are never covered: they start face-up on their palace square, so
// no covered piece ever has fakeType "K".

export type Color = "red" | "black";
export type PieceType = "K" | "A" | "B" | "N" | "R" | "C" | "P";

export interface JPiece {
  /** Stable id of the physical piece within one game (0..31). */
  id: number;
  color: Color;
  /** Real identity. SECRET while `covered` is true. */
  trueType: PieceType;
  /** Identity of the home square this piece started on. Public information. */
  fakeType: PieceType;
  /** True while the piece is still face-down (has never moved). */
  covered: boolean;
}

/** board[y][x], each square holds a physical piece or null. */
export type JBoard = (JPiece | null)[][];

export interface Move {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export const FILES = 9;
export const RANKS = 10;

export function opposite(color: Color): Color {
  return color === "red" ? "black" : "red";
}

export const PIECE_TYPES: readonly PieceType[] = [
  "K",
  "A",
  "B",
  "N",
  "R",
  "C",
  "P",
];

/** The 15 non-general pieces each side shuffles face-down onto its home squares. */
export const DARK_MULTISET: readonly PieceType[] = [
  "R", "R",
  "N", "N",
  "B", "B",
  "A", "A",
  "C", "C",
  "P", "P", "P", "P", "P",
];

/** Standard Xiangqi back-rank layout by file (x = 0..8). */
export const BACK_RANK: readonly PieceType[] = [
  "R", "N", "B", "A", "K", "A", "B", "N", "R",
];

/**
 * Public (masked) view of one piece. For a covered piece `trueType` is null —
 * the masked view NEVER carries an unrevealed identity. `fakeType` is public:
 * it is determined by the piece's starting square, which everyone can see,
 * and a covered piece is always still on its starting square.
 */
export interface MaskedPiece {
  color: Color;
  covered: boolean;
  trueType: PieceType | null;
  fakeType: PieceType;
}

/** board[y][x] masked view. */
export type MaskedBoard = (MaskedPiece | null)[][];

export interface CapturedInfo {
  color: Color;
  trueType: PieceType;
  /** True if the piece was still face-down when captured (revealed at capture). */
  wasCovered: boolean;
}

/** Everything a client/spectator may see. Contains no hidden information. */
export interface MaskedState {
  board: MaskedBoard;
  turn: Color;
  /** Plies since the last capture or flip (the 120-ply draw counter). */
  pliesSinceCaptureOrFlip: number;
  moveNumber: number;
  /** Captured pieces with their true identities (captures are public). */
  captured: CapturedInfo[];
  /** Occurrence counts of MASKED position keys, oldest first history folded in. */
  maskedRepCounts: Record<string, number>;
  /** Occurrence count of the current masked position (>= 1). */
  currentMaskedRepetitions: number;
}

/** Full (server-side) game state. NEVER send this to a client mid-game. */
export interface JieqiState {
  board: JBoard;
  turn: Color;
  /** Plies since the last capture or flip; reaching 120 ends the game drawn. */
  pliesSinceCaptureOrFlip: number;
  /** Fullmove number, starts at 1, increments after Black's move. */
  moveNumber: number;
  /**
   * Captured physical pieces, in capture order. A clone keeps the `covered`
   * flag it had at the moment of capture (informational: the piece was
   * revealed publicly when captured, per ruling 3).
   */
  captured: JPiece[];
  /** Position keys (true identity) of every position so far, incl. the start. */
  keyHistory: string[];
  /** Position keys (masked identity) of every position so far, incl. start. */
  maskedKeyHistory: string[];
}

/** What happened when a move was applied. All fields are public information. */
export interface MoveRecord {
  move: Move;
  /** True identity of the moving piece (it is face-up after the move). */
  moverTrueType: PieceType;
  /** True if this move flipped the moving piece face-up for the first time. */
  flipped: boolean;
  /** The identity revealed by the flip, or null if the piece was already up. */
  revealedType: PieceType | null;
  /** Capture info, or null. A captured covered piece is revealed here. */
  captured: CapturedInfo | null;
  /** True if the move leaves the opponent in check. */
  gaveCheck: boolean;
  /** True-position key after the move. */
  positionKeyAfter: string;
  /** Occurrence count of the position after the move (>= 1). */
  repetitionCountAfter: number;
}

export type GameEndReason =
  | "checkmate"
  | "stalemate"
  | "draw-120"
  | null;

export interface GameStatus {
  over: boolean;
  winner: Color | null;
  reason: GameEndReason;
  inCheck: boolean;
}
