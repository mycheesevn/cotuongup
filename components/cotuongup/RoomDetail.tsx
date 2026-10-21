"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import { RoomMatchView } from "./RoomMatchView";
import { TournamentCard } from "./TournamentCard";
import { FriendButton } from "./FriendButton";
import { fetchFollowingIds } from "@/lib/supabase/friends";
import {
  cancelTournament,
  createTournament,
  deleteRoom,
  fetchComments,
  fetchRoomDetail,
  fetchRoomMessages,
  fetchTournaments,
  kickMember,
  leaveRoom,
  memberName,
  setMemberRole,
  setRoomPublic,
  setTurnOrder,
  startNextMatch,
  subscribeRoom,
  tournamentNextMatch,
  tournamentStandings,
  updateRoomRules,
  type Room,
  type RoomComment,
  type RoomMatch,
  type RoomMember,
  type RoomMessage,
  type RoomTournament,
  type MatchReaction,
} from "@/lib/supabase/rooms";
import {
  canvasToPngFile,
  renderRoomPromoCard,
} from "@/lib/jieqi/shareCard";
import { shareLink, shareResultCard } from "@/lib/jieqi/share";

interface Props {
  lang: Lang;
  roomId: string;
  onExit: () => void;
}

function copyText(text: string): boolean {
  try {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

/** Inside a room: lobby (members, turn order, past matches) or live match. */
export function RoomDetail({ lang, roomId, onExit }: Props) {
  const s = STR[lang];
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<RoomMatch[]>([]);
  const [tournaments, setTournaments] = useState<RoomTournament[]>([]);
  const [tournamentName, setTournamentName] = useState("");
  const [tournErr, setTournErr] = useState<string | null>(null);
  const openTournament =
    tournaments.find((t) => t.status === "open") ?? null;
  const [comments, setComments] = useState<RoomComment[]>([]);
  /** Room-scoped chat stream (member-only), display order oldest→newest. */
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [liveReaction, setLiveReaction] = useState<MatchReaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [kicked, setKicked] = useState(false);
  const [roomDeleted, setRoomDeleted] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  /** True while the owner is deleting — their own delete exits directly. */
  const ownDeleteRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [rulesDraft, setRulesDraft] = useState<string | null>(null);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeMatch = matches.find((m) => m.status === "active") ?? null;
  const activeMatchId = activeMatch?.id ?? null;
  const activeMatchRef = useRef<string | null>(null);
  /**
   * Which match the user is currently viewing. Follows a newly started
   * match automatically, but STAYS on a finished match so the result,
   * checkmate banner and confetti are actually seen (previously the view
   * snapped back to the lobby the instant the match ended, unmounting
   * RoomMatchView before its celebration effect could run). The user
   * leaves explicitly via the back button.
   */
  const [viewMatchId, setViewMatchId] = useState<string | null>(null);
  useEffect(() => {
    if (activeMatchId) setViewMatchId(activeMatchId);
  }, [activeMatchId]);
  const viewMatch = viewMatchId
    ? (matches.find((m) => m.id === viewMatchId) ?? null)
    : null;

  // Polling fallback for live updates: Supabase Realtime can silently fail
  // (e.g. tables missing from the supabase_realtime publication), so refetch
  // the active match + comments every few seconds while a match is live.
  // Harmless when realtime works — identical data causes no visual change.
  useEffect(() => {
    if (!activeMatchId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const d = await fetchRoomDetail(roomId);
        if (cancelled) return;
        const all = d.activeMatch
          ? [d.activeMatch, ...d.pastMatches]
          : d.pastMatches;
        setMatches(all);
        const curId = d.activeMatch?.id ?? activeMatchRef.current;
        if (curId) {
          const cs = await fetchComments(roomId, curId);
          if (!cancelled) setComments(cs);
        }
        // Merge the latest chat messages by id — load-more history must
        // survive the poll, so never hard-replace here.
        const ms = await fetchRoomMessages(roomId);
        if (!cancelled)
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = ms.filter((m) => !seen.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
      } catch {
        /* ignore */
      }
    };
    const t = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [roomId, activeMatchId]);

  const reload = useCallback(async () => {
    try {
      const [d, ts] = await Promise.all([
        fetchRoomDetail(roomId),
        fetchTournaments(roomId),
      ]);
      setRoom(d.room);
      if (d.room.status === "closed") setRoomDeleted(true);
      setMembers(d.members);
      const all = d.activeMatch
        ? [d.activeMatch, ...d.pastMatches]
        : d.pastMatches;
      setMatches(all);
      setTournaments(ts);
    } catch {
      /* room may be closed/deleted */
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const reloadTournaments = useCallback(async () => {
    try {
      setTournaments(await fetchTournaments(roomId));
    } catch {
      /* ignore */
    }
  }, [roomId]);

  // Load comments whenever the active match changes.
  useEffect(() => {
    if (activeMatchId && activeMatchId !== activeMatchRef.current) {
      activeMatchRef.current = activeMatchId;
      fetchComments(roomId, activeMatchId).then(setComments).catch(() => {});
    } else if (!activeMatchId) {
      activeMatchRef.current = null;
    }
  }, [activeMatchId, roomId]);

  // Single realtime channel for the whole room.
  useEffect(() => {
    if (!userId) return;
    reload();
    loadInitialMessages();
    fetchFollowingIds().then(setFollowing).catch(() => {});
    const unsub = subscribeRoom(
      roomId,
      {
        onRoom: (r) => {
          setRoom(r);
          // Deleted (closed) by the owner: members see a notice screen;
          // the owner's own delete exits them directly (see doDeleteRoom).
          if (r.status === "closed") {
            if (ownDeleteRef.current) onExit();
            else setRoomDeleted(true);
          }
        },
        onMembers: () => reload(),
        onMatches: () => reload(),
        onTournaments: () => reloadTournaments(),
        onComment: (c) => {
          if (c.match_id === activeMatchRef.current) {
            setComments((prev) =>
              prev.some((x) => x.id === c.id) ? prev : [...prev, c]
            );
          }
        },
        // Room chat is room-scoped (no match filter); dedupe the
        // local-post + realtime echo by id, mirroring onComment.
        onRoomMessage: (m) => {
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m]
          );
        },
        onReaction: (r) => {
          if (r.match_id === activeMatchRef.current) setLiveReaction(r);
        },
        onKicked: () => setKicked(true),
      },
      userId
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  const inviteLink = () => shareLink(`/?room=${room?.code ?? ""}`);

  const doCopy = (text: string) => {
    if (copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  /** Generate a promo image card and open the native share sheet. */
  const promoteRoom = async () => {
    if (!room || promoting) return;
    setPromoting(true);
    try {
      const link = await inviteLink();
      const canvas = renderRoomPromoCard({
        roomName: room.name,
        code: room.code,
        memberLine: s.roomPromoMembers(members.length),
        footer: s.shareFooter,
      });
      const file = await canvasToPngFile(canvas, `phong-${room.code}.png`);
      await shareResultCard({
        file,
        fileName: `phong-${room.code}.png`,
        title: room.name,
        text: `${room.name}\n${s.roomCode}: ${room.code}`,
        url: link,
      });
    } catch {
      /* user cancelled or share failed */
    } finally {
      setPromoting(false);
    }
  };

  const saveRules = () => {
    const text = (rulesDraft ?? room?.rules ?? "").slice(0, 500);
    runBusy(async () => {
      if (!room) return;
      await updateRoomRules(room.id, text);
      setRulesDraft(null);
      setRulesSaved(true);
      window.setTimeout(() => setRulesSaved(false), 2500);
    });
  };

  /** Authoritative match-row update from the match view (the server's
   *  move/start route response — rooms are server-authoritative, so
   *  there is no optimistic local move application anymore). */
  const onMatchPatched = useCallback((updated: RoomMatch) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
  }, []);

  const onComment = useCallback((c: RoomComment) => {
    setComments((prev) =>
      prev.some((x) => x.id === c.id) ? prev : [...prev, c]
    );
  }, []);

  const onMessage = useCallback((m: RoomMessage) => {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev : [...prev, m]
    );
  }, []);

  /** Load the latest 50 chat messages when the room view mounts. */
  const loadInitialMessages = useCallback(() => {
    setMessages([]);
    fetchRoomMessages(roomId, 50)
      .then((ms) => {
        setMessages(ms);
        setHasMoreMessages(ms.length === 50);
      })
      .catch(() => {});
  }, [roomId]);

  // Ref mirror of messages for the load-more cursor (avoids side
  // effects inside a state updater).
  const messagesRef = useRef<RoomMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  /** Page backwards from the oldest visible message ("load more"). */
  const loadMoreMessages = useCallback(() => {
    const oldest = messagesRef.current[0]?.created_at;
    if (!oldest) return;
    fetchRoomMessages(roomId, 50, oldest)
      .then((older) => {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !seen.has(m.id));
          return [...fresh, ...prev];
        });
        setHasMoreMessages(older.length === 50);
      })
      .catch(() => {});
  }, [roomId]);

  const runBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch {
      /* error toast is handled by callers where it matters */
    } finally {
      setBusy(false);
    }
  };

  const isLeader = room?.leader_id === userId;

  /**
   * Owner-only permanent room deletion. The server blocks the delete while
   * a match is active (match_in_progress) — surfaced here as a visible
   * message; the existing leader cancel-match control is how to end it.
   */
  const doDeleteRoom = async () => {
    if (busy) return;
    if (!window.confirm(s.roomDeleteConfirm)) return;
    ownDeleteRef.current = true;
    setDeleteErr(null);
    setBusy(true);
    try {
      await deleteRoom(roomId);
      onExit();
    } catch (e) {
      ownDeleteRef.current = false;
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteErr(
        msg.includes("match_in_progress") ? s.roomDeleteBlocked : s.roomDeleteError
      );
    } finally {
      setBusy(false);
    }
  };
  const orderedPlayers = (room?.turn_order ?? [])
    .map((id) => members.find((m) => m.user_id === id))
    .filter((m): m is RoomMember => !!m && m.role === "player");

  const movePlayer = (index: number, dir: -1 | 1) => {
    const order = (room?.turn_order ?? []).filter(
      (id) => members.find((m) => m.user_id === id)?.role === "player"
    );
    const j = index + dir;
    if (index < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[index], next[j]] = [next[j], next[index]];
    runBusy(() => setTurnOrder(roomId, next));
  };

  if (kicked) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <div className="cu-room-home">
            <p className="cu-empty-note">{s.roomKicked}</p>
            <button type="button" className="cu-btn" onClick={onExit}>
              ← {s.roomMyRooms}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (roomDeleted) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <div className="cu-room-home">
            <p className="cu-empty-note">🗑 {s.roomDeletedNotice}</p>
            <button type="button" className="cu-btn" onClick={onExit}>
              ← {s.roomMyRooms}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loading || !room) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <p className="cu-empty-note">{s.loading}</p>
        </div>
      </main>
    );
  }

  if (viewMatch) {
    return (
      <RoomMatchView
        key={viewMatch.id}
        lang={lang}
        userId={userId}
        room={room}
        members={members}
        match={viewMatch}
        comments={comments}
        liveReaction={liveReaction}
        onMatchPatched={onMatchPatched}
        onComment={onComment}
        messages={messages}
        onMessage={onMessage}
        onLoadMoreMessages={loadMoreMessages}
        hasMoreMessages={hasMoreMessages}
        onExit={() => setViewMatchId(null)}
      />
    );
  }

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-room-home">
          <div className="cu-room-lobby-head">
            <button type="button" className="cu-btn small" onClick={onExit}>
              ← {s.roomMyRooms}
            </button>
            <h2>👥 {room.name}</h2>
          </div>

          <div className="cu-room-code-card">
            <div>
              <div className="cu-room-code-label">{s.roomCode}</div>
              <div className="cu-room-code">{room.code}</div>
            </div>
            <div className="cu-room-code-actions">
              <button
                type="button"
                className="cu-btn small"
                onClick={() => doCopy(room.code)}
              >
                {s.roomCopyCode}
              </button>
              <button
                type="button"
                className="cu-btn small"
                onClick={async () => doCopy(await inviteLink())}
              >
                🔗 {s.roomCopyLink}
              </button>
              <button
                type="button"
                className="cu-btn small"
                onClick={promoteRoom}
                disabled={promoting}
              >
                📣 {promoting ? "…" : s.roomPromote}
              </button>
            </div>
            {copied && <span className="cu-room-copied">{s.roomCopied}</span>}
          </div>

          {(isLeader || room.rules) && (
            <div className="cu-room-rules-card">
              <div className="cu-room-code-label">📜 {s.roomRules}</div>
              {isLeader ? (
                <>
                  <textarea
                    className="cu-room-rules-input"
                    rows={3}
                    maxLength={500}
                    placeholder={s.roomRulesPlaceholder}
                    value={rulesDraft ?? room.rules ?? ""}
                    onChange={(e) => setRulesDraft(e.target.value)}
                  />
                  <div className="cu-room-code-actions">
                    <button
                      type="button"
                      className="cu-btn small"
                      disabled={
                        busy || (rulesDraft ?? room.rules ?? "") === (room.rules ?? "")
                      }
                      onClick={saveRules}
                    >
                      💾 {s.roomSaveRules}
                    </button>
                    {rulesSaved && (
                      <span className="cu-room-copied">{s.roomRulesSaved}</span>
                    )}
                  </div>
                  <p className="cu-empty-note">{s.roomRulesHint}</p>
                </>
              ) : (
                <p className="cu-room-rules-text">{room.rules}</p>
              )}
            </div>
          )}

          <section>
            <h3 className="cu-history-section-title">
              🥊 {s.roomTurnOrder} · {s.roomMembers} ({members.length}/
              {room.max_players})
            </h3>
            <p className="cu-empty-note">{s.roomTurnOrderHint}</p>
            <ul className="cu-history-list">
              {[
                ...orderedPlayers.map((m, i) => ({ m, i })),
                ...members
                  .filter((m) => m.role === "spectator")
                  .map((m) => ({ m, i: -1 })),
              ].map(({ m, i }) => (
                <li key={m.user_id} className="cu-history-item">
                  <span className="cu-room-avatar">
                    {m.profile?.avatar_url ? (
                      <img
                        src={m.profile.avatar_url}
                        alt=""
                        className="cu-room-avatar-img"
                      />
                    ) : (
                      memberName(m.profile, "?").slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="cu-history-main">
                    <strong>
                      {m.user_id === room.leader_id ? "👑 " : ""}
                      {i >= 0 ? `#${i + 1} ` : "👀 "}
                      {memberName(m.profile, "?")}
                      {m.user_id === userId ? ` (${s.you})` : ""}
                    </strong>
                    <span className="cu-history-sub">
                      {m.user_id === room.leader_id
                        ? s.roomLeader
                        : i >= 0
                          ? s.roomPlayer
                          : s.roomSpectator}
                    </span>
                  </span>
                  {isLeader && m.user_id !== userId && (
                    <span className="cu-room-order-btns">
                      {i >= 0 && (
                        <>
                          <button
                            type="button"
                            className="cu-btn small"
                            disabled={i === 0 || busy}
                            onClick={() => movePlayer(i, -1)}
                            aria-label="move up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="cu-btn small"
                            disabled={i === orderedPlayers.length - 1 || busy}
                            onClick={() => movePlayer(i, 1)}
                            aria-label="move down"
                          >
                            ▼
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={busy}
                        onClick={() =>
                          runBusy(() =>
                            setMemberRole(
                              roomId,
                              m.user_id,
                              i >= 0 ? "spectator" : "player"
                            )
                          )
                        }
                        title={
                          i >= 0 ? s.roomMakeSpectator : s.roomMakePlayer
                        }
                      >
                        {i >= 0 ? "👀" : "🎮"}
                      </button>
                      <button
                        type="button"
                        className="cu-btn small danger"
                        disabled={busy}
                        onClick={() =>
                          runBusy(() => kickMember(roomId, m.user_id))
                        }
                        title={s.roomKick}
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {m.user_id !== userId && (
                    <span className="cu-room-order-btns">
                      <FriendButton
                        lang={lang}
                        userId={m.user_id}
                        following={following}
                        onChanged={(id, now) =>
                          setFollowing((prev) => {
                            const next = new Set(prev);
                            if (now) next.add(id);
                            else next.delete(id);
                            return next;
                          })
                        }
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isLeader && (
            <label className="cu-check">
              <input
                type="checkbox"
                checked={!!room.is_public}
                disabled={busy}
                onChange={(e) =>
                  runBusy(() => setRoomPublic(roomId, e.target.checked))
                }
              />
              <span>
                🌐 {s.roomPublic}
                <span className="cu-check-hint">{s.roomPublicHint}</span>
              </span>
            </label>
          )}

          {isLeader && !openTournament && (
            <button
              type="button"
              className="cu-btn primary"
              disabled={busy || orderedPlayers.length < 2}
              onClick={() =>
                runBusy(async () => {
                  await startNextMatch(roomId);
                })
              }
              title={
                orderedPlayers.length < 2 ? s.roomNeedTwoPlayers : undefined
              }
            >
              {s.roomStartMatch}
            </button>
          )}

          <section>
            <h3 className="cu-history-section-title">🏆 {s.roomTournament}</h3>
            {tournaments.length === 0 && (
              <p className="cu-empty-note">{s.roomNoTournament}</p>
            )}
            {isLeader && !openTournament && (
              <div className="cu-room-tournament-create">
                <input
                  type="text"
                  value={tournamentName}
                  maxLength={60}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder={s.roomTournamentNamePh}
                  className="cu-input"
                />
                <button
                  type="button"
                  className="cu-btn small"
                  disabled={busy || orderedPlayers.length < 3}
                  title={
                    orderedPlayers.length < 3
                      ? s.roomNeedThreePlayers
                      : undefined
                  }
                  onClick={() =>
                    runBusy(async () => {
                      try {
                        await createTournament(roomId, tournamentName.trim());
                        setTournamentName("");
                      } catch (e) {
                        setTournErr(
                          e instanceof Error &&
                            String(
                              (e as { message?: string }).message ?? ""
                            ).includes("not_enough_players")
                            ? s.roomNeedThreePlayers
                            : s.roomTournamentInProgress
                        );
                      }
                    })
                  }
                >
                  {s.roomCreateTournament}
                </button>
              </div>
            )}
            {tournErr && <p className="cu-form-error">{tournErr}</p>}
            {tournaments.slice(0, 3).map((t) => (
              <TournamentCard
                key={t.id}
                lang={lang}
                tournament={t}
                members={members}
                isLeader={!!isLeader}
                busy={busy}
                onNext={() =>
                  runBusy(async () => {
                    await tournamentNextMatch(t.id, roomId);
                  })
                }
                onCancel={() =>
                  runBusy(async () => {
                    await cancelTournament(t.id);
                  })
                }
              />
            ))}
          </section>

          <section>
            <h3 className="cu-history-section-title">🏁 {s.roomPastMatches}</h3>
            {matches.length === 0 ? (
              <p className="cu-empty-note">{s.roomNoMatches}</p>
            ) : (
              <ul className="cu-history-list">
                {matches.slice(0, 10).map((mt) => {
                  const n = mt.moves
                    ? mt.moves.split(",").filter(Boolean).length
                    : 0;
                  return (
                    <li key={mt.id} className="cu-history-item">
                      <span className="cu-history-icon">
                        {mt.status === "cancelled"
                          ? "🚫"
                          : mt.result === "red"
                            ? "🔴"
                            : mt.result === "black"
                              ? "⚫"
                              : "🤝"}
                      </span>
                      <span className="cu-history-main">
                        <strong>
                          🔴 {nameOf(members, mt.red_id, "?")} {s.roomVs} ⚫{" "}
                          {nameOf(members, mt.black_id, "?")}
                        </strong>
                        <span className="cu-history-sub">
                          {n} {s.movesCount} ·{" "}
                          {new Date(mt.created_at).toLocaleDateString(
                            lang === "vi" ? "vi-VN" : "en-US"
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="cu-room-danger">
            {!isLeader && (
              <button
                type="button"
                className="cu-btn small"
                disabled={busy}
                onClick={() => runBusy(() => leaveRoom(roomId)).then(onExit)}
              >
                🚪 {s.roomLeave}
              </button>
            )}
            {isLeader && (
              <button
                type="button"
                className="cu-btn small danger"
                disabled={busy}
                onClick={doDeleteRoom}
              >
                🗑 {s.roomDelete}
              </button>
            )}
            {deleteErr && <p className="cu-form-error">{deleteErr}</p>}
          </div>
        </div>
      </div>
    </main>
  );

  function nameOf(ms: RoomMember[], id: string | null, fb: string) {
    const m = ms.find((x) => x.user_id === id);
    return m ? memberName(m.profile, fb) : fb;
  }
}
