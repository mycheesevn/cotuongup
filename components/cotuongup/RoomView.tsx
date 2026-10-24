"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { RoomDetail } from "./RoomDetail";
import {
  createRoom,
  fetchHotRooms,
  fetchMyRooms,
  joinRoom,
  listPublicRooms,
  roomErrorKey,
  setRoomPublic,
  type HotRoom,
  type PublicRoom,
  type RoomSummary,
} from "@/lib/supabase/rooms";
import { previewRoom, type RoomPreview } from "@/lib/supabase/quests";
import { GuestRooms } from "./GuestRooms";

interface Props {
  lang: Lang;
  /** Invite code from ?room=CODE (consumed after a successful join). */
  inviteCode: string | null;
  onInviteConsumed: () => void;
  onRequireLogin: () => void;
}

const ROOM_ERR_KEYS = [
  "roomNotFound",
  "roomFull",
  "roomClosed",
  "roomNeedTwoPlayers",
  "roomMatchInProgress",
  "roomNotLeader",
  "roomGenericError",
] as const;

/** Multiplayer rooms: create, join by code, and play in turn rotation. */
export function RoomView({
  lang,
  inviteCode,
  onInviteConsumed,
  onRequireLogin,
}: Props) {
  const s = STR[lang];
  const { user, configured } = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [hotRooms, setHotRooms] = useState<HotRoom[]>([]);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errKey, setErrKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoomPreview | null | undefined>(
    undefined
  );
  const inviteTried = useRef(false);

  // Room preview for guests opening an invite link.
  useEffect(() => {
    if (!inviteCode || user) {
      setPreview(undefined);
      return;
    }
    previewRoom(inviteCode).then(setPreview).catch(() => setPreview(null));
  }, [inviteCode, user]);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const [mine, pub, hot] = await Promise.all([
        fetchMyRooms(),
        listPublicRooms(),
        fetchHotRooms(),
      ]);
      setRooms(mine);
      setPublicRooms(pub.filter((p) => !mine.some((m) => m.id === p.id)));
      setHotRooms(hot);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Auto-join from an invite link (?room=CODE).
  useEffect(() => {
    if (!inviteCode || !user || inviteTried.current) return;
    inviteTried.current = true;
    (async () => {
      try {
        const room = await joinRoom(inviteCode);
        onInviteConsumed();
        await reload();
        setOpenRoomId(room.id);
        window.dispatchEvent(new CustomEvent("xq:quest-refresh"));
      } catch (e) {
        // If join failed because we're already a member (e.g. we just accepted
        // a challenge, which auto-joins the room), open the room directly
        // instead of showing an error.
        try {
          const mine = await fetchMyRooms();
          const existing = mine.find(
            (r) => r.code.toUpperCase() === inviteCode.toUpperCase()
          );
          if (existing) {
            onInviteConsumed();
            setRooms(mine);
            setOpenRoomId(existing.id);
            window.dispatchEvent(new CustomEvent("xq:quest-refresh"));
            return;
          }
        } catch {
          /* fall through to error */
        }
        setErrKey(roomErrorKey(e));
      }
    })();
  }, [inviteCode, user, reload, onInviteConsumed]);

  const errText = (key: string | null): string | null => {
    if (!key) return null;
    if ((ROOM_ERR_KEYS as readonly string[]).includes(key))
      return s[key as (typeof ROOM_ERR_KEYS)[number]];
    return s.roomJoin + "…";
  };

  const doCreate = async () => {
    if (busy) return;
    setBusy(true);
    setErrKey(null);
    try {
      const room = await createRoom(name.trim(), maxPlayers);
      if (isPublic) await setRoomPublic(room.id, true);
      setName("");
      setIsPublic(false);
      await reload();
      setOpenRoomId(room.id);
    } catch (e) {
      setErrKey(roomErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  const doJoinPublic = async (roomCode: string) => {
    if (busy) return;
    setBusy(true);
    setErrKey(null);
    try {
      const room = await joinRoom(roomCode);
      await reload();
      setOpenRoomId(room.id);
      window.dispatchEvent(new CustomEvent("xq:quest-refresh"));
    } catch (e) {
      setErrKey(roomErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    const c = code.trim().toUpperCase();
    if (!c || busy) return;
    setBusy(true);
    setErrKey(null);
    try {
      const room = await joinRoom(c);
      setCode("");
      await reload();
      setOpenRoomId(room.id);
      window.dispatchEvent(new CustomEvent("xq:quest-refresh"));
    } catch (e) {
      setErrKey(roomErrorKey(e));
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <p className="cu-empty-note">{s.historyNotConfigured}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <div className="cu-room-home">
            {inviteCode ? (
              <div className="cu-room-card cu-invite-card">
                <div className="cu-invite-emoji">💌</div>
                <h3>{s.inviteTitle}</h3>
                {preview === undefined ? (
                  <p className="cu-empty-note">{s.loading}</p>
                ) : preview ? (
                  <>
                    <p className="cu-invite-room">👥 {preview.name}</p>
                    <p className="cu-empty-note">
                      {fmt(s.inviteMembers, { n: preview.member_count })}
                    </p>
                    {preview.rules ? (
                      <p className="cu-room-rules-text cu-invite-rules">
                        📜 {preview.rules}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="cu-form-error">{s.inviteInvalid}</p>
                )}
                <button
                  type="button"
                  className="cu-btn primary"
                  onClick={onRequireLogin}
                >
                  🔑 {s.inviteJoin}
                </button>
              </div>
            ) : (
              <GuestRooms lang={lang} onRequireLogin={onRequireLogin} />
            )}
          </div>
        </div>
      </main>
    );
  }

  if (openRoomId) {
    return (
      <RoomDetail
        lang={lang}
        roomId={openRoomId}
        onExit={() => {
          setOpenRoomId(null);
          reload();
        }}
      />
    );
  }

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-room-home">
          <h2>👥 {s.modeRoom}</h2>
          {errKey && <p className="cu-form-error">{errText(errKey)}</p>}

          <section className="cu-room-card">
            <h3 className="cu-history-section-title">➕ {s.roomCreate}</h3>
            <label className="cu-field">
              <span>{s.roomName}</span>
              <input
                type="text"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder={s.roomNamePh}
                className="cu-input"
              />
            </label>
            <label className="cu-field">
              <span>{s.roomMaxPlayers}</span>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="cu-select"
              >
                {[2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="cu-check">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span>
                🌐 {s.roomPublic}
                <span className="cu-check-hint">{s.roomPublicHint}</span>
              </span>
            </label>
            <button
              type="button"
              className="cu-btn primary"
              disabled={busy}
              onClick={doCreate}
            >
              {s.roomCreate}
            </button>
          </section>

          <section>
            <h3 className="cu-history-section-title">
              🌐 {s.roomPublicLobby}
            </h3>
            {publicRooms.length === 0 ? (
              <p className="cu-empty-note">{s.roomNoPublicRooms}</p>
            ) : (
              <ul className="cu-history-list">
                {publicRooms.map((r) => (
                  <li key={r.id} className="cu-history-item">
                    <span className="cu-history-icon">
                      {r.has_active_match ? "🔴" : "🟢"}
                    </span>
                    <span className="cu-history-main">
                      <strong>{r.name}</strong>
                      <span className="cu-history-sub">
                        {r.member_count}/{r.max_players} ·{" "}
                        {r.has_active_match ? s.roomPlaying : s.roomLobby}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="cu-btn small"
                      disabled={busy}
                      onClick={() => doJoinPublic(r.code)}
                    >
                      {s.roomJoin}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hotRooms.length > 0 && (
            <section>
              <h3 className="cu-history-section-title">
                🔥 {s.roomHotRooms}
              </h3>
              <ul className="cu-history-list">
                {hotRooms.map((r, i) => (
                  <li key={r.room_id} className="cu-history-item">
                    <span className="cu-history-icon">#{i + 1}</span>
                    <span className="cu-history-main">
                      <strong>{r.name}</strong>
                      <span className="cu-history-sub">
                        🔥 {r.matches_7d} {s.roomMatches7d} ·{" "}
                        {r.member_count} {s.roomMembers.toLowerCase()}
                      </span>
                    </span>
                    {!rooms.some((m) => m.id === r.room_id) && (
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={busy}
                        onClick={() => doJoinPublic(r.code)}
                      >
                        {s.roomJoin}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="cu-room-card">
            <h3 className="cu-history-section-title">🔑 {s.roomJoin}</h3>
            <label className="cu-field">
              <span>{s.roomEnterCode}</span>
              <input
                type="text"
                value={code}
                maxLength={6}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                placeholder={s.roomEnterCodePh}
                className="cu-input cu-room-code-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter") doJoin();
                }}
              />
            </label>
            <button
              type="button"
              className="cu-btn"
              disabled={busy || !code.trim()}
              onClick={doJoin}
            >
              {s.roomJoin}
            </button>
          </section>

          <section>
            <h3 className="cu-history-section-title">📋 {s.roomMyRooms}</h3>
            {rooms.length === 0 ? (
              <p className="cu-empty-note">{s.roomNoRooms}</p>
            ) : (
              <ul className="cu-history-list">
                {rooms.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="cu-room-list-btn"
                      onClick={() => setOpenRoomId(r.id)}
                    >
                      <span className="cu-history-icon">👥</span>
                      <span className="cu-history-main">
                        <strong>{r.name}</strong>
                        <span className="cu-history-sub">
                          {s.roomCode}: {r.code} · {r.member_count}/
                          {r.max_players} ·{" "}
                          {r.status === "playing" ? s.roomPlaying : s.roomLobby}
                        </span>
                      </span>
                      <span aria-hidden="true">▶</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
