// Extended Jieqi FEN.
//
// Placement field follows the engine-community convention (design §2.7/4.1):
// rows y=0..9, uppercase = Red, lowercase = Black, digits = empty runs, and
// `X`/`x` for a covered (face-down) piece. Revealed pieces use the usual
// Xiangqi letters (k a b n r c p).
//
// FULL FEN (server-side, round-trips the TRUE state) — 7 fields:
//   <placement> <side> <captured> - <quietPlies> <moveNumber> <hidden>
//     side:     `w` = Red to move, `b` = Black to move (as in the design
//               doc's canonical string; Red is the first player).
//     captured: `-`, or `[...]` listing captured pieces by TRUE type,
//               letter case = the captured piece's color.
//     hidden:   true types of all covered pieces, in board scan order
//               (y 0..9, x 0..8), letter case = the piece's color. This
//               field is the secret — it never appears in a public FEN.
//   Example (initial position, seed-dependent hidden field):
//     xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1 RNBA...
//
// PUBLIC FEN (what clients and spectators see) — the same minus <hidden>.
// The initial position's public FEN is exactly the design doc's string:
//   xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1
// parseFen REFUSES a FEN whose placement contains covered pieces but which
// carries no <hidden> field — a public FEN cannot be turned back into a
// playable true state, by design.
//
// Known limitation: a covered piece's fakeType is derived from its square,
// so a covered piece in a parsed FEN must sit on one of its own color's 15
// home squares (true in every reachable game position — a covered piece has
// never moved). Arbitrary setup-editor positions with covered pieces
// elsewhere cannot be expressed yet; build them programmatically instead
// (makeState in build.ts). A REVEALED piece's fakeType is not stored in FEN
// (it is display-only information; move generation never uses it once a
// piece is face-up), so parseFen approximates it from the square.

import { positionKey } from "./engine";
import { hostTypeAt } from "./setup";
import {
  CapturedInfo,
  Color,
  FILES,
  JBoard,
  JPiece,
  JieqiState,
  MaskedState,
  Move,
  PieceType,
  RANKS,
} from "./types";

const LETTER_TO_TYPE: Record<string, PieceType> = {
  k: "K",
  r: "R",
  n: "N",
  c: "C",
  b: "B",
  a: "A",
  p: "P",
};

export const TYPE_TO_LETTER: Record<PieceType, string> = {
  K: "k",
  R: "r",
  N: "n",
  C: "c",
  B: "b",
  A: "a",
  P: "p",
};

function letterFor(color: Color, type: PieceType): string {
  const l = TYPE_TO_LETTER[type];
  return color === "red" ? l.toUpperCase() : l;
}

function placementFromBoard(
  cell: (x: number, y: number) => string | null
): string {
  const rows: string[] = [];
  for (let y = 0; y < RANKS; y++) {
    let row = "";
    let empty = 0;
    for (let x = 0; x < FILES; x++) {
      const s = cell(x, y);
      if (s === null) {
        empty++;
      } else {
        if (empty > 0) {
          row += empty;
          empty = 0;
        }
        row += s;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  return rows.join("/");
}

function capturedField(captured: CapturedInfo[] | JPiece[]): string {
  if (captured.length === 0) return "-";
  const letters = captured
    .map((c) => letterFor(c.color, c.trueType))
    .join("");
  return `[${letters}]`;
}

function sideField(turn: Color): string {
  return turn === "red" ? "w" : "b";
}

/** Full true-state FEN (7 fields, includes the secret hidden field). */
export function toFen(state: JieqiState): string {
  const placement = placementFromBoard((x, y) => {
    const p = state.board[y][x];
    if (!p) return null;
    if (p.covered) return p.color === "red" ? "X" : "x";
    return letterFor(p.color, p.trueType);
  });
  const hidden: string[] = [];
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const p = state.board[y][x];
      if (p && p.covered) hidden.push(letterFor(p.color, p.trueType));
    }
  }
  return [
    placement,
    sideField(state.turn),
    capturedField(state.captured),
    "-",
    String(state.pliesSinceCaptureOrFlip),
    String(state.moveNumber),
    hidden.join(""),
  ].join(" ");
}

/** Public FEN of a true state — identical to maskedFen(maskState(state)). */
export function toPublicFen(state: JieqiState): string {
  const placement = placementFromBoard((x, y) => {
    const p = state.board[y][x];
    if (!p) return null;
    if (p.covered) return p.color === "red" ? "X" : "x";
    return letterFor(p.color, p.trueType);
  });
  return [
    placement,
    sideField(state.turn),
    capturedField(state.captured),
    "-",
    String(state.pliesSinceCaptureOrFlip),
    String(state.moveNumber),
  ].join(" ");
}

/** Public FEN of a masked state (6 fields, no hidden information). */
export function maskedFen(masked: MaskedState): string {
  const placement = placementFromBoard((x, y) => {
    const p = masked.board[y][x];
    if (!p) return null;
    if (p.covered) return p.color === "red" ? "X" : "x";
    if (p.trueType === null) {
      throw new Error("maskedFen: revealed piece without a true type");
    }
    return letterFor(p.color, p.trueType);
  });
  return [
    placement,
    sideField(masked.turn),
    capturedField(masked.captured),
    "-",
    String(masked.pliesSinceCaptureOrFlip),
    String(masked.moveNumber),
  ].join(" ");
}

/**
 * Parse a FULL FEN (with hidden field) back into a true state.
 * Throws on a public FEN that contains covered pieces — see header note.
 * Repetition history starts fresh: only the parsed position is counted.
 */
export function parseFen(fen: string): JieqiState {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6 && fields.length !== 7) {
    throw new Error(`bad FEN field count (${fields.length}): ${fen}`);
  }
  const [placement, side, capturedRaw, , quietRaw, moveRaw, hidden] = fields;
  const turn: Color = side === "w" ? "red" : side === "b" ? "black" : (() => {
    throw new Error(`bad FEN side field: ${side}`);
  })();

  const board: JBoard = Array.from({ length: RANKS }, () =>
    Array<JPiece | null>(FILES).fill(null)
  );
  const coveredSquares: { x: number; y: number; p: JPiece }[] = [];
  const rows = placement.split("/");
  if (rows.length !== RANKS) throw new Error(`bad FEN row count: ${fen}`);
  let nextId = 0;
  for (let y = 0; y < RANKS; y++) {
    let x = 0;
    for (const ch of rows[y]) {
      if (ch >= "0" && ch <= "9") {
        x += Number(ch);
        continue;
      }
      const color: Color = ch === ch.toUpperCase() ? "red" : "black";
      if (ch === "X" || ch === "x") {
        const p: JPiece = {
          id: nextId++,
          color,
          trueType: "P", // placeholder, replaced from the hidden field below
          fakeType: "P", // placeholder, replaced from the square below
          covered: true,
        };
        board[y][x] = p;
        coveredSquares.push({ x, y, p });
      } else {
        const type = LETTER_TO_TYPE[ch.toLowerCase()];
        if (!type) throw new Error(`bad FEN piece: ${ch}`);
        board[y][x] = {
          id: nextId++,
          color,
          trueType: type,
          fakeType: hostTypeAt(color, x, y) ?? type,
          covered: false,
        };
      }
      x++;
    }
    if (x !== FILES) throw new Error(`bad FEN row width: ${rows[y]}`);
  }

  if (coveredSquares.length > 0) {
    if (hidden === undefined) {
      throw new Error(
        "FEN has covered pieces but no hidden field — a public FEN cannot be parsed into a true state"
      );
    }
    if (hidden.length !== coveredSquares.length) {
      throw new Error(
        `hidden field length ${hidden.length} != covered piece count ${coveredSquares.length}`
      );
    }
    coveredSquares.forEach((sq, i) => {
      const ch = hidden[i];
      const type = LETTER_TO_TYPE[ch.toLowerCase()];
      if (!type) throw new Error(`bad hidden piece letter: ${ch}`);
      const color: Color = ch === ch.toUpperCase() ? "red" : "black";
      if (color !== sq.p.color) {
        throw new Error(`hidden field color mismatch at ${sq.x},${sq.y}`);
      }
      const host = hostTypeAt(sq.p.color, sq.x, sq.y);
      if (host === null) {
        throw new Error(
          `covered piece at ${sq.x},${sq.y} is not on a home square of ${sq.p.color}`
        );
      }
      sq.p.trueType = type;
      sq.p.fakeType = host;
    });
  }

  const captured: JPiece[] = [];
  if (capturedRaw !== "-") {
    const m = /^\[(.*)\]$/.exec(capturedRaw);
    if (!m) throw new Error(`bad FEN captured field: ${capturedRaw}`);
    for (const ch of m[1]) {
      const type = LETTER_TO_TYPE[ch.toLowerCase()];
      if (!type) throw new Error(`bad captured piece letter: ${ch}`);
      captured.push({
        id: nextId++,
        color: ch === ch.toUpperCase() ? "red" : "black",
        trueType: type,
        fakeType: type,
        covered: false,
      });
    }
  }

  const state: JieqiState = {
    board,
    turn,
    pliesSinceCaptureOrFlip: Number(quietRaw),
    moveNumber: Number(moveRaw),
    captured,
    keyHistory: [positionKey(board, turn, false)],
    maskedKeyHistory: [positionKey(board, turn, true)],
  };
  return state;
}

// ---------------------------------------------------------------------------
// Move notation: coordinate form like PacClone's UCI convention —
// files a..i for x 0..8, a single digit for y 0..9 (e.g. "b9c7"). A move
// that flips a piece appends the revealed true type as a lowercase letter
// suffix, per the design doc (UCI: `b9c7c` = b9→c7, revealed a cannon).
// ---------------------------------------------------------------------------

export function squareToUci(x: number, y: number): string {
  return "abcdefghi"[x] + String(y);
}

export function moveToUci(m: Move, revealedType?: PieceType | null): string {
  return (
    squareToUci(m.fromX, m.fromY) +
    squareToUci(m.toX, m.toY) +
    (revealedType ? TYPE_TO_LETTER[revealedType] : "")
  );
}

export function parseUci(uci: string): { move: Move; revealedType: PieceType | null } {
  if (uci.length !== 4 && uci.length !== 5) {
    throw new Error(`bad UCI move: ${uci}`);
  }
  const sq = (s: string): { x: number; y: number } => {
    const x = "abcdefghi".indexOf(s[0]);
    const y = Number(s[1]);
    if (x < 0 || !Number.isInteger(y) || y < 0 || y > 9) {
      throw new Error(`bad UCI square: ${s}`);
    }
    return { x, y };
  };
  const from = sq(uci.slice(0, 2));
  const to = sq(uci.slice(2, 4));
  let revealedType: PieceType | null = null;
  if (uci.length === 5) {
    revealedType = LETTER_TO_TYPE[uci[4]] ?? null;
    if (!revealedType) throw new Error(`bad UCI flip suffix: ${uci[4]}`);
  }
  return {
    move: { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y },
    revealedType,
  };
}
