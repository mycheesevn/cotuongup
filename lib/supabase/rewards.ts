// Player rewards sync: folds unprocessed games + puzzle attempts into
// rating (Elo), XP, diligence streaks and rating history.
// Idempotent: each game/puzzle row is processed once (rewarded flag).
// A module-level lock prevents concurrent double-counting.

import { getSupabase } from "./client";
import {
  applyGameRating,
  xpForGame,
  xpForPuzzle,
  DAILY_BONUS_XP,
  streakBonusXp,
  START_RATING,
  type GameResult,
} from "@/lib/jieqi/rating";

interface ProfileStats {
  id: string;
  rating: number;
  peak_rating: number;
  xp: number;
  games_played: number;
  wins: number;
  last_active_date: string | null;
  active_streak: number;
}

interface RewardEvent {
  kind: "game" | "puzzle";
  id: string;
  created_at: string;
  // game fields
  result?: GameResult;
  level?: number;
  // puzzle fields
  solved?: boolean;
}

function dayStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function shiftDay(ds: string, delta: number): string {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return dayStr(d.toISOString());
}

let syncing: Promise<void> | null = null;

/**
 * Process all unrewarded games + puzzle attempts for the logged-in user.
 * Safe to call after every game/puzzle and on login (backfills history).
 */
export function syncRewards(): Promise<void> {
  if (syncing) return syncing;
  syncing = doSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  // Current stats.
  const { data: profile } = await sb
    .from("profiles")
    .select(
      "id,rating,peak_rating,xp,games_played,wins,last_active_date,active_streak"
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return;
  const st: ProfileStats = {
    id: profile.id,
    rating: profile.rating ?? START_RATING,
    peak_rating: profile.peak_rating ?? START_RATING,
    xp: profile.xp ?? 0,
    games_played: profile.games_played ?? 0,
    wins: profile.wins ?? 0,
    last_active_date: profile.last_active_date ?? null,
    active_streak: profile.active_streak ?? 0,
  };

  // Unprocessed events, oldest first.
  const [{ data: games }, { data: puzzles }] = await Promise.all([
    sb
      .from("games")
      .select("id,result,level,created_at")
      .eq("user_id", user.id)
      .eq("rewarded", false)
      .order("created_at", { ascending: true })
      .limit(500),
    sb
      .from("puzzle_results")
      .select("id,solved,created_at")
      .eq("user_id", user.id)
      .eq("rewarded", false)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);

  const events: RewardEvent[] = [
    ...(games ?? []).map((g) => ({
      kind: "game" as const,
      id: g.id,
      created_at: g.created_at,
      result: g.result as GameResult,
      level: g.level ?? 5,
    })),
    ...(puzzles ?? []).map((p) => ({
      kind: "puzzle" as const,
      id: p.id,
      created_at: p.created_at,
      solved: !!p.solved,
    })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (events.length === 0) return;

  const historyRows: {
    user_id: string;
    rating: number;
    xp: number;
    source: string;
  }[] = [];
  const rewardedGameIds: string[] = [];
  const rewardedPuzzleIds: string[] = [];

  for (const ev of events) {
    // Diligence: first activity of a new day -> daily bonus + streak.
    const day = dayStr(ev.created_at);
    if (st.last_active_date !== day) {
      const continues =
        st.last_active_date !== null &&
        shiftDay(st.last_active_date, 1) === day;
      st.active_streak = continues ? st.active_streak + 1 : 1;
      st.last_active_date = day;
      st.xp += DAILY_BONUS_XP + streakBonusXp(st.active_streak);
    }

    if (ev.kind === "game") {
      const upd = applyGameRating(
        st.rating,
        st.games_played,
        ev.level!,
        ev.result!
      );
      st.rating = upd.rating;
      st.peak_rating = Math.max(st.peak_rating, st.rating);
      st.games_played += 1;
      if (ev.result === "win") st.wins += 1;
      st.xp += xpForGame(ev.result!, ev.level!);
      rewardedGameIds.push(ev.id);
      historyRows.push({
        user_id: user.id,
        rating: st.rating,
        xp: st.xp,
        source: "game",
      });
    } else {
      st.xp += xpForPuzzle(ev.solved!);
      rewardedPuzzleIds.push(ev.id);
      historyRows.push({
        user_id: user.id,
        rating: st.rating,
        xp: st.xp,
        source: "puzzle",
      });
    }
  }

  // Persist everything.
  const { error: upErr } = await sb
    .from("profiles")
    .update({
      rating: st.rating,
      peak_rating: st.peak_rating,
      xp: st.xp,
      games_played: st.games_played,
      wins: st.wins,
      last_active_date: st.last_active_date,
      active_streak: st.active_streak,
    })
    .eq("id", user.id);
  if (upErr) return; // bail: rows stay unrewarded, retried next sync

  await sb.from("rating_history").insert(historyRows);
  if (rewardedGameIds.length > 0) {
    await sb.from("games").update({ rewarded: true }).in("id", rewardedGameIds);
  }
  if (rewardedPuzzleIds.length > 0) {
    await sb
      .from("puzzle_results")
      .update({ rewarded: true })
      .in("id", rewardedPuzzleIds);
  }
}

/** Rating history for the progress chart, oldest first. */
export async function fetchRatingHistory(limit = 200): Promise<{
  points: { rating: number; xp: number; created_at: string }[];
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { points: [], error: "Supabase not configured" };
  const { data, error } = await sb
    .from("rating_history")
    .select("rating,xp,created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return { points: [], error: error.message };
  return { points: (data ?? []) as { rating: number; xp: number; created_at: string }[], error: null };
}

export interface LeaderboardEntry {
  id: string;
  username: string | null;
  full_name: string | null;
  rating: number;
  xp: number;
  games_played: number;
  wins: number;
}

/** Top players by rating. */
export async function fetchLeaderboard(limit = 50): Promise<{
  entries: LeaderboardEntry[];
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { entries: [], error: "Supabase not configured" };
  const { data, error } = await sb
    .from("profiles")
    .select("id,username,full_name,rating,xp,games_played,wins")
    .order("rating", { ascending: false })
    .limit(limit);
  if (error) return { entries: [], error: error.message };
  return { entries: (data ?? []) as LeaderboardEntry[], error: null };
}

/** 1-based rank of the current user by rating (null when logged out). */
export async function fetchMyRank(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: me } = await sb
    .from("profiles")
    .select("rating")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return null;
  const { count } = await sb
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gt("rating", me.rating ?? START_RATING);
  return (count ?? 0) + 1;
}
