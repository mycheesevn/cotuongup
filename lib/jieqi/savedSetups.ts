import { getSupabase } from "@/lib/supabase/client";
import type { Color } from "@/lib/jieqi/types";

export interface SavedSetup {
  id: string;
  name: string;
  fen: string;
  turn: Color;
  created_at: string;
}

/** Saved board setups from the setup editor. Signed-in users store
 *  them in cu_setups (self-RLS) so they follow the account; guests
 *  fall back to localStorage on this device. The stored FEN is the
 *  board placement (lib/jieqi/fen); the side to move rides along
 *  in its own field, matching how games store start_fen/start_turn. */
const LS_KEY = "cu-saved-setups";

function lsRead(): SavedSetup[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as SavedSetup[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function lsWrite(list: SavedSetup[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export async function listSavedSetups(userId: string | null): Promise<SavedSetup[]> {
  if (!userId) return lsRead();
  const sb = getSupabase();
  if (!sb) return lsRead();
  const { data, error } = await sb
    .from("cu_setups")
    .select("id, name, fen, turn, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedSetup[];
}

export async function saveSetup(
  userId: string | null,
  name: string,
  fen: string,
  turn: Color
): Promise<SavedSetup> {
  if (!userId) {
    const row: SavedSetup = {
      id: `local-${Date.now()}`,
      name,
      fen,
      turn,
      created_at: new Date().toISOString(),
    };
    lsWrite([row, ...lsRead()]);
    return row;
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("cu_setups")
    .insert({ user_id: userId, name, fen, turn })
    .select("id, name, fen, turn, created_at")
    .single();
  if (error) throw error;
  return data as SavedSetup;
}

export async function deleteSetup(userId: string | null, id: string): Promise<void> {
  if (!userId) {
    lsWrite(lsRead().filter((x) => x.id !== id));
    return;
  }
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from("cu_setups")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
