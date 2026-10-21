// Cờ Úp friends (one-way follows on the SHARED `friendships` table),
// 1:1 challenges (per-game `cu_challenges`), and online presence.

import { getSupabase } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createRoom, joinRoom, closeRoom } from "./rooms";

async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

export interface FriendProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  rating: number;
  followed_at: string;
}

export function displayNameOf(p: {
  full_name?: string | null;
  username?: string | null;
}): string {
  return p.full_name?.trim() || p.username?.trim() || "?";
}

/** Follow another user. Idempotent (unique constraint). */
export async function followUser(friendId: string): Promise<void> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  if (uid === friendId) return;
  const { error } = await sb
    .from("friendships")
    .upsert({ user_id: uid, friend_id: friendId }, { onConflict: "user_id,friend_id" });
  if (error) throw error;
}

export async function unfollowUser(friendId: string): Promise<void> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  const { error } = await sb
    .from("friendships")
    .delete()
    .eq("user_id", uid)
    .eq("friend_id", friendId);
  if (error) throw error;
}

/** IDs the current user follows (for ✓/＋ button states). */
export async function fetchFollowingIds(): Promise<Set<string>> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return new Set();
  const { data } = await sb
    .from("friendships")
    .select("friend_id")
    .eq("user_id", uid);
  return new Set((data ?? []).map((r) => r.friend_id as string));
}

export async function fetchFriends(): Promise<FriendProfile[]> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return [];
  const { data } = await sb
    .from("friendships")
    .select(
      "friend_id, created_at, profiles!friendships_friend_id_fkey(id, username, full_name, avatar_url, rating)"
    )
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => {
    const p = (r as Record<string, unknown>).profiles as Record<string, unknown> | null;
    return {
      id: (r as Record<string, unknown>).friend_id as string,
      username: (p?.username as string) ?? null,
      full_name: (p?.full_name as string) ?? null,
      avatar_url: (p?.avatar_url as string) ?? null,
      rating: (p?.rating as number) ?? 800,
      followed_at: (r as Record<string, unknown>).created_at as string,
    };
  });
}

/** Active room matches involving the given users (that I can see via RLS).
 *  Maps user_id -> { room_id, code } for the "watch" button. */
export async function fetchFriendMatchStatus(
  friendIds: string[]
): Promise<Record<string, { room_id: string; code: string }>> {
  const sb = getSupabase();
  if (!sb || friendIds.length === 0) return {};
  const { data } = await sb
    .from("cu_matches")
    .select("room_id, red_id, black_id, cu_rooms!inner(code)")
    .eq("status", "active")
    .or(`red_id.in.(${friendIds.join(",")}),black_id.in.(${friendIds.join(",")})`);
  const out: Record<string, { room_id: string; code: string }> = {};
  for (const m of data ?? []) {
    const row = m as Record<string, unknown>;
    const rooms = row.cu_rooms as Record<string, unknown> | null;
    const info = {
      room_id: row.room_id as string,
      code: (rooms?.code as string) ?? "",
    };
    const rid = row.red_id as string;
    const bid = row.black_id as string;
    if (friendIds.includes(rid)) out[rid] = info;
    if (friendIds.includes(bid)) out[bid] = info;
  }
  return out;
}

/* ------------------------------ challenges ------------------------------ */

export interface ChallengeNotice {
  id: string;
  challenger_id: string;
  challenger_name: string;
  room_code: string;
}

/** Challenge a friend: creates a 2-player room + challenge row. */
export async function sendChallenge(
  friendId: string,
  friendName: string
): Promise<{ room_code: string }> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) throw new Error("not_authenticated");
  const { data: me } = await sb
    .from("profiles")
    .select("full_name, username")
    .eq("id", uid)
    .single();
  const myName = displayNameOf({
    full_name: (me as Record<string, unknown> | null)?.full_name as string | null,
    username: (me as Record<string, unknown> | null)?.username as string | null,
  });
  const room = await createRoom(`${myName} vs ${friendName}`, 2);
  // Store room_code on the challenge row itself: the challenged player is
  // NOT a room member yet, and rooms RLS only lets members read the room —
  // so resolving the code via a rooms join/query returns nothing for them.
  const baseInsert = {
    room_id: room.id,
    challenger_id: uid,
    challenged_id: friendId,
    status: "pending",
  };
  let chRow: { id: string } | null = null;
  {
    const withCode = await sb
      .from("cu_challenges")
      .insert({ ...baseInsert, room_code: room.code })
      .select("id")
      .single();
    if (withCode.error) {
      // room_code column not migrated yet — fall back to the plain insert.
      const plain = await sb
        .from("cu_challenges")
        .insert(baseInsert)
        .select("id")
        .single();
      if (plain.error) throw plain.error;
      chRow = plain.data as { id: string };
    } else {
      chRow = withCode.data as { id: string };
    }
  }
  // Best-effort push to the challenged player (server verifies the challenge).
  if (chRow?.id) {
    const { notifyPushTrigger } = await import("@/lib/push/client");
    notifyPushTrigger({ kind: "challenge", challengeId: chRow.id });
  }
  return { room_code: room.code };
}

/** Pending challenges where I'm the challenged (last 24h). */
export async function fetchPendingChallenges(): Promise<ChallengeNotice[]> {
  const sb = getSupabase();
  const uid = await currentUserId();
  if (!sb || !uid) return [];
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // Prefer the room_code stored on the challenge row (see sendChallenge).
  // The rooms join must NOT be !inner: rooms RLS hides the room from the
  // not-yet-member challenged player, which would hide the challenge too.
  const selectWithCode =
    "id, challenger_id, room_id, room_code, created_at, cu_rooms(code), profiles!cu_challenges_challenger_id_fkey(full_name, username)";
  const selectPlain =
    "id, challenger_id, room_id, created_at, cu_rooms(code), profiles!cu_challenges_challenger_id_fkey(full_name, username)";
  let data: unknown[] | null = null;
  {
    const res = await sb
      .from("cu_challenges")
      .select(selectWithCode)
      .eq("challenged_id", uid)
      .eq("status", "pending")
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    if (res.error) {
      const retry = await sb
        .from("cu_challenges")
        .select(selectPlain)
        .eq("challenged_id", uid)
        .eq("status", "pending")
        .gt("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);
      data = (retry.data as unknown[] | null) ?? null;
    } else {
      data = (res.data as unknown[] | null) ?? null;
    }
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const prof = row.profiles as Record<string, unknown> | null;
    const room = row.cu_rooms as Record<string, unknown> | null;
    return {
      id: row.id as string,
      challenger_id: row.challenger_id as string,
      challenger_name: displayNameOf({
        full_name: prof?.full_name as string | null,
        username: prof?.username as string | null,
      }),
      room_code:
        ((row.room_code as string | null) ?? (room?.code as string)) || "",
    };
  });
}

export async function respondChallenge(
  id: string,
  accept: boolean
): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { error } = await sb
    .from("cu_challenges")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", id);
  if (error) throw error;
}

/** Accept a challenge: join the room (idempotent) and return its code. */
export async function acceptChallenge(
  notice: ChallengeNotice
): Promise<string> {
  await respondChallenge(notice.id, true);
  if (notice.room_code) {
    try {
      await joinRoom(notice.room_code);
    } catch {
      /* already a member or room closed */
    }
  }
  return notice.room_code;
}

/** Decline a challenge and close the now-empty room. */
export async function declineChallenge(
  notice: ChallengeNotice
): Promise<void> {
  await respondChallenge(notice.id, false);
}

/**
 * Realtime challenge events for the current user:
 * - INSERT where I'm challenged -> incoming challenge toast.
 * - UPDATE where I'm the challenger and it was declined -> notify.
 */
export function subscribeChallenges(
  uid: string,
  onIncoming: (c: ChallengeNotice) => void,
  onDeclined: (challengedName: string) => void
): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const ch: RealtimeChannel = sb.channel(`challenges:${uid}`);
  ch.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "cu_challenges",
      filter: `challenged_id=eq.${uid}`,
    },
    async (payload) => {
      const row = payload.new as Record<string, unknown>;
      if (row.status !== "pending") return;
      // The room code is stored on the challenge row (rooms RLS hides the
      // room from the challenged player until they accept and join).
      const storedCode = String(row.room_code ?? "");
      const [{ data: prof }, { data: room }] = await Promise.all([
        sb
          .from("profiles")
          .select("full_name, username")
          .eq("id", row.challenger_id as string)
          .single(),
        storedCode
          ? Promise.resolve({ data: null })
          : sb
              .from("cu_rooms")
              .select("code")
              .eq("id", row.room_id as string)
              .single(),
      ]);
      const p = prof as Record<string, unknown> | null;
      const r = room as Record<string, unknown> | null;
      onIncoming({
        id: String(row.id ?? ""),
        challenger_id: String(row.challenger_id ?? ""),
        challenger_name: displayNameOf({
          full_name: p?.full_name as string | null,
          username: p?.username as string | null,
        }),
        room_code: storedCode || String(r?.code ?? ""),
      });
    }
  );
  ch.on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "cu_challenges",
      filter: `challenger_id=eq.${uid}`,
    },
    async (payload) => {
      const row = payload.new as Record<string, unknown>;
      if (row.status !== "declined") return;
      const { data: prof } = await sb
        .from("profiles")
        .select("full_name, username")
        .eq("id", row.challenged_id as string)
        .single();
      const p = prof as Record<string, unknown> | null;
      onDeclined(
        displayNameOf({
          full_name: p?.full_name as string | null,
          username: p?.username as string | null,
        })
      );
      // Clean up the empty challenge room.
      try {
        await closeRoom(row.room_id as string);
      } catch {
        /* ignore */
      }
    }
  );
  ch.subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}

/* ------------------------------ presence ------------------------------ */

let presenceChannel: RealtimeChannel | null = null;
let onlineIds = new Set<string>();
const onlineListeners = new Set<(ids: Set<string>) => void>();

function emitOnline() {
  const snap = new Set(onlineIds);
  onlineListeners.forEach((cb) => cb(snap));
}

/** Track the current user as online. Returns a stop function. */
export function startPresence(userId: string): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  stopPresence();
  const ch = sb.channel("online");
  presenceChannel = ch;
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState();
    const ids = new Set<string>();
    for (const presences of Object.values(state)) {
      for (const p of presences as Array<Record<string, unknown>>) {
        if (typeof p.user_id === "string") ids.add(p.user_id);
      }
    }
    onlineIds = ids;
    emitOnline();
  });
  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await ch.track({ user_id: userId, at: Date.now() });
    }
  });
  return stopPresence;
}

export function stopPresence(): void {
  if (presenceChannel) {
    try {
      getSupabase()?.removeChannel(presenceChannel);
    } catch {
      /* ignore */
    }
    presenceChannel = null;
  }
  onlineIds = new Set();
}

/** Subscribe to online-user updates (immediate initial call). */
export function subscribeOnline(
  cb: (ids: Set<string>) => void
): () => void {
  onlineListeners.add(cb);
  cb(new Set(onlineIds));
  return () => {
    onlineListeners.delete(cb);
  };
}
