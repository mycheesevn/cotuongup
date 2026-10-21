// Client-side derivations from a MaskedState (Cờ Úp rooms / corr).
//
// Everything here runs on PUBLIC information only: a covered piece's
// `fakeType` (its host square) and every revealed piece's `trueType` are
// public, and that is provably enough to compute legal move targets —
// covered pieces move/attack as their host type, and whether a move
// leaves your own general in check depends on enemy attacks (host/true
// types, both public) and on occupancy, never on a hidden identity.
//
// `maskedToPlaceholderState` builds a JieqiState whose covered pieces
// carry `trueType := fakeType` as a PLACEHOLDER. It is used ONLY for
// move-target display, check display and move-list labels — never for
// applying a room move (the server does that) and never for the AI.

import { viewBoard } from "../jieqi/engine";
import type { ViewBoard } from "../jieqi/types";
import {
  applyMove,
  createGame,
  homeSquares,
  layoutString,
  maskState,
  parseFen,
  parseUci,
  TYPE_TO_LETTER,
  type CapturedInfo,
  type Color,
  type JieqiState,
  type MaskedState,
  type Move,
  type PieceType,
} from "../jieqi/core";
import { PIECE_NAMES_EN, PIECE_NAMES_VI } from "../jieqi/notation";
import type { Lang } from "../jieqi/i18n";

/**
 * Contract ViewPiece / ViewBoard (BUILD_CONTRACT §adapter) and the
 * canonical MaskedState → ViewBoard derivation live in Agent A's
 * adapter (`viewBoardMasked` in lib/jieqi/engine.ts) — re-exported here
 * so rooms code has one import surface. The semantics are identical to
 * what this module originally derived inline (covered → faceType =
 * hostType, ids square-derived), so views may use either import path.
 */
export { viewBoardMasked as viewBoardFromMasked } from "../jieqi/engine";
export type { ViewBoard, ViewPiece } from "../jieqi/types";

/** Placeholder true state for target/check computation (see header). */
export function maskedToPlaceholderState(m: MaskedState): JieqiState {
  let id = 0;
  const board = m.board.map((row) =>
    row.map((p) => {
      if (!p) return null;
      return {
        id: id++,
        color: p.color,
        trueType: p.covered ? p.fakeType : (p.trueType ?? p.fakeType),
        fakeType: p.fakeType,
        covered: p.covered,
      };
    })
  );
  const captured = m.captured.map((c) => ({
    id: id++,
    color: c.color,
    trueType: c.trueType,
    fakeType: c.trueType,
    covered: c.wasCovered,
  }));
  return {
    board,
    turn: m.turn,
    pliesSinceCaptureOrFlip: m.pliesSinceCaptureOrFlip,
    moveNumber: m.moveNumber,
    captured,
    // Repetition keys are not reconstructible from a masked snapshot and
    // are not needed for target/check display — the SERVER is the
    // authority on repetition/draw adjudication.
    keyHistory: [],
    maskedKeyHistory: [],
  };
}

/**
 * The initial masked state of ANY deal. The engine guarantees the
 * initial masked view is byte-identical across all deals (every covered
 * piece is just "a covered piece on its home square"), so dealing a
 * throwaway local game and masking it yields the exact starting view.
 */
export function initialMaskedState(): MaskedState {
  return maskState(createGame(0));
}

/** Captured list encoded in a public FEN's captured field, in order. */
export function capturedFromPublicFen(publicFen: string): CapturedInfo[] {
  const field = publicFen.trim().split(/\s+/)[2] ?? "-";
  if (field === "-" || !field.startsWith("[")) return [];
  const letterToType: Record<string, PieceType> = {
    k: "K", r: "R", n: "N", c: "C", b: "B", a: "A", p: "P",
  };
  const out: CapturedInfo[] = [];
  for (const ch of field.slice(1, -1)) {
    const t = letterToType[ch.toLowerCase()];
    if (t) out.push({ color: ch === ch.toUpperCase() ? "red" : "black", trueType: t, wasCovered: false });
  }
  return out;
}

/**
 * Rebuild the current MaskedState from public data alone (public FEN +
 * UCI move list) — the guest path, where /api/rooms/state (auth-gated)
 * is unavailable. Replays placeholder states, patching each flipped
 * piece's identity from its UCI suffix and each captured piece's
 * identity from the FEN captured list (capture order) — all public.
 */
export function maskedFromPublic(publicFen: string, moves: string): MaskedState {
  const ucis = moves ? moves.split(",").filter(Boolean) : [];
  const capturedFinal = capturedFromPublicFen(publicFen);
  let state = maskedToPlaceholderState(initialMaskedState());
  let captureIdx = 0;
  for (const uci of ucis) {
    const { move, revealedType } = parseUci(uci);
    const target = state.board[move.toY][move.toX];
    const { state: next } = applyMove(state, move);
    if (revealedType) {
      const moved = next.board[move.toY][move.toX];
      if (moved) moved.trueType = revealedType;
    }
    if (target) {
      const cap = capturedFinal[captureIdx++];
      if (cap) {
        // Patch the captured clone's identity to the public truth.
        const clone = next.captured[next.captured.length - 1];
        if (clone) {
          clone.trueType = cap.trueType;
          clone.covered = target.covered;
        }
      }
    }
    state = next;
  }
  return maskState(state);
}

/** True layout board (ViewPiece[][]) from a revealed full FEN. */
export function viewBoardFromTrueFen(trueFen: string): ViewBoard {
  return viewBoard(parseFen(trueFen));
}

export { layoutString };

/**
 * Move-list labels for a room/corr game, from the FINAL masked state +
 * UCI list. Replays placeholder states (same patching as
 * maskedFromPublic) so each ply's mover shows its host type when it
 * flipped, its true type otherwise, plus the `=<type>` flip suffix.
 */
export function maskedMoveLabels(
  finalMasked: MaskedState,
  moves: string,
  lang: Lang
): string[] {
  const ucis = moves ? moves.split(",").filter(Boolean) : [];
  const capturedFinal = finalMasked.captured;
  let state = maskedToPlaceholderState(initialMaskedState());
  let captureIdx = 0;
  const labels: string[] = [];
  const names = lang === "vi" ? PIECE_NAMES_VI : PIECE_NAMES_EN;
  for (let i = 0; i < ucis.length; i++) {
    const { move, revealedType } = parseUci(ucis[i]);
    const mover = state.board[move.fromY][move.fromX];
    const moverColor: Color = i % 2 === 0 ? "red" : "black";
    const wasCovered = !!mover?.covered;
    const displayType: PieceType = mover
      ? wasCovered
        ? mover.fakeType
        : mover.trueType
      : "P";
    const coords = `${move.fromX},${move.fromY}→${move.toX},${move.toY}`;
    const colorName =
      lang === "vi"
        ? moverColor === "red"
          ? "đỏ"
          : "đen"
        : moverColor === "red"
          ? "Red"
          : "Black";
    let label =
      lang === "vi"
        ? `${names[displayType]} ${colorName} ${coords}`
        : `${colorName} ${names[displayType]} ${coords}`;
    if (revealedType) label += ` =${names[revealedType]}`;
    labels.push(label);

    const target = state.board[move.toY][move.toX];
    const { state: next } = applyMove(state, move);
    if (revealedType) {
      const moved = next.board[move.toY][move.toX];
      if (moved) moved.trueType = revealedType;
    }
    if (target) {
      const cap = capturedFinal[captureIdx++];
      const clone = next.captured[next.captured.length - 1];
      if (cap && clone) {
        clone.trueType = cap.trueType;
        clone.covered = target.covered;
      }
    }
    state = next;
  }
  return labels;
}

/** UCI suffix letter for a PieceType (for tests / debugging). */
export function suffixOf(t: PieceType): string {
  return TYPE_TO_LETTER[t];
}

/** Home-square host lookup re-export (guest board building). */
export { homeSquares };
export type { Move };

/**
 * Transitional adapter for the current Board component, which still
 * takes the legacy `{type, color}` piece grid: a covered piece is drawn
 * with its HOST type (Agent B's brass-back rendering replaces this —
 * when Board takes ViewPiece[][], pass the ViewBoard directly).
 */
export interface LegacyPieceLike {
  type: PieceType;
  color: Color;
}
export function legacyBoardFromView(
  vb: ViewBoard
): (LegacyPieceLike | null)[][] {
  return vb.map((row) =>
    row.map((p) =>
      p ? { type: p.covered ? p.hostType : p.faceType, color: p.color } : null
    )
  );
}
