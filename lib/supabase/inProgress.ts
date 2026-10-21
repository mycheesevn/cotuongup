"use client";

import { parseFen, type Color, type JieqiState } from "@/lib/jieqi/core";

/**
 * Unfinished vs-computer game snapshot — Agent E (shell & growth).
 *
 * NEW SHAPE (Jieqi port): the snapshot is FEN-based, not board-based.
 * `fen` is the FULL FEN (core toFen, hidden field included) of the
 * position to resume; `startFen` the FULL FEN of the state the game
 * started from. Decode with `resumeState` / the core `parseFen`.
 *
 * Storage is device-local (localStorage): Agent D's cu_ migrations have
 * no in-progress table (checkers/caro dropped the feature entirely), and
 * a local vs-AI game's true state never needs to leave the player's own
 * device. Signatures stay async for drop-in compatibility with the old
 * server-backed module. If cross-device resume is ever wanted, Agent D
 * adds a cu_in_progress table and only this file changes.
 */

const LS_KEY = "cotuongup-in-progress-v2";

/** Serializable snapshot of an unfinished vs-computer game. */
export interface PersistedPlay {
  version: 2;
  savedAt: string;
  playerColor: Color;
  level: number;
  timeControl: number | null;
  clocks: { red: number; black: number } | null;
  /** FULL FEN (incl. hidden field) of the position to resume. */
  fen: string;
  /** FULL FEN of the state the game started from. */
  startFen: string;
  moveCodes: string[];
  log: string[];
  inCheck: boolean;
  gameOver: {
    winner: Color;
    reason: "checkmate" | "stalemate" | "timeout";
  } | null;
}

export function isValidSavedPlay(v: unknown): v is PersistedPlay {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  if (p.version !== 2) return false;
  if (typeof p.fen !== "string" || p.fen.length === 0) return false;
  if (typeof p.startFen !== "string" || p.startFen.length === 0) return false;
  if (!Array.isArray(p.moveCodes) || p.moveCodes.length === 0) return false;
  if (p.playerColor !== "red" && p.playerColor !== "black") return false;
  if (typeof p.level !== "number" || p.level < 1 || p.level > 12) return false;
  return true;
}

/** The JieqiState to resume play from, or null if the FEN won't parse. */
export function resumeState(play: PersistedPlay): JieqiState | null {
  try {
    return parseFen(play.fen);
  } catch {
    return null;
  }
}

/** The JieqiState the game started from, or null if the FEN won't parse. */
export function startState(play: PersistedPlay): JieqiState | null {
  try {
    return parseFen(play.startFen);
  } catch {
    return null;
  }
}

/** Save the current unfinished game (device-local). Fire-and-forget safe. */
export async function saveInProgress(play: PersistedPlay): Promise<void> {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(play));
  } catch {
    /* never break the game for persistence */
  }
}

/** Load the saved unfinished game, if any. */
export async function loadInProgress(): Promise<PersistedPlay | null> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const play: unknown = JSON.parse(raw);
    return isValidSavedPlay(play) ? play : null;
  } catch {
    return null;
  }
}

/** Discard the saved unfinished game (finished or explicitly restarted). */
export async function clearInProgress(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
