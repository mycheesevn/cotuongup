"use client";

import { getSupabase } from "./client";

export type GameEventType = "start" | "finish" | "abandon";

export interface GameEventMeta {
  result?: "win" | "loss" | "draw" | null;
  level?: number | null;
  playerColor?: string | null;
  timeControl?: number | null;
}

/**
 * Record a game event (start/finish/abandon) for members and guests alike.
 * Goes through the record_cu_game_event() RPC (SECURITY DEFINER): the server
 * stamps auth.uid() itself, so the user_id can't be spoofed. Fire-and-forget:
 * never blocks the UI, failures are silent.
 */
export function recordGameEvent(
  type: GameEventType,
  meta: GameEventMeta = {}
): void {
  try {
    const sb = getSupabase();
    if (!sb) return;
    sb.rpc("record_cu_game_event", {
      p_event: type,
      p_result: meta.result ?? null,
      p_level: meta.level ?? null,
      p_player_color: meta.playerColor ?? null,
      p_time_control: meta.timeControl ?? null,
    }).then(
      () => undefined,
      () => undefined
    );
  } catch {
    /* never break the game for stats */
  }
}

export interface StatBucket {
  d: string; // ISO date (day / week-start / month-start / year-start)
  c: number;
}

export interface GameStats {
  plays_total: number;
  plays_member: number;
  plays_guest: number;
  finished: number;
  abandoned: number;
  members_total: number;
  members_today: number;
  members_week: number;
  members_month: number;
  plays_daily: StatBucket[];
  plays_weekly: StatBucket[];
  plays_monthly: StatBucket[];
  plays_yearly: StatBucket[];
  members_daily: StatBucket[];
  members_weekly: StatBucket[];
  members_monthly: StatBucket[];
  members_yearly: StatBucket[];
}

/** Aggregated site statistics via the cu_game_stats() RPC. */
export async function fetchGameStats(): Promise<GameStats | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("cu_game_stats");
  if (error || !data) return null;
  return data as GameStats;
}
