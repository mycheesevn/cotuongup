"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import {
  findGeneral,
  isInCheck,
  legalMovesForSquare,
  parseUci,
  verifyCommitment,
  type Color,
  type MaskedState,
  type Move,
} from "@/lib/jieqi/core";
import { viewBoardMasked } from "@/lib/jieqi/engine";
import {
  maskedToPlaceholderState,
  viewBoardFromTrueFen,
} from "@/lib/rooms/maskedView";
import { useAuth } from "@/lib/supabase/AuthContext";
import { fetchFriends, type FriendProfile } from "@/lib/supabase/friends";
import {
  createCorrGame,
  fetchMyCorrGames,
  subscribeCorrGame,
  toCorrGame,
  type CorrGame,
} from "@/lib/supabase/correspondence";
import {
  fetchMatchMasked,
  submitRoomAction,
  submitRoomMove,
} from "@/lib/supabase/rooms";
import { notifyPushTrigger } from "@/lib/push/client";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import {
  playCapture,
  playCheck,
  playMove,
  playSelect,
} from "@/lib/jieqi/sound";

// Correspondence (cờ thư) — SERVER-AUTHORITATIVE like rooms (ROOMS_SPEC
// §0.3): a corr game is a cu_matches row with mode='corr'. The client
// renders the server's MaskedState and submits moves to /api/rooms/move;
// it never applies a move locally and never holds a true state.

function oppName(g: CorrGame): string {
  const o = g.opponent;
  if (!o) return "…";
  return o.full_name || o.username || "…";
}

function timeAgo(iso: string, lang: Lang): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (lang === "vi") {
    if (mins < 1) return "vừa xong";
    if (mins < 60) return `${mins} phút trước`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CorrView({
  lang,
  initialGameId,
  onInitialConsumed,
}: {
  lang: Lang;
  /** Deep-link: open this game on mount (e.g. from a notification). */
  initialGameId?: string | null;
  onInitialConsumed?: () => void;
}) {
  const s = STR[lang];
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [games, setGames] = useState<CorrGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    fetchMyCorrGames().then((g) => {
      setGames(g);
      setLoading(false);
    });
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Deep-link: open the requested game once the list loads.
  useEffect(() => {
    if (initialGameId && games.some((g) => g.id === initialGameId)) {
      setOpenId(initialGameId);
      onInitialConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGameId, games]);

  const openGame = games.find((g) => g.id === openId) ?? null;

  const startPick = async () => {
    setPicking(true);
    try {
      setFriends(await fetchFriends());
    } catch {
      setFriends([]);
    }
  };

  const create = async (friendId: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const g = await createCorrGame(friendId);
      setPicking(false);
      await refresh();
      setOpenId(g.id);
    } finally {
      setCreating(false);
    }
  };

  if (!uid) {
    return (
      <main className="cu-layout">
        <div className="cu-scroll-area">
          <p className="cu-push-hint">{s.corrLogin}</p>
        </div>
      </main>
    );
  }

  if (openGame) {
    return (
      <CorrBoard
        lang={lang}
        game={openGame}
        uid={uid}
        onBack={() => {
          setOpenId(null);
          refresh();
        }}
        onChanged={setGames}
      />
    );
  }

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div className="cu-room-lobby-head">
          <h2>✉️ {s.corrTitle}</h2>
          <button type="button" className="cu-btn small" onClick={startPick}>
            ＋ {s.corrNew}
          </button>
        </div>
        {picking && (
          <div className="cu-corr-pick">
            <h3>{s.corrPickFriend}</h3>
            {friends.length === 0 && <p className="cu-push-hint">{s.corrNoFriends}</p>}
            {friends.map((f) => (
              <button
                key={f.id}
                type="button"
                className="cu-btn"
                disabled={creating}
                onClick={() => create(f.id)}
              >
                {f.full_name || f.username || "…"}
              </button>
            ))}
            <button type="button" className="cu-btn" onClick={() => setPicking(false)}>
              {s.videoCancel}
            </button>
          </div>
        )}
        {loading && <p className="cu-push-hint">{s.loading}</p>}
        {!loading && games.length === 0 && !picking && (
          <p className="cu-push-hint">{s.corrEmpty}</p>
        )}
        <div className="cu-corr-list">
          {games.map((g) => {
            const codes = g.moves ? g.moves.split(",").filter(Boolean) : [];
            const myColor: Color = g.red_id === uid ? "red" : "black";
            const turn: Color = codes.length % 2 === 0 ? "red" : "black";
            const myTurn = g.status === "active" && turn === myColor;
            return (
              <button
                key={g.id}
                type="button"
                className={`cu-corr-card ${myTurn ? "cu-corr-turn" : ""}`}
                onClick={() => setOpenId(g.id)}
              >
                <div className="cu-corr-top">
                  <span className="cu-corr-opp">🃏 {oppName(g)}</span>
                  {g.status === "finished" ? (
                    <span className="cu-corr-badge-done">
                      {g.result === "draw"
                        ? s.draws
                        : g.winner_id === uid
                          ? s.wins
                          : s.losses}
                    </span>
                  ) : myTurn ? (
                    <span className="cu-corr-badge-turn">{s.corrYourTurn}</span>
                  ) : (
                    <span className="cu-corr-badge-wait">{s.corrWaiting}</span>
                  )}
                </div>
                <div className="cu-corr-meta">
                  {codes.length} {s.movesCount} · {timeAgo(g.updated_at, lang)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function CorrBoard({
  lang,
  game,
  uid,
  onBack,
  onChanged,
}: {
  lang: Lang;
  game: CorrGame;
  uid: string;
  onBack: () => void;
  onChanged: (updater: (prev: CorrGame[]) => CorrGame[]) => void;
}) {
  const s = STR[lang];
  const [g, setG] = useState(game);
  const [masked, setMasked] = useState<MaskedState | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const appliedMovesRef = useRef<string | null>(null);

  const patchRow = useCallback(
    (row: CorrGame) => {
      setG((prev) => ({ ...row, opponent: prev.opponent }));
      onChanged((prev) =>
        prev.map((x) => (x.id === row.id ? { ...row, opponent: x.opponent } : x))
      );
    },
    [onChanged]
  );

  // Live row updates (opponent moves on another device).
  useEffect(() => {
    setG((prev) => ({ ...game, opponent: prev.opponent }));
  }, [game]);
  useEffect(() => {
    return subscribeCorrGame(game.id, (ng) => {
      setG((prev) => ({ ...ng, opponent: prev.opponent }));
      onChanged((prev) =>
        prev.map((x) => (x.id === ng.id ? { ...ng, opponent: x.opponent } : x))
      );
    });
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Authoritative masked state: on mount + whenever the row changes
  // underneath us (own submissions pre-mark appliedMovesRef).
  useEffect(() => {
    if (appliedMovesRef.current === g.moves && masked) return;
    let cancelled = false;
    fetchMatchMasked(g.id)
      .then((r) => {
        if (cancelled) return;
        appliedMovesRef.current = r.match.moves;
        setMasked(r.masked);
        patchRow(toCorrGame(r.match));
      })
      .catch(() => {
        /* keep last good masked state */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id, g.moves, g.status, g.draw_offer_by]);

  const codes = useMemo(
    () => (g.moves ? g.moves.split(",").filter(Boolean) : []),
    [g.moves]
  );
  const myColor: Color = g.red_id === uid ? "red" : "black";
  const turn: Color = masked?.turn ?? (codes.length % 2 === 0 ? "red" : "black");
  const myTurn = g.status === "active" && turn === myColor && !saving;

  const placeholder = useMemo(
    () => (masked ? maskedToPlaceholderState(masked) : null),
    [masked]
  );
  const viewBoard = useMemo(
    () => (masked ? viewBoardMasked(masked) : null),
    [masked]
  );
  const checkAt = useMemo(() => {
    if (!placeholder) return null;
    return isInCheck(placeholder.board, placeholder.turn)
      ? findGeneral(placeholder.board, placeholder.turn)
      : null;
  }, [placeholder]);
  const lastMove: Move | null = useMemo(() => {
    if (codes.length === 0) return null;
    try {
      return parseUci(codes[codes.length - 1]).move;
    } catch {
      return null;
    }
  }, [codes]);

  const targets = useMemo(() => {
    if (!selected || !myTurn || !placeholder) return [];
    return legalMovesForSquare(placeholder, selected.x, selected.y);
  }, [selected, placeholder, myTurn]);

  const doMove = async (move: Move) => {
    if (!myTurn || saving) return;
    setSaving(true);
    try {
      const r = await submitRoomMove(
        g.id,
        { x: move.fromX, y: move.fromY },
        { x: move.toX, y: move.toY }
      );
      appliedMovesRef.current = r.match.moves;
      setMasked(r.masked);
      patchRow(toCorrGame(r.match));
      if (r.record.captured) playCapture();
      else playMove();
      if (placeholder && r.masked.turn !== myColor) {
        // Opponent to move: check sound if we gave check.
        const nextPh = maskedToPlaceholderState(r.masked);
        if (isInCheck(nextPh.board, nextPh.turn)) playCheck();
      }
      if (r.match.status === "active") {
        notifyPushTrigger({ kind: "corr", gameId: g.id });
      } else {
        notifyPushTrigger({ kind: "corr_end", gameId: g.id });
      }
    } catch {
      /* realtime reconciles */
      appliedMovesRef.current = null;
    } finally {
      setSaving(false);
      setSelected(null);
    }
  };

  const onSquareClick = (x: number, y: number) => {
    if (!myTurn || saving || !masked) return;
    const hit = targets.find((t) => t.toX === x && t.toY === y);
    if (hit) {
      doMove(hit);
      return;
    }
    const piece = masked.board[y]?.[x];
    if (piece && piece.color === myColor) playSelect();
    setSelected(piece && piece.color === myColor ? { x, y } : null);
  };

  const resign = async () => {
    if (g.status !== "active" || !window.confirm(s.roomResignConfirm)) return;
    try {
      const r = await submitRoomAction(g.id, "resign");
      appliedMovesRef.current = r.match.moves;
      setMasked(r.masked);
      patchRow(toCorrGame(r.match));
      notifyPushTrigger({ kind: "corr_end", gameId: g.id });
    } catch {
      /* ignore */
    }
  };

  const drawAction = async (
    action: "draw_offer" | "draw_accept" | "draw_decline"
  ) => {
    try {
      const r = await submitRoomAction(g.id, action);
      appliedMovesRef.current = r.match.moves;
      setMasked(r.masked);
      patchRow(toCorrGame(r.match));
      if (r.match.status === "finished") {
        notifyPushTrigger({ kind: "corr_end", gameId: g.id });
      }
    } catch {
      /* realtime reconciles */
    }
  };

  const revealBoard = useMemo(() => {
    if (g.status !== "finished" || !g.revealed_layout) return null;
    try {
      return viewBoardFromTrueFen(g.revealed_layout.true_fen);
    } catch {
      return null;
    }
  }, [g.status, g.revealed_layout]);
  const commitmentOk = useMemo(() => {
    if (g.status !== "finished" || !g.revealed_seed) return null;
    try {
      return verifyCommitment(g.revealed_seed, g.commitment);
    } catch {
      return false;
    }
  }, [g.status, g.revealed_seed, g.commitment]);

  const oppColor: Color = myColor === "red" ? "black" : "red";
  void oppColor;
  const drawOfferByOpponent =
    g.status === "active" && g.draw_offer_by && g.draw_offer_by !== uid;

  return (
    <main className="cu-layout">
      <div className="cu-board-area">
        <div className="cu-board-fit">
          {viewBoard ? (
            <Board
              board={viewBoard}
              flipped={myColor === "black"}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              checkAt={checkAt}
              interactive={myTurn && !saving}
              anim={null}
              animTrail
              onSquareClick={onSquareClick}
            />
          ) : (
            <p className="cu-empty-note">{s.loading}</p>
          )}
        </div>
      </div>
      <aside className="cu-panel">
        <div className="cu-room-lobby-head">
          <button type="button" className="cu-btn small" onClick={onBack}>
            ← {s.corrBack}
          </button>
          <h2>✉️ {oppName(g)}</h2>
        </div>
        <div className="cu-status" role="status">
          {g.status === "finished"
            ? g.result === "draw"
              ? s.roomDraw
              : g.winner_id === uid
                ? s.wins
                : s.losses
            : myTurn
              ? s.corrYourMove
              : fmt(s.corrOppTurn, { name: oppName(g) })}
        </div>
        {g.status === "active" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="cu-btn" onClick={resign}>
              🏳️ {s.roomResign}
            </button>
            {!g.draw_offer_by && (
              <button
                type="button"
                className="cu-btn"
                onClick={() => drawAction("draw_offer")}
              >
                {s.roomDrawOffer}
              </button>
            )}
            {g.draw_offer_by === uid && (
              <span className="cu-empty-note">{s.roomDrawWaiting}</span>
            )}
            {drawOfferByOpponent && (
              <>
                <span className="cu-empty-note">{s.roomDrawOffered}</span>
                <button
                  type="button"
                  className="cu-btn"
                  onClick={() => drawAction("draw_accept")}
                >
                  {s.roomDrawAccept}
                </button>
                <button
                  type="button"
                  className="cu-btn"
                  onClick={() => drawAction("draw_decline")}
                >
                  {s.roomDrawDecline}
                </button>
              </>
            )}
          </div>
        )}
        {g.status === "finished" && revealBoard && (
          <div style={{ marginTop: 12 }}>
            <h3 className="cu-history-section-title">{s.roomRevealedTitle}</h3>
            {commitmentOk && (
              <p className="cu-empty-note">{s.roomDealVerified}</p>
            )}
            <div className="cu-board-fit">
              <Board
                board={revealBoard}
                flipped={myColor === "black"}
                selected={null}
                targets={[]}
                lastMove={null}
                checkAt={null}
                interactive={false}
                anim={null}
                onSquareClick={() => {}}
              />
            </div>
          </div>
        )}
        <p className="cu-push-hint">
          {s.corrHint}
        </p>
      </aside>
    </main>
  );
}
