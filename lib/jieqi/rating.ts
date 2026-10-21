// Player rating (Elo), XP, levels and titles.
// Pure logic — used by the client rewards sync and easy to unit test.

import type { Lang } from "./i18n";

export const START_RATING = 800;

/** Pseudo-rating of each AI level, used as the Elo opponent. */
export const AI_RATINGS: Record<number, number> = {
  1: 300,
  2: 500,
  3: 700,
  4: 900,
  5: 1100,
  6: 1300,
  7: 1500,
  8: 1700,
  9: 1900,
  10: 2100,
  11: 2250,
  12: 2400,
};

export function aiRating(level: number): number {
  return AI_RATINGS[level] ?? 1100;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Higher K for new players so the rating calibrates quickly. */
export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < 20 ? 40 : 24;
}

export type GameResult = "win" | "loss" | "draw";

const RESULT_SCORE: Record<GameResult, number> = {
  win: 1,
  loss: 0,
  draw: 0.5,
};

export interface RatingUpdate {
  rating: number;
  delta: number;
}

/** Elo update after a vs-computer game. */
export function applyGameRating(
  rating: number,
  gamesPlayed: number,
  aiLevel: number,
  result: GameResult
): RatingUpdate {
  const opp = aiRating(aiLevel);
  const expected = expectedScore(rating, opp);
  const k = kFactor(gamesPlayed);
  const delta = Math.round(k * (RESULT_SCORE[result] - expected));
  return { rating: Math.max(100, rating + delta), delta };
}

// ---------------------------------------------------------------- XP ------

export function xpForGame(result: GameResult, aiLevel: number): number {
  const base = 10;
  if (result === "win") return base + 10 + 2 * aiLevel;
  if (result === "draw") return base + 5;
  return base + 3; // loss: small consolation for the effort
}

export function xpForPuzzle(solved: boolean): number {
  return solved ? 15 : 2;
}

/** Bonus XP for the first activity of a new day. */
export const DAILY_BONUS_XP = 10;

/** Bonus per consecutive active day (capped). */
export function streakBonusXp(streakDays: number): number {
  return 5 * Math.min(streakDays, 10);
}

// ------------------------------------------------------------ Levels ------

/** Cumulative XP required to reach level n (n >= 1). Level 1 = 0. */
export function xpForLevel(n: number): number {
  if (n <= 1) return 0;
  return 100 * ((n - 1) * n) / 2;
}

/** Level for a given total XP. */
export function levelForXp(xp: number): number {
  let n = 1;
  while (xpForLevel(n + 1) <= xp) n++;
  return n;
}

/** Progress within the current level, 0..1. */
export function levelProgress(xp: number): number {
  const lvl = levelForXp(xp);
  const lo = xpForLevel(lvl);
  const hi = xpForLevel(lvl + 1);
  if (hi <= lo) return 1;
  return Math.min(1, Math.max(0, (xp - lo) / (hi - lo)));
}

// ------------------------------------------------------------ Titles ------

export interface RatingBand {
  min: number;
  vi: string;
  en: string;
}

export const RATING_BANDS: RatingBand[] = [
  { min: 1800, vi: "Đại Kiện Tướng", en: "Grandmaster" },
  { min: 1500, vi: "Kiện Tướng", en: "Master" },
  { min: 1200, vi: "Cao Cấp", en: "Advanced" },
  { min: 900, vi: "Trung Cấp", en: "Intermediate" },
  { min: 600, vi: "Sơ Cấp", en: "Beginner" },
  { min: 0, vi: "Tân Thủ", en: "Novice" },
];

/** Title for a rating, e.g. "Kiện Tướng". */
export function ratingTitle(rating: number, lang: Lang): string {
  const band = RATING_BANDS.find((b) => rating >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1];
  return lang === "vi" ? band.vi : band.en;
}

/** Display name for the leaderboard: username, or email prefix, or fallback. */
export function displayName(
  username: string | null,
  email: string | null,
  lang: Lang
): string {
  if (username && username.trim()) return username.trim();
  if (email) {
    const prefix = email.split("@")[0];
    if (prefix) return prefix;
  }
  return lang === "vi" ? "Người chơi ẩn danh" : "Anonymous player";
}


