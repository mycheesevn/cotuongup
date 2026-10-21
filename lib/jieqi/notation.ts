import type { Color, Move, MoveRecord, PieceType } from "./types";
import type { Lang } from "./i18n";

/** Vietnamese piece names. */
export const PIECE_NAMES_VI: Record<PieceType, string> = {
  K: "Tướng",
  A: "Sĩ",
  B: "Tượng",
  N: "Mã",
  R: "Xe",
  C: "Pháo",
  P: "Tốt",
};

/** English piece names. */
export const PIECE_NAMES_EN: Record<PieceType, string> = {
  K: "King",
  A: "Advisor",
  B: "Elephant",
  N: "Horse",
  R: "Chariot",
  C: "Cannon",
  P: "Pawn",
};

export function pieceName(type: PieceType, lang: Lang): string {
  return lang === "vi" ? PIECE_NAMES_VI[type] : PIECE_NAMES_EN[type];
}

/**
 * Flip suffix for a move that revealed a covered piece: `=<type name>`
 * (e.g. "=Xe" in Vietnamese, "=Chariot" in English), per the build
 * contract. Empty string when the move didn't flip anything.
 */
export function flipSuffix(
  record: Pick<MoveRecord, "flipped" | "revealedType"> | null | undefined,
  lang: Lang
): string {
  if (!record?.flipped || !record.revealedType) return "";
  return `=${pieceName(record.revealedType, lang)}`;
}

/**
 * Human-readable move text, e.g. "Pháo đỏ 7,7→4,7" (vi),
 * "Red Cannon 7,7→4,7" (en).
 *
 * Signature-compatible with PacClone's moveEntryText(color, type, move,
 * lang): `type` is the type the piece MOVED as (for a covered piece, its
 * host type — pass ViewPiece.faceType / core effectiveType). Pass the
 * applyMove `record` as the optional 5th argument to append the flip
 * suffix ("…→…=Xe") when the move flipped a covered piece face-up.
 */
export function moveEntryText(
  color: Color,
  type: PieceType,
  move: Move,
  lang: Lang,
  record?: Pick<MoveRecord, "flipped" | "revealedType"> | null
): string {
  const coords = `${move.fromX},${move.fromY}→${move.toX},${move.toY}`;
  const suffix = flipSuffix(record, lang);
  if (lang === "vi") {
    return `${PIECE_NAMES_VI[type]} ${color === "red" ? "đỏ" : "đen"} ${coords}${suffix}`;
  }
  return `${color === "red" ? "Red" : "Black"} ${PIECE_NAMES_EN[type]} ${coords}${suffix}`;
}
