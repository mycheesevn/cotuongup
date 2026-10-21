import { getSupabase } from "./client";

export interface PuzzleProgress {
  streak: number;
  lastSolvedDate: string | null;
}

/** Load puzzle streak from the cloud (null when logged out/unconfigured). */
export async function fetchPuzzleProgress(): Promise<PuzzleProgress | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("puzzle_progress")
    .select("streak,last_solved_date")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    streak: data.streak ?? 0,
    lastSolvedDate: data.last_solved_date ?? null,
  };
}

/** Save puzzle streak to the cloud. Returns error message or null. */
export async function savePuzzleProgress(
  streak: number,
  lastSolvedDate: string | null
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase not configured";
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return "Not logged in";
  const { error } = await sb.from("puzzle_progress").upsert(
    {
      user_id: user.id,
      streak,
      last_solved_date: lastSolvedDate,
    },
    { onConflict: "user_id" }
  );
  return error ? error.message : null;
}
