"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import {
  acceptChallenge,
  declineChallenge,
  displayNameOf,
  fetchFriendMatchStatus,
  fetchFriends,
  fetchPendingChallenges,
  sendChallenge,
  subscribeOnline,
  unfollowUser,
  type ChallengeNotice,
  type FriendProfile,
} from "@/lib/supabase/friends";
import { notifyPushTrigger } from "@/lib/push/client";

interface Props {
  lang: Lang;
  /** Navigate to a room via its invite code. */
  onOpenRoom: (code: string) => void;
  /** Deep-link: highlight this incoming challenge (e.g. from a notification). */
  highlightChallengeId?: string | null;
  onHighlightConsumed?: () => void;
}

/** Friends list: online status, active matches, challenges, unfriend. */
export function FriendsView({
  lang,
  onOpenRoom,
  highlightChallengeId,
  onHighlightConsumed,
}: Props) {
  const s = STR[lang];
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [matchStatus, setMatchStatus] = useState<
    Record<string, { room_id: string; code: string }>
  >({});
  const [incoming, setIncoming] = useState<ChallengeNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightRef = useRef<HTMLLIElement | null>(null);

  // Deep-link: scroll to and flash the highlighted challenge once loaded.
  useEffect(() => {
    if (highlightChallengeId && incoming.some((c) => c.id === highlightChallengeId)) {
      highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      const t = setTimeout(() => onHighlightConsumed?.(), 3000);
      return () => clearTimeout(t);
    }
  }, [highlightChallengeId, incoming, onHighlightConsumed]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [fs, cs] = await Promise.all([
        fetchFriends(),
        fetchPendingChallenges(),
      ]);
      setFriends(fs);
      setIncoming(cs);
      if (fs.length > 0) {
        setMatchStatus(
          await fetchFriendMatchStatus(fs.map((f) => f.id))
        );
      } else {
        setMatchStatus({});
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return subscribeOnline(setOnlineIds);
  }, [reload]);

  const doChallenge = async (f: FriendProfile) => {
    if (busyId) return;
    setBusyId(f.id);
    try {
      const { room_code } = await sendChallenge(f.id, displayNameOf(f));
      if (room_code) onOpenRoom(room_code);
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const doUnfriend = async (f: FriendProfile) => {
    if (busyId) return;
    setBusyId(f.id);
    try {
      await unfollowUser(f.id);
      setFriends((prev) => prev.filter((x) => x.id !== f.id));
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const doAccept = async (c: ChallengeNotice) => {
    if (busyId) return;
    setBusyId(c.id);
    try {
      const code = await acceptChallenge(c);
      setIncoming((prev) => prev.filter((x) => x.id !== c.id));
      if (code) onOpenRoom(code);
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const doDecline = async (c: ChallengeNotice) => {
    if (busyId) return;
    setBusyId(c.id);
    try {
      await declineChallenge(c);
      setIncoming((prev) => prev.filter((x) => x.id !== c.id));
      notifyPushTrigger({ kind: "challenge_declined", challengeId: c.id });
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <p className="cu-empty-note">{s.loading}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-friends">
          <h2>
            {s.modeFriends} ({friends.length})
          </h2>

          {incoming.length > 0 && (
            <section>
              <h3>{s.friendsChallengeIncoming}</h3>
              <ul className="cu-history-list">
                {incoming.map((c) => (
                  <li
                    key={c.id}
                    ref={c.id === highlightChallengeId ? highlightRef : undefined}
                    className={`cu-history-item cu-challenge-item${
                      c.id === highlightChallengeId ? " cu-challenge-highlight" : ""
                    }`}
                  >
                    <span className="cu-history-main">
                      <strong>{fmt(s.challengeFrom, { name: c.challenger_name })}</strong>
                    </span>
                    <span className="cu-room-order-btns">
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={busyId === c.id}
                        onClick={() => doAccept(c)}
                      >
                        {s.challengeAccept}
                      </button>
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={busyId === c.id}
                        onClick={() => doDecline(c)}
                      >
                        {s.challengeDecline}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {friends.length === 0 ? (
            <p className="cu-empty-note">{s.friendsEmpty}</p>
          ) : (
            <ul className="cu-history-list">
              {friends.map((f) => {
                const online = onlineIds.has(f.id);
                const ms = matchStatus[f.id];
                return (
                  <li key={f.id} className="cu-history-item">
                    <span className="cu-room-avatar">
                      {f.avatar_url ? (
                        <img
                          src={f.avatar_url}
                          alt=""
                          className="cu-room-avatar-img"
                        />
                      ) : (
                        displayNameOf(f).slice(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="cu-history-main">
                      <strong>
                        <span
                          className={`cu-online-dot${online ? " on" : ""}`}
                          aria-label={online ? s.friendsOnline : undefined}
                        />
                        {displayNameOf(f)}
                      </strong>
                      <span className="cu-history-sub">
                        ⭐ {f.rating}
                        {online && ` · ${s.friendsOnline}`}
                        {ms && ` · 🔴 ${s.friendsInMatch}`}
                      </span>
                    </span>
                    <span className="cu-room-order-btns">
                      {ms?.code && (
                        <button
                          type="button"
                          className="cu-btn small"
                          onClick={() => onOpenRoom(ms.code)}
                        >
                          {s.friendsWatch}
                        </button>
                      )}
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={busyId === f.id}
                        onClick={() => doChallenge(f)}
                      >
                        {s.friendsChallenge}
                      </button>
                      <button
                        type="button"
                        className="cu-btn small"
                        disabled={busyId === f.id}
                        onClick={() => doUnfriend(f)}
                        title={s.friendsUnfriend}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
