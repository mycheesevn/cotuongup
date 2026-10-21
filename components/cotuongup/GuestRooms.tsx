"use client";

import { useEffect, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { getSupabase } from "@/lib/supabase/client";
import {
  listPublicRooms,
  type PublicRoom,
} from "@/lib/supabase/rooms";
import { RoomMatchView } from "./RoomMatchView";
import type {
  Room,
  RoomComment,
  RoomMatch,
  RoomMember,
} from "@/lib/supabase/rooms";

interface Props {
  lang: Lang;
  onRequireLogin: () => void;
}

interface GuestDetail {
  room: Room;
  memberCount: number;
  members: RoomMember[];
  activeMatch: RoomMatch | null;
  comments: RoomComment[];
}

async function fetchGuestDetail(roomId: string): Promise<GuestDetail> {
  const sb = getSupabase();
  if (!sb) throw new Error("not_configured");
  const { data, error } = await sb.rpc("cu_guest_room_detail", {
    p_room_id: roomId,
  });
  if (error || !data) throw new Error("room_not_found");
  const d = data as {
    room: {
      id: string;
      code: string;
      name: string;
      rules: string | null;
      member_count: number;
      max_players: number;
    };
    members: { user_id: string; name: string }[];
    active_match: Record<string, unknown> | null;
    comments: {
      id: string;
      body: string;
      created_at: string;
      author: string;
    }[];
  };
  return {
    room: {
      id: d.room.id,
      code: d.room.code,
      name: d.room.name,
      rules: d.room.rules ?? "",
      leader_id: "",
      max_players: d.room.max_players,
      is_public: true,
      status: "lobby",
      turn_order: [],
      created_at: "",
    } as Room,
    memberCount: d.room.member_count,
    members: d.members.map((m) => ({
      user_id: m.user_id,
      role: "spectator" as const,
      joined_at: "",
      profile: { username: m.name, full_name: null, avatar_url: null },
    })),
    activeMatch: d.active_match as unknown as RoomMatch | null,
    comments: d.comments.map((c) => ({
      id: c.id,
      match_id: null,
      move_number: 0,
      user_id: "",
      body: c.body,
      created_at: c.created_at,
      profile: { username: c.author, full_name: null, avatar_url: null },
    })),
  };
}

/**
 * Public rooms for logged-out guests: read-only lobby + spectate.
 * Every write action is replaced with a login teaser.
 */
export function GuestRooms({ lang, onRequireLogin }: Props) {
  const s = STR[lang];
  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listPublicRooms().then((r) => {
      if (!cancelled) setRooms(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetchGuestDetail(openId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [openId]);

  if (openId) {
    if (loading || !detail) {
      return <p className="cu-empty-note">{s.loading}</p>;
    }
    return (
      <div className="cu-room-home">
            <button
              type="button"
              className="cu-btn small"
              onClick={() => setOpenId(null)}
            >
              ← {s.back}
            </button>
            <div className="cu-guest-banner">
              👀 {s.guestSpectateBanner}
              <button
                type="button"
                className="cu-btn small primary"
                onClick={onRequireLogin}
              >
                🔑 {s.guestJoinTeaser}
              </button>
            </div>
            <h3>
              🌐 {detail.room.name}
              <span className="cu-empty-note">
                {" "}
                · {detail.memberCount}/{detail.room.max_players}
              </span>
            </h3>
            {detail.room.rules ? (
              <p className="cu-room-rules-text">📜 {detail.room.rules}</p>
            ) : null}
            {detail.activeMatch ? (
              <RoomMatchView
                lang={lang}
                userId=""
                room={detail.room}
                members={detail.members}
                match={detail.activeMatch}
                comments={detail.comments}
                liveReaction={null}
                onMatchPatched={() => {}}
                onComment={() => {}}
                messages={[]}
                onMessage={() => {}}
                guest
                onRequireLogin={onRequireLogin}
              />
            ) : (
              <p className="cu-empty-note">{s.guestNoMatch}</p>
            )}
      </div>
    );
  }

  return (
      <div className="cu-room-home">
          <div className="cu-guest-banner">
            👀 {s.guestSpectateBanner}
            <button
              type="button"
              className="cu-btn small primary"
              onClick={onRequireLogin}
            >
              🔑 {s.guestJoinTeaser}
            </button>
          </div>
          <h3>🌐 {s.publicLobby}</h3>
          {rooms === null ? (
            <p className="cu-empty-note">{s.loading}</p>
          ) : rooms.length === 0 ? (
            <p className="cu-empty-note">{s.guestNoRooms}</p>
          ) : (
            <div className="cu-room-list">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="cu-room-card"
                  onClick={() => setOpenId(r.id)}
                >
                  <div className="cu-room-card-name">{r.name}</div>
                  <div className="cu-empty-note">
                    👥 {r.member_count}/{r.max_players}
                    {r.has_active_match ? ` · 🔴 ${s.guestLive}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
      </div>
  );
}
