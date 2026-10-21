// Per-move natural-language commentary for game replays.
// Built from engine analysis: move classification, eval swing, captures,
// checks, checkmates and opening recognition. Bilingual (EN/VI).

import {
  analyzePly,
  classifyMove,
  decodeMove,
  formatEval,
  moveText,
  positionAt,
  MATE_CP,
  type MoveClass,
  type PlyAnalysis,
} from "./analysis";
import { detectOpening } from "./openings";
import { applyMove, gameStatus, isInCheck } from "./engine";
import {
  Color,
  JieqiState,
  PieceType,
  opposite,
} from "./types";
import { pieceName as localizedPieceName } from "./notation";
import type { Lang } from "./i18n";
import { PIECE_NAMES_VI, PIECE_NAMES_EN } from "./notation";

export interface MoveComment {
  cls: MoveClass;
  headline: string;
  details: string[];
}

function pieceName(t: PieceType, lang: Lang): string {
  return lang === "vi" ? PIECE_NAMES_VI[t] : PIECE_NAMES_EN[t];
}

function sideName(color: Color, lang: Lang): string {
  if (lang === "vi") return color === "red" ? "Đỏ" : "Đen";
  return color === "red" ? "Red" : "Black";
}

/**
 * Build commentary for the move played at 1-based `ply`
 * (i.e. codes[ply - 1]), using the cached analyses before/after it.
 */
export function commentOnMove(args: {
  lang: Lang;
  ply: number;
  codes: string[];
  before: PlyAnalysis;
  after: PlyAnalysis;
  startState?: JieqiState;
}): MoveComment {
  const { lang, ply, codes, before, after } = args;
  const startState = args.startState;
  const vi = lang === "vi";

  const move = decodeMove(codes[ply - 1]);
  const mover = before.turn;
  const foe = opposite(mover);
  const stateBefore = positionAt(codes, ply - 1, startState);
  const stateAfter = positionAt(codes, ply, startState);
  const record = applyMove(stateBefore, move).record;

  const c = classifyMove(before, after, move);
  const cls: MoveClass = c.cls;

  // Eval swing from the mover's perspective (centipawns, negative = loss).
  const swing = -after.score - before.score;
  const lossCp = Math.max(0, -swing);
  const isMateScore = (s: number) => Math.abs(s) >= MATE_CP - 1000;

  const captured = record.captured;
  const givesCheck = isInCheck(stateAfter.board, foe);
  const end = gameStatus(stateAfter);
  const isMate = end.over && end.reason === "checkmate";
  const isStalemateWin = end.over && end.reason === "stalemate";
  const isDraw120 = end.over && end.reason === "draw-120";

  const bestText = c.bestMove ? moveText(stateBefore, c.bestMove, lang) : null;
  const moveNo = Math.floor((ply - 1) / 2) + 1;
  const moveLabel = `${moveNo}.${mover === (startState?.turn ?? "red") ? "" : ".."} ${moveText(
    stateBefore,
    move,
    lang
  )}`;

  let headline: string;
  const details: string[] = [];

  if (isMate) {
    headline = vi
      ? `🏆 Chiếu hết! ${sideName(mover, lang)} thắng.`
      : `🏆 Checkmate! ${sideName(mover, lang)} wins.`;
  } else if (isStalemateWin) {
    headline = vi
      ? `🏆 ${sideName(foe, lang)} hết nước đi — ${sideName(mover, lang)} thắng.`
      : `🏆 ${sideName(foe, lang)} has no moves — ${sideName(mover, lang)} wins.`;
  } else {
    switch (cls) {
      case "best":
        headline = vi ? "⭐ Nước tốt nhất!" : "⭐ Best move!";
        break;
      case "good":
        headline = vi ? "✓ Nước đi tốt." : "✓ Good move.";
        break;
      case "inaccuracy":
        headline = vi ? "?! Nước chưa thật chính xác." : "?! Inaccuracy.";
        break;
      case "mistake":
        headline = vi ? "? Sai lầm." : "? Mistake.";
        break;
      case "blunder":
        headline = vi ? "?? Sai lầm nghiêm trọng!" : "?? Blunder!";
        break;
    }
  }

  // Suggested better move (only for real errors, or game over).
  if (
    !isMate &&
    !isStalemateWin &&
    (cls === "inaccuracy" || cls === "mistake" || cls === "blunder") &&
    bestText
  ) {
    details.push(
      vi ? `💡 Nên đi: ${bestText}` : `💡 Better was: ${bestText}`
    );
  }

  // Eval loss (skip mate scores — the number is meaningless there).
  if (
    !isMate &&
    !isStalemateWin &&
    lossCp >= 25 &&
    !isMateScore(before.score) &&
    !isMateScore(after.score)
  ) {
    details.push(
      vi
        ? `📉 Đánh mất ~${(lossCp / 100).toFixed(1)} điểm.`
        : `📉 Loses ~${(lossCp / 100).toFixed(1)} pawns.`
    );
  }
  if (!isMate && !isStalemateWin && lossCp < 25 && (cls === "best" || cls === "good")) {
    details.push(
      vi
        ? `Thế cờ: ${formatEval(c.evalAfterRed)}`
        : `Evaluation: ${formatEval(c.evalAfterRed)}`
    );
  }

  if (record.flipped && record.revealedType) {
    details.push(
      vi
        ? `🃏 Lật quân: ra ${localizedPieceName(record.revealedType, lang)}!`
        : `🃏 Flip reveal: it's a ${localizedPieceName(record.revealedType, lang)}!`
    );
  }
  if (captured) {
    details.push(
      vi
        ? `⚔️ Ăn ${pieceName(captured.trueType, lang)} ${sideName(foe, lang)}${captured.wasCovered ? " (quân úp — lật ra khi bị ăn)" : ""}.`
        : `⚔️ Captures the ${sideName(foe, lang)} ${pieceName(captured.trueType, lang)}${captured.wasCovered ? " (was face-down — revealed on capture)" : ""}.`
    );
  }
  if (isDraw120) {
    details.push(
      vi
        ? "🤝 Hòa: 120 nước không ăn quân, không lật quân."
        : "🤝 Draw: 120 plies with no capture or flip."
    );
  }
  if (givesCheck && !isMate) {
    details.push(vi ? "‼️ Chiếu tướng!" : "‼️ Check!");
  }

  // Opening recognition: name the opening the moment its pattern completes.
  if (ply <= 10) {
    const opening = detectOpening(codes.slice(0, ply));
    if (opening && opening.moves.length === ply) {
      const name = vi ? opening.name.vi : opening.name.en;
      details.push(vi ? `📖 Khai cuộc: ${name}` : `📖 Opening: ${name}`);
    }
  }

  return { cls, headline: `${moveLabel} — ${headline}`, details };
}

/** Convenience: analyze + comment in one go (used by tests). */
export function commentOnMoveFresh(
  lang: Lang,
  codes: string[],
  ply: number,
  startState?: JieqiState
): MoveComment | null {
  if (ply < 1 || ply > codes.length) return null;
  const before = analyzePly(codes, ply - 1, startState);
  const after = analyzePly(codes, ply, startState);
  return commentOnMove({ lang, ply, codes, before, after, startState });
}
