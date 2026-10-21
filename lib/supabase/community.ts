import { getSupabase } from "./client";

export type CommunitySort = "new" | "popular" | "weekly" | "mine";

export interface CommunityPuzzleCard {
  id: string;
  creator_id: string;
  creator_name: string;
  title: string;
  fen: string;
  moves_to_mate: number;
  solves: number;
  likes: number;
  created_at: string;
  liked_by_me: boolean;
  solved_by_me: boolean;
  is_featured: boolean;
}

/** Puzzles the community promoted into the sample library. */
export async function fetchFeaturedPuzzles(
  limit = 20
): Promise<CommunityPuzzleCard[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("cu_community_puzzle_cards", {
    p_sort: "featured",
    p_limit: limit,
    p_offset: 0,
    p_mine: false,
  });
  if (error || !data) return [];
  return data as CommunityPuzzleCard[];
}

/** Rename your own puzzle (owner-only via RLS). */
export async function renameCommunityPuzzle(
  puzzleId: string,
  title: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  const { error } = await sb
    .from("cu_puzzles")
    .update({ title: title.slice(0, 60) })
    .eq("id", puzzleId)
    .eq("creator_id", user.id);
  return !error;
}

export async function fetchCommunityPuzzles(
  sort: CommunitySort,
  limit: number,
  offset: number
): Promise<CommunityPuzzleCard[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("cu_community_puzzle_cards", {
    p_sort: sort === "mine" ? "new" : sort,
    p_limit: limit,
    p_offset: offset,
    p_mine: sort === "mine",
  });
  if (error || !data) return [];
  return data as CommunityPuzzleCard[];
}

export async function fetchCommunityPuzzle(
  id: string
): Promise<CommunityPuzzleCard | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("cu_community_puzzle_card", { p_id: id });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    | CommunityPuzzleCard
    | undefined;
  return row ?? null;
}

export interface PublishInput {
  title: string;
  fen: string;
  movesToMate: number;
  solution: string; // comma-separated move codes (demonstrated line)
}

/** Publish a verified puzzle. Returns the new id or null. */
export async function publishCommunityPuzzle(
  input: PublishInput
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from("cu_puzzles")
    .insert({
      creator_id: user.id,
      title: input.title.slice(0, 60),
      fen: input.fen,
      moves_to_mate: input.movesToMate,
      solution: input.solution,
    })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

/** Record a solve. Returns the solver's XP earned (0 if already solved). */
export async function solveCommunityPuzzle(puzzleId: string): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { data, error } = await sb.rpc("cu_solve_community_puzzle", {
    p_id: puzzleId,
  });
  if (error) return 0;
  return typeof data === "number" ? data : 0;
}

export async function toggleCommunityLike(
  puzzleId: string
): Promise<{ liked: boolean; likes: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("cu_toggle_community_like", {
    p_id: puzzleId,
  });
  if (error || !data) return null;
  const d = data as { liked: boolean; likes: number };
  return { liked: !!d.liked, likes: Number(d.likes) || 0 };
}

export async function deleteCommunityPuzzle(puzzleId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  const { error } = await sb
    .from("cu_puzzles")
    .delete()
    .eq("id", puzzleId)
    .eq("creator_id", user.id);
  return !error;
}
