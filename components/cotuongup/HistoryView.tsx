"use client";

import { useCallback, useEffect, useState } from "react";
import {
  decodeGame,
  deleteGame,
  fetchGames,
  fetchStats,
  type SavedGame,
} from "@/lib/supabase/games";
import {
  deletePuzzleResult,
  fetchPuzzleResults,
  type PuzzleResult,
} from "@/lib/supabase/puzzleHistory";
import { fetchRatingHistory } from "@/lib/supabase/rewards";
import {
  fetchMyRoomMatches,
  type MyRoomMatch,
} from "@/lib/supabase/rooms";
import { createGame } from "@/lib/jieqi/engine";
import { getDailyPuzzle, puzzleState } from "@/lib/jieqi/puzzles";
import { useAuth } from "@/lib/supabase/AuthContext";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import type { JieqiState } from "@/lib/jieqi/types";
import { siteOrigin } from "@/lib/jieqi/share";
import type { VideoGame } from "./VideoExportModal";
import { Pagination, usePagination } from "./Pagination";
import { GuestTeaser } from "./GuestTeaser";

const HISTORY_PAGE_SIZE = 10;

interface Props {
  lang: Lang;
  onReplay: (game: {
    state: JieqiState;
    moves: string[];
    title: string;
  }) => void;
  onExportVideo: (game: VideoGame) => void;
}

const RESULT_ICON: Record<string, string> = {
  win: "🏆",
  loss: "💔",
  draw: "🤝",
};

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** SVG polyline points for the rating sparkline (300x60 viewBox). */
function ratingSparkPoints(pts: { rating: number }[]): string {
  const n = pts.length;
  const min = Math.min(...pts.map((p) => p.rating));
  const max = Math.max(...pts.map((p) => p.rating));
  const span = Math.max(1, max - min);
  return pts
    .map((p, i) => {
      const x = n === 1 ? 150 : (i / (n - 1)) * 300;
      const y = 56 - ((p.rating - min) / span) * 48;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function HistoryView({ lang, onReplay, onExportVideo }: Props) {
  const s = STR[lang];
  const { user, configured } = useAuth();
  const [games, setGames] = useState<SavedGame[]>([]);
  const [puzzles, setPuzzles] = useState<PuzzleResult[]>([]);
  const [roomMatches, setRoomMatches] = useState<MyRoomMatch[]>([]);
  const gamesPaging = usePagination(games, HISTORY_PAGE_SIZE);
  const puzzlesPaging = usePagination(puzzles, HISTORY_PAGE_SIZE);
  const roomPaging = usePagination(roomMatches, HISTORY_PAGE_SIZE);
  const [ratingPts, setRatingPts] = useState<{ rating: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ wins: 0, losses: 0, draws: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ games: g }, st, { results: pr }, { points: rp }, rm] =
      await Promise.all([
        fetchGames(),
        fetchStats(),
        fetchPuzzleResults(),
        fetchRatingHistory(),
        fetchMyRoomMatches(),
      ]);
    setGames(g);
    setStats({ wins: st.wins, losses: st.losses, draws: st.draws });
    setPuzzles(pr);
    setRatingPts(rp);
    setRoomMatches(rm);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) load();
    else {
      setLoading(false);
      setGames([]);
      setPuzzles([]);
      setRatingPts([]);
      setRoomMatches([]);
    }
  }, [user, load]);

  const onDelete = async (id: string) => {
    await deleteGame(id);
    setGames((prev) => prev.filter((g) => g.id !== id));
  };

  const onDeletePuzzle = async (id: string) => {
    await deletePuzzleResult(id);
    setPuzzles((prev) => prev.filter((r) => r.id !== id));
  };

  /** Rebuild the board of the daily puzzle played on a given date. */
  const replayPuzzle = (r: PuzzleResult) => {
    const date = new Date(r.puzzle_date + "T12:00:00");
    const p = getDailyPuzzle(date);
    onReplay({
      moves: r.moves ? r.moves.split(",").filter(Boolean) : [],
      state: puzzleState(p),
      title: `${s.puzzleNum(r.puzzle_id)} · ${fmtDate(r.created_at, lang)} · ${
        r.solved ? s.puzzleSolved : s.puzzleFailed
      }`,
    });
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
            <p className="cu-empty-note">{s.historyLogin}</p>
            <GuestTeaser lang={lang} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-history">
          <div className="cu-stats-row">
            <span>
              🏆 {stats.wins} {s.wins}
            </span>
            <span>
              💔 {stats.losses} {s.losses}
            </span>
            <span>
              🤝 {stats.draws} {s.draws}
            </span>
          </div>
          {!loading && ratingPts.length > 1 && (
            <div className="cu-spark">
              <div className="cu-captured-row">
                <span className="cu-captured-label">📈 {s.ratingProgress}</span>
                <span className="cu-stats">
                  {ratingPts[0].rating} →{" "}
                  {ratingPts[ratingPts.length - 1].rating} (
                  {(ratingPts[ratingPts.length - 1].rating >=
                  ratingPts[0].rating
                    ? "+"
                    : "") +
                    (ratingPts[ratingPts.length - 1].rating -
                      ratingPts[0].rating)}
                  )
                </span>
              </div>
              <svg
                viewBox="0 0 300 60"
                preserveAspectRatio="none"
                className="cu-spark-svg"
                aria-hidden="true"
              >
                <polyline
                  points={ratingSparkPoints(ratingPts)}
                  fill="none"
                  stroke="#ffd43b"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          )}
          {loading ? (
            <p className="cu-empty-note">{s.loading}</p>
          ) : games.length === 0 ? (
            <p className="cu-empty-note">{s.historyEmpty}</p>
          ) : (
            <ul className="cu-history-list">
              {gamesPaging.pageItems.map((g) => {
                const moves = g.moves ? g.moves.split(",").filter(Boolean) : [];
                return (
                  <li key={g.id} className="cu-history-item">
                    <span className="cu-history-icon">
                      {RESULT_ICON[g.result] ?? "•"}
                    </span>
                    <span className="cu-history-main">
                      <strong>
                        {g.player_color === "cvc"
                          ? `🤖 ${s.cvcTitle}`
                          : s.resultText(g.result as "win" | "loss" | "draw")}
                      </strong>
                      <span className="cu-history-sub">
                        {g.player_color === "cvc"
                          ? `${
                              g.result === "win"
                                ? s.cvcRedWon
                                : g.result === "loss"
                                  ? s.cvcBlackWon
                                  : s.cvcDrawn
                            } · `
                          : ""}
                        {s.level} {g.ai_level} · {moves.length} {s.movesCount} ·{" "}
                        {fmtDate(g.created_at, lang)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="cu-btn small"
                      onClick={() =>
                        onReplay({
                          ...decodeGame(g),
                          title: `${fmtDate(g.created_at, lang)} · ${
                            g.player_color === "cvc"
                              ? `🤖 ${s.cvcTitle}`
                              : s.resultText(
                                  g.result as "win" | "loss" | "draw"
                                )
                          }`,
                        })
                      }
                    >
                      {s.historyReplay}
                    </button>
                    <button
                      type="button"
                      className="cu-btn small"
                      title={s.videoExport}
                      onClick={() =>
                        onExportVideo({
                          ...decodeGame(g),
                          title:
                            g.player_color === "cvc"
                              ? g.result === "win"
                                ? s.cvcRedWon
                                : g.result === "loss"
                                  ? s.cvcBlackWon
                                  : s.cvcDrawn
                              : `${s.resultText(
                                  g.result as "win" | "loss" | "draw"
                                )} · ${s.level} ${g.ai_level}`,
                          subtitle: `${moves.length} ${s.movesCount} · ${fmtDate(
                            g.created_at,
                            lang
                          )}`,
                          shareUrl: `${siteOrigin()}/?game=${g.id}`,
                        })
                      }
                    >
                      🎬
                    </button>
                    <button
                      type="button"
                      className="cu-btn small danger"
                      onClick={() => onDelete(g.id)}
                      title={s.historyDelete}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && games.length > 0 && (
            <Pagination
              page={gamesPaging.page}
              pageCount={gamesPaging.pageCount}
              onPage={gamesPaging.setPage}
            />
          )}
          {!loading && (
            <div className="cu-puzzle-history">
              <h3 className="cu-history-section-title">
                👥 {s.roomMatchHistory}
              </h3>
              {roomMatches.length === 0 ? (
                <p className="cu-empty-note">{s.roomMatchHistoryEmpty}</p>
              ) : (
                <>
                  <ul className="cu-history-list">
                    {roomPaging.pageItems.map((m) => {
                      const moves = m.moves
                        ? m.moves.split(",").filter(Boolean)
                        : [];
                      const myResult =
                        m.result === "draw"
                          ? "draw"
                          : m.result === m.my_color
                            ? "win"
                            : "loss";
                      const reason =
                        m.reason === "checkmate"
                          ? s.roomReasonCheckmate
                          : m.reason === "stalemate"
                            ? s.roomReasonStalemate
                            : m.reason === "resign"
                              ? s.roomReasonResign
                              : "";
                      return (
                        <li key={m.id} className="cu-history-item">
                          <span className="cu-history-icon">
                            {RESULT_ICON[myResult] ?? "•"}
                          </span>
                          <span className="cu-history-main">
                            <strong>
                              {s.resultText(
                                myResult as "win" | "loss" | "draw"
                              )}
                              {m.opponent_name
                                ? ` ${s.roomVs} ${m.opponent_name}`
                                : ""}
                            </strong>
                            <span className="cu-history-sub">
                              👥 {m.room_name} · {moves.length} {s.movesCount}
                              {reason ? ` · ${reason}` : ""} ·{" "}
                              {fmtDate(
                                m.finished_at ?? m.created_at,
                                lang
                              )}
                            </span>
                          </span>
                          {moves.length > 0 && m.revealed_seed && (
                            <button
                              type="button"
                              className="cu-btn small"
                              onClick={() =>
                                onReplay({
                                  moves,
                                  // Finished room matches reveal the deal
                                  // seed, so the replay rebuilds the exact
                                  // true game (flips included).
                                  state: createGame(m.revealed_seed!),
                                  title: `👥 ${m.opponent_name || m.room_name} · ${fmtDate(
                                    m.finished_at ?? m.created_at,
                                    lang
                                  )}`,
                                })
                              }
                            >
                              {s.historyReplay}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <Pagination
                    page={roomPaging.page}
                    pageCount={roomPaging.pageCount}
                    onPage={roomPaging.setPage}
                  />
                </>
              )}
            </div>
          )}
          {!loading && (
            <div className="cu-puzzle-history">
              <h3 className="cu-history-section-title">🧩 {s.puzzleHistory}</h3>
              {puzzles.length === 0 ? (
                <p className="cu-empty-note">{s.puzzleHistoryEmpty}</p>
              ) : (
                <ul className="cu-history-list">
                  {puzzlesPaging.pageItems.map((r) => {
                    const moves = r.moves
                      ? r.moves.split(",").filter(Boolean)
                      : [];
                    return (
                      <li key={r.id} className="cu-history-item">
                        <span className="cu-history-icon">
                          {r.solved ? "✅" : "❌"}
                        </span>
                        <span className="cu-history-main">
                          <strong>
                            {r.solved ? s.puzzleSolved : s.puzzleFailed}
                          </strong>
                          <span className="cu-history-sub">
                            {s.puzzleNum(r.puzzle_id)} · {moves.length}{" "}
                            {s.movesCount} · {fmtDate(r.created_at, lang)}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="cu-btn small"
                          onClick={() => replayPuzzle(r)}
                        >
                          {s.historyReplay}
                        </button>
                        <button
                          type="button"
                          className="cu-btn small danger"
                          onClick={() => onDeletePuzzle(r.id)}
                          title={s.historyDelete}
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {puzzles.length > 0 && (
                <Pagination
                  page={puzzlesPaging.page}
                  pageCount={puzzlesPaging.pageCount}
                  onPage={puzzlesPaging.setPage}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
