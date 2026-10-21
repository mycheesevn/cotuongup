import { getSupabase } from "./client";

export type QuestId = "first_game" | "first_puzzle" | "first_room";

export interface QuestState {
  done: boolean;
  claimed: boolean;
}

export type QuestStatus = Record<QuestId, QuestState>;

export const QUEST_IDS: QuestId[] = ["first_game", "first_puzzle", "first_room"];

const EMPTY: QuestStatus = {
  first_game: { done: false, claimed: false },
  first_puzzle: { done: false, claimed: false },
  first_room: { done: false, claimed: false },
};

/**
 * Completion + claim status of the onboarding quests, via the
 * `cu_quest_status()` RPC (migration 012): a jsonb object keyed by the
 * client quest ids, computed from cu_games / cu_puzzle_solves /
 * cu_room_members (done) and cu_quests (claimed).
 */
export async function fetchQuestStatus(): Promise<QuestStatus> {
  const sb = getSupabase();
  if (!sb) return EMPTY;
  const { data, error } = await sb.rpc("cu_quest_status");
  if (error || !data) return EMPTY;
  const d = data as Record<string, Partial<QuestState>>;
  return {
    first_game: {
      done: !!d.first_game?.done,
      claimed: !!d.first_game?.claimed,
    },
    first_puzzle: {
      done: !!d.first_puzzle?.done,
      claimed: !!d.first_puzzle?.claimed,
    },
    first_room: {
      done: !!d.first_room?.done,
      claimed: !!d.first_room?.claimed,
    },
  };
}

/**
 * Claim a quest's +20 XP via `cu_claim_quest(p_quest_id)` (the RPC
 * accepts the client ids `first_game` / `first_puzzle` / `first_room`
 * as well as the legacy `play_1` / `win_1` / `join_room` spellings and
 * returns boolean). Returns the XP awarded (20, or 0 if not claimable).
 */
export async function claimQuest(quest: QuestId): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data, error } = await sb.rpc("cu_claim_quest", {
    p_quest_id: quest,
  });
  if (error) throw error;
  return data === true ? 20 : 0;
}

export interface RoomPreview {
  name: string;
  member_count: number;
  is_public: boolean;
  status: string;
  rules: string;
}

/**
 * Public room info for an invite link — works for guests too.
 * Backed by `cu_preview_room(p_code)` (ROOMS_SPEC §4), which returns a
 * jsonb `{name, member_count, rules, is_public, status}` for a
 * non-closed room, or null.
 */
export async function previewRoom(code: string): Promise<RoomPreview | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("cu_preview_room", { p_code: code });
  if (error || !data) return null;
  // Defensive: tolerate the pre-012 table-shaped return as well.
  const row = (Array.isArray(data) ? data[0] : data) as
    | Partial<RoomPreview>
    | undefined;
  if (!row || typeof row.name !== "string") return null;
  return {
    name: row.name,
    member_count: Number(row.member_count ?? 0),
    is_public: !!row.is_public,
    status: typeof row.status === "string" ? row.status : "",
    rules: typeof row.rules === "string" ? row.rules : "",
  };
}
