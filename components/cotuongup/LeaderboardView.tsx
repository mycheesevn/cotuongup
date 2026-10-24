"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { getSupabase } from "@/lib/supabase/client";
import {
  fetchLeaderboard,
  fetchMyRank,
  syncRewards,
  type LeaderboardEntry,
} from "@/lib/supabase/rewards";
import {
  displayName,
  levelForXp,
  levelProgress,
  ratingTitle,
  xpForLevel,
  START_RATING,
} from "@/lib/jieqi/rating";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import { FriendButton } from "./FriendButton";
import { fetchFollowingIds } from "@/lib/supabase/friends";
import { shareAchievement } from "@/lib/jieqi/achievementCard";
import { StatsView } from "./StatsView";
import { Pagination, usePagination } from "./Pagination";
import { GuestTeaser } from "./GuestTeaser";

const LEADERBOARD_PAGE_SIZE = 15;

interface MyStats {
  username: string | null;
  full_name: string | null;
  rating: number;
  peak_rating: number;
  xp: number;
  games_played: number;
  wins: number;
  active_streak: number;
}

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardView({ lang }: { lang: Lang }) {
  const s = STR[lang];
  const { user, configured } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const entriesPaging = usePagination(entries, LEADERBOARD_PAGE_SIZE);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [me, setMe] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"board" | "stats">("board");
  const [sharingAch, setSharingAch] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  /** Share the user's leaderboard rank as an achievement card. */
  const shareRank = async () => {
    if (sharingAch || myRank == null) return;
    setSharingAch(true);
    try {
      const outcome = await shareAchievement(
        "rank",
        { title: fmt(s.achRankTitle, { rank: myRank }), rank: myRank },
        lang
      );
      setShareToast(outcome === "shared" ? s.shareDone : s.shareDownloaded);
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      /* ignore */
    } finally {
      setSharingAch(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    await syncRewards();
    const [{ entries: e }, rank] = await Promise.all([
      fetchLeaderboard(),
      fetchMyRank(),
    ]);
    setEntries(e);
    setMyRank(rank);
    if (user) {
      const sb = getSupabase();
      const { data } = await sb!
        .from("profiles")
        .select("username,full_name,rating,peak_rating,xp,games_played,wins,active_streak")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setMe({
          username: data.username ?? null,
          full_name: data.full_name ?? null,
          rating: data.rating ?? START_RATING,
          peak_rating: data.peak_rating ?? START_RATING,
          xp: data.xp ?? 0,
          games_played: data.games_played ?? 0,
          wins: data.wins ?? 0,
          active_streak: data.active_streak ?? 0,
        });
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      load();
      fetchFollowingIds().then(setFollowing).catch(() => {});
    } else {
      setLoading(false);
      setEntries([]);
      setMe(null);
    }
  }, [user, load]);

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
            <p className="cu-empty-note">{s.leaderboardLogin}</p>
            <GuestTeaser lang={lang} />
          </div>
        </div>
      </main>
    );
  }

  const myLevel = me ? levelForXp(me.xp) : 1;
  const myProgress = me ? levelProgress(me.xp) : 0;
  const xpNext = xpForLevel(myLevel + 1);
  const winRate =
    me && me.games_played > 0
      ? Math.round((me.wins / me.games_played) * 100)
      : 0;

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-history">
          <div className="cu-lb-tabs">
            <button
              type="button"
              className={tab === "board" ? "active" : ""}
              onClick={() => setTab("board")}
            >
              🏆 {s.leaderboard}
            </button>
            <button
              type="button"
              className={tab === "stats" ? "active" : ""}
              onClick={() => setTab("stats")}
            >
              📊 {s.stats}
            </button>
          </div>
          {tab === "stats" ? (
            <StatsView lang={lang} />
          ) : loading ? (
            <p className="cu-empty-note">{s.loading}</p>
          ) : (
            <>
              {me && (
                <section className="cu-lb-me">
                  {shareToast && <div className="cu-toast">{shareToast}</div>}
                  <div className="cu-captured-row">
                    <span className="cu-captured-label">
                      #{myRank ?? "–"} · {ratingTitle(me.rating, lang)}
                    </span>
                    <span className="cu-stats">⭐ {me.rating}</span>
                    {myRank != null && (
                      <button
                        type="button"
                        className="cu-btn cu-btn-icon"
                        onClick={shareRank}
                        disabled={sharingAch}
                        title={s.achShare}
                        aria-label={s.achShare}
                      >
                        📤
                      </button>
                    )}
                  </div>
                  <div className="cu-captured-row">
                    <span className="cu-captured-label">
                      {me.full_name?.trim() ||
                        displayName(me.username, user.email ?? null, lang)}
                    </span>
                    <span className="cu-stats">
                      Lv {myLevel} · {fmt(s.xpToNext, { xp: xpNext - me.xp, level: myLevel + 1 })}
                    </span>
                  </div>
                  <div
                    className="cu-progress"
                    role="progressbar"
                    aria-valuenow={Math.round(myProgress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="cu-progress-fill"
                      style={{ width: `${myProgress * 100}%` }}
                    />
                  </div>
                  <div className="cu-stats-row">
                    <span>
                      📈 {me.peak_rating} {s.peakRating}
                    </span>
                    <span>
                      🎯 {winRate}% {s.winRate}
                    </span>
                    <span>
                      🔥 {me.active_streak} {s.dayStreak}
                    </span>
                  </div>
                </section>
              )}
              <h3 className="cu-history-section-title">{s.topPlayers}</h3>
              {entries.length === 0 ? (
                <p className="cu-empty-note">{s.leaderboardEmpty}</p>
              ) : (
                <ul className="cu-history-list">
                  {entriesPaging.pageItems.map((e, i) => {
                    const rank = entriesPaging.page * LEADERBOARD_PAGE_SIZE + i;
                    const isMe = user && e.id === user.id;
                    return (
                      <li
                        key={e.id}
                        className={`cu-history-item${isMe ? " cu-lb-me-row" : ""}`}
                      >
                        <span className="cu-history-icon">
                          {RANK_MEDAL[rank] ?? `#${rank + 1}`}
                        </span>
                        <span className="cu-history-main">
                          <strong>
                            {e.full_name?.trim() ||
                              e.username?.trim() ||
                              s.noName}
                            {isMe && ` (${s.you})`}
                          </strong>
                          <span className="cu-history-sub">
                            {ratingTitle(e.rating, lang)} · Lv{" "}
                            {levelForXp(e.xp)} · {e.wins}/{e.games_played}{" "}
                            {s.wins}
                          </span>
                        </span>
                        <span className="cu-stats">⭐ {e.rating}</span>
                        {!isMe && user && (
                          <FriendButton
                            lang={lang}
                            userId={e.id}
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
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {entries.length > 0 && (
                <Pagination
                  page={entriesPaging.page}
                  pageCount={entriesPaging.pageCount}
                  onPage={entriesPaging.setPage}
                />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
