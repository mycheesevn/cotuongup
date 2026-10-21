import { getSupabase } from "./client";

export interface PuzzleResultInput {
  /** YYYY-MM-DD of the daily puzzle. */
  puzzleDate: string;
  /** Puzzle number shown in the UI. */
  puzzleId: number;
  solved: boolean;
  moveCodes: string[];
}

export interface PuzzleResult {
  id: string;
  puzzle_date: string;
  puzzle_id: number;
  solved: boolean;
  moves: string;
  created_at: string;
}

/** Record one finished daily-puzzle attempt. Returns error message or null. */
export async function savePuzzleResult(
  input: PuzzleResultInput
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase not configured";
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return "Not logged in";

  const { error } = await sb.from("puzzle_results").insert({
    user_id: user.id,
    puzzle_date: input.puzzleDate,
    puzzle_id: input.puzzleId,
    solved: input.solved,
    moves: input.moveCodes.join(","),
  });
  return error ? error.message : null;
}

/** Fetch the user's puzzle attempts, newest first. */
export async function fetchPuzzleResults(limit = 50): Promise<{
  results: PuzzleResult[];
  error: string | null;
}> {
  const sb = getSupabase();
  if (!sb) return { results: [], error: "Supabase not configured" };
  const { data, error } = await sb
    .from("puzzle_results")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { results: [], error: error.message };
  return { results: (data ?? []) as PuzzleResult[], error: null };
}

/** Delete one puzzle attempt record. */
export async function deletePuzzleResult(id: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase not configured";
  const { error } = await sb.from("puzzle_results").delete().eq("id", id);
  return error ? error.message : null;
}
