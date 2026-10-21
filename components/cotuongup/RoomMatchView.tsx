"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import {
  findGeneral,
  isInCheck,
  legalMovesForSquare,
  parseUci,
  verifyCommitment,
  type Color,
  type MaskedState,
  type Move,
  type MoveRecord,
  type PieceType,
} from "@/lib/jieqi/core";
import { viewBoardMasked } from "@/lib/jieqi/engine";
import {
  maskedFromPublic,
  maskedMoveLabels,
  maskedToPlaceholderState,
  viewBoardFromTrueFen,
} from "@/lib/rooms/maskedView";
import {
  playApplause,
  playCapture,
  playCheck,
  playCheckmateFanfare,
  playLose,
  playMove,
  playSelect,
  playWin,
  playSadTrombone,
} from "@/lib/jieqi/sound";
import { burstConfetti } from "@/lib/jieqi/confetti";
import { siteOrigin } from "@/lib/jieqi/share";
import { Board, type MoveAnim } from "./Board";
import { RoomComments } from "./RoomComments";
import { RoomChat } from "./RoomChat";
import { RoomVoice } from "./RoomVoice";
import {
  cancelMatch,
  fetchMatchMasked,
  memberName,
  REACTION_EMOJIS,
  requestRematch,
  sendReaction,
  submitRoomAction,
  submitRoomMove,
  type MatchReaction,
  type ReactionEmoji,
  type Room,
  type RoomComment,
  type RoomMatch,
  type RoomMember,
  type RoomMessage,
} from "@/lib/supabase/rooms";
import { PIECE_NAMES_EN, PIECE_NAMES_VI } from "@/lib/jieqi/notation";

// ---------------------------------------------------------------------------
// SERVER-AUTHORITATIVE room match view (ROOMS_SPEC.md).
//
// The client NEVER applies a room move locally and NEVER sees a true
// state: it renders the server's MaskedState, computes display-only move
// targets from public information (lib/rooms/maskedView.ts), submits the
// chosen move to /api/rooms/move, and renders whatever the server
// returns. Opponent moves arrive via the cu_matches realtime row →
// /api/rooms/state refetch.
//
// The Board takes Agent A's ViewBoard directly: `viewBoardMasked(masked)`
// is passed straight into Board's `pieces` prop (covered pieces render
// their brass backs; the flip animation is driven by `flippingId`,
// derived from the public MoveRecord of the last submitted move).
// ---------------------------------------------------------------------------

interface Props {
  lang: Lang;
  userId: string;
  room: Room;
  members: RoomMember[];
  match: RoomMatch;
  comments: RoomComment[];
  /** Latest realtime reaction for the active match (from RoomDetail). */
  liveReaction: MatchReaction | null;
  /** The match row changed authoritatively (own move/action response). */
  onMatchPatched: (m: RoomMatch) => void;
  onComment: (c: RoomComment) => void;
  /** Room-scoped chat stream (member-only; latest 50 + load-more in RoomDetail). */
  messages: RoomMessage[];
  onMessage: (m: RoomMessage) => void;
  onLoadMoreMessages?: () => void;
  hasMoreMessages?: boolean;
  /** Guest (logged-out) spectating: hide write actions, show login teasers.
   *  Guests derive the masked view from public row data (no auth routes). */
  guest?: boolean;
  /** Called when a guest taps a login-gated action. */
  onRequireLogin?: () => void;
  /** Leave the match view and go back to the room lobby. */
  onExit?: () => void;
}

function nameOf(members: RoomMember[], id: string | null, fallback: string) {
  const m = members.find((x) => x.user_id === id);
  return m ? memberName(m.profile, fallback) : fallback;
}

export function RoomMatchView({
  lang,
  userId,
  room,
  members,
  match,
  comments,
  liveReaction,
  onMatchPatched,
  onComment,
  messages,
  onMessage,
  onLoadMoreMessages,
  hasMoreMessages,
  guest,
  onRequireLogin,
  onExit,
}: Props) {
  const s = STR[lang];
  const pieceNames = lang === "vi" ? PIECE_NAMES_VI : PIECE_NAMES_EN;

  const codes = useMemo(
    () => (match.moves ? match.moves.split(",").filter(Boolean) : []),
    [match.moves]
  );
  const myColor: Color | null =
    match.red_id === userId ? "red" : match.black_id === userId ? "black" : null;
  /** The other match player — voice chat peer (players only, never guests). */
  const peerUserId: string | null =
    myColor === "red" ? match.black_id : myColor === "black" ? match.red_id : null;
  const isLeader = room.leader_id === userId;
  const active = match.status === "active";

  // --- Masked state (the ONLY game state this view ever holds) ---
  const [masked, setMasked] = useState<MaskedState | null>(null);
  const [lastRecord, setLastRecord] = useState<MoveRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Moves string the current `masked` corresponds to. */
  const appliedMovesRef = useRef<string | null>(null);
  const maskedRef = useRef<MaskedState | null>(null);
  maskedRef.current = masked;

  // Guest path: derive the masked view from the public row alone.
  const guestMasked = useMemo(
    () =>
      guest ? maskedFromPublic(match.public_fen, match.moves) : null,
    [guest, match.public_fen, match.moves]
  );
  const effMasked = guest ? guestMasked : masked;

  const turn: Color =
    effMasked?.turn ?? (codes.length % 2 === 0 ? "red" : "black");
  const canMove =
    active && !guest && myColor !== null && turn === myColor && !submitting;

  const placeholder = useMemo(
    () => (effMasked ? maskedToPlaceholderState(effMasked) : null),
    [effMasked]
  );
  const viewBoard = useMemo(
    () => (effMasked ? viewBoardMasked(effMasked) : null),
    [effMasked]
  );

  // Authoritative masked fetch: on mount and whenever the row's move
  // list / status changes underneath us (opponent move via realtime,
  // draw offer, finish). Own submissions set appliedMovesRef first, so
  // the echo of our own move does not refetch.
  useEffect(() => {
    if (guest) return;
    if (appliedMovesRef.current === match.moves && maskedRef.current) return;
    let cancelled = false;
    fetchMatchMasked(match.id)
      .then((r) => {
        if (cancelled) return;
        appliedMovesRef.current = r.match.moves;
        setMasked(r.masked);
        onMatchPatched(r.match);
      })
      .catch(() => {
        /* polling in RoomDetail retries; keep last good masked state */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, match.moves, match.status, match.draw_offer_by, guest]);

  // --- Spectator presence (unchanged pattern) ---
  const [spectatorCount, setSpectatorCount] = useState(0);
  useEffect(() => {
    let ch: { unsubscribe: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const { getSupabase } = await import("@/lib/supabase/client");
      const sb = getSupabase();
      if (!sb || cancelled) return;
      const channel = sb.channel(`cu-match-watch:${match.id}`);
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        let n = 0;
        for (const presences of Object.values(state)) n += presences.length;
        setSpectatorCount(n);
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, at: Date.now() });
        }
      });
      ch = { unsubscribe: () => sb.removeChannel(channel) };
    })();
    return () => {
      cancelled = true;
      ch?.unsubscribe();
    };
  }, [match.id, userId]);

  const [selected, setSelected] = useState<{ x: number; y: number } | null>(
    null
  );
  const [xpToast, setXpToast] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [rematching, setRematching] = useState(false);
  const xpTimer = useRef<number | null>(null);
  /** Move animation (glide + trail) for local and remote moves. */
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const animId = useRef(0);
  const animTimer = useRef<number | null>(null);
  /** Checkmate drama: banner + big shake + gold flash, once per match. */
  const [mateBannerKey, setMateBannerKey] = useState(0);
  const [mateFxKey, setMateFxKey] = useState(0);
  const [bigShakeKey, setBigShakeKey] = useState(0);
  const celebratedMateRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (animTimer.current) window.clearTimeout(animTimer.current);
    };
  }, []);

  // Floating reaction emoji over the board (from realtime).
  const [floaters, setFloaters] = useState<
    { id: number; emoji: string; x: number }[]
  >([]);
  const floaterId = useRef(0);
  useEffect(() => {
    if (!liveReaction || liveReaction.match_id !== match.id) return;
    const id = ++floaterId.current;
    const x = 8 + Math.random() * 76; // % across the board
    setFloaters((f) => [...f.slice(-11), { id, emoji: liveReaction.emoji, x }]);
    const t = window.setTimeout(() => {
      setFloaters((f) => f.filter((fl) => fl.id !== id));
    }, 2200);
    return () => window.clearTimeout(t);
  }, [liveReaction, match.id]);

  // Throttled reaction send (max 1 per 1.5s).
  const lastReactRef = useRef(0);
  const react = (emoji: ReactionEmoji) => {
    const now = Date.now();
    if (now - lastReactRef.current < 1500) return;
    lastReactRef.current = now;
    sendReaction(room.id, match.id, emoji).catch(() => {
      /* ignore */
    });
  };

  const showXpToast = (xp: { play_xp: number; host_xp: number; daily_xp: number } | null) => {
    if (!xp) return;
    const total = xp.play_xp + xp.host_xp + xp.daily_xp;
    if (total <= 0) return;
    setXpToast(`🎉 ${s.roomXpEarned(total)}`);
    // Event name kept as-is family-wide (listeners in XiangqiGame /
    // QuestCard still use the legacy string; renaming is a shell task).
    window.dispatchEvent(new CustomEvent("xq:profile-refresh"));
    if (xpTimer.current) window.clearTimeout(xpTimer.current);
    xpTimer.current = window.setTimeout(() => setXpToast(null), 4000);
  };

  const targets = useMemo(
    () =>
      canMove && selected && placeholder
        ? legalMovesForSquare(placeholder, selected.x, selected.y)
        : [],
    [placeholder, selected, canMove]
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

  const moveLabels = useMemo(
    () =>
      effMasked ? maskedMoveLabels(effMasked, match.moves, lang) : [],
    [effMasked, match.moves, lang]
  );

  // Animate + sound a move that just landed in the masked state (own or
  // remote). Compares captured counts / flip info against the previous
  // masked snapshot.
  const prevMaskedRef = useRef<MaskedState | null>(null);
  const prevCodesRef = useRef<string[]>([]);
  useEffect(() => {
    const prevMasked = prevMaskedRef.current;
    const prevCodes = prevCodesRef.current;
    prevMaskedRef.current = effMasked;
    prevCodesRef.current = codes;
    if (!effMasked || !prevMasked || codes.length <= prevCodes.length) return;
    const m = lastMove;
    if (!m) return;
    const beforeVb = viewBoardMasked(prevMasked);
    const moverPiece = beforeVb[m.fromY]?.[m.fromX];
    if (!moverPiece) return;
    const newCap =
      effMasked.captured.length > prevMasked.captured.length
        ? effMasked.captured[effMasked.captured.length - 1]
        : null;
    // MoveAnim carries ViewPieces: the mover is the pre-move ViewPiece
    // itself (covered pieces glide as their brass back; Board's overlay
    // renders it as-is), and a captured piece is public + face-up by
    // ruling 3, so its ViewPiece is a plain revealed disc of its true type.
    const captured = newCap
      ? {
          id: -1,
          color: newCap.color,
          faceType: newCap.trueType,
          covered: false,
          hostType: newCap.trueType,
        }
      : null;
    animId.current += 1;
    setAnim({
      id: animId.current,
      move: m,
      piece: moverPiece,
      captured,
    });
    if (animTimer.current) window.clearTimeout(animTimer.current);
    animTimer.current = window.setTimeout(
      () => setAnim(null),
      captured ? 1200 : 1000
    );
    const mover: Color = (codes.length - 1) % 2 === 0 ? "red" : "black";
    if (mover !== myColor) {
      if (captured) playCapture();
      else playMove();
      if (checkAt) playCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effMasked, codes]);

  // Win/lose jingle when the match finishes (non-checkmate reasons).
  const finishedRef = useRef(false);
  useEffect(() => {
    if (match.status !== "finished" || finishedRef.current) return;
    finishedRef.current = true;
    if (myColor && match.reason !== "checkmate") {
      if (match.winner_id === userId) playWin();
      else if (match.winner_id) playLose();
    }
  }, [match.status, match.reason, match.winner_id, myColor, userId]);

  // Checkmate drama: banner + big board shake + gold flash + applause.
  useEffect(() => {
    if (
      match.status !== "finished" ||
      match.reason !== "checkmate" ||
      celebratedMateRef.current === match.id
    ) {
      return;
    }
    celebratedMateRef.current = match.id;
    setBigShakeKey((k) => k + 1);
    setMateFxKey((k) => k + 1);
    setMateBannerKey((k) => k + 1);
    window.setTimeout(() => setMateFxKey(0), 1300);
    const iWon = match.winner_id === userId;
    if (iWon) {
      window.setTimeout(() => {
        playCheckmateFanfare();
        burstConfetti();
      }, 450);
      window.setTimeout(() => playApplause(), 1700);
    } else if (myColor) {
      window.setTimeout(() => playSadTrombone(), 450);
    } else {
      window.setTimeout(() => playCheckmateFanfare(), 450);
      window.setTimeout(() => playApplause(), 1700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.status, match.reason, match.id]);

  // Clear selection when the turn changes.
  useEffect(() => {
    setSelected(null);
  }, [turn, match.id]);

  const doMove = async (m: Move) => {
    if (!canMove) return;
    setSelected(null);
    setSubmitting(true);
    try {
      const r = await submitRoomMove(
        match.id,
        { x: m.fromX, y: m.fromY },
        { x: m.toX, y: m.toY }
      );
      appliedMovesRef.current = r.match.moves;
      setMasked(r.masked);
      setLastRecord(r.record);
      onMatchPatched(r.match);
      showXpToast(r.xp);
      if (r.record.captured) playCapture();
      else playMove();
      // Flip / capture reveals are PUBLIC — announce them locally too.
      // Best-effort "your turn" push to the opponent (server verifies).
      if (r.match.status === "active") {
        const { notifyPushTrigger } = await import("@/lib/push/client");
        notifyPushTrigger({ kind: "turn", matchId: match.id });
      }
    } catch {
      /* server rejected (raced opponent move / not our turn): the
         realtime row + state refetch reconcile the view */
      appliedMovesRef.current = null;
    } finally {
      setSubmitting(false);
    }
  };

  const onSquareClick = (x: number, y: number) => {
    if (!canMove || !viewBoard) return;
    const piece = viewBoard[y]?.[x];
    if (selected) {
      const mv = targets.find((t) => t.toX === x && t.toY === y);
      if (mv) {
        doMove(mv);
        return;
      }
    }
    if (piece && piece.color === turn) {
      playSelect();
      setSelected(
        selected && selected.x === x && selected.y === y ? null : { x, y }
      );
    } else {
      setSelected(null);
    }
  };

  const resign = async () => {
    if (!myColor || !active || guest) return;
    if (!window.confirm(s.roomResignConfirm)) return;
    try {
      const r = await submitRoomAction(match.id, "resign");
      appliedMovesRef.current = r.match.moves;
      setMasked(r.masked);
      onMatchPatched(r.match);
      showXpToast(r.xp);
    } catch {
      /* ignore */
    }
  };

  const drawAction = async (
    action: "draw_offer" | "draw_accept" | "draw_decline"
  ) => {
    if (!myColor || !active || guest) return;
    try {
      const r = await submitRoomAction(match.id, action);
      appliedMovesRef.current = r.match.moves;
      setMasked(r.masked);
      onMatchPatched(r.match);
      showXpToast(r.xp);
    } catch {
      /* realtime reconciles */
    }
  };

  const shareResult = () => {
    const resultText =
      match.result === "red"
        ? s.roomRedWins
        : match.result === "black"
          ? s.roomBlackWins
          : s.roomDraw;
    const text =
      `🃏 ${redName} ${s.roomVs} ${blackName}: ${resultText}` +
      ` · ${codes.length} ${s.movesCount}` +
      ` · ${s.roomCode}: ${room.code}` +
      ` — ${siteOrigin()}`;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* ignore */
    }
  };

  const cancel = async () => {
    if (!isLeader || !active) return;
    if (!window.confirm(s.roomMatchCancelled)) return;
    try {
      await cancelMatch(match.id);
    } catch {
      /* ignore */
    }
  };

  const redName = nameOf(members, match.red_id, "🔴");
  const blackName = nameOf(members, match.black_id, "⚫");
  const turnLabel = !active
    ? ""
    : submitting
      ? s.roomSendingMove
      : myColor && turn === myColor
        ? s.roomYourTurn
        : s.roomTurnOf(turn === "red" ? redName : blackName);

  const reasonText =
    match.reason === "checkmate"
      ? s.roomReasonCheckmate
      : match.reason === "stalemate"
        ? s.roomReasonStalemate
        : match.reason === "resign"
          ? s.roomReasonResign
          : match.reason === "draw-120"
            ? s.roomReasonDraw120
            : match.reason === "draw-agreed"
              ? s.roomDraw
              : "";

  // Flip animation: when the last submitted move's public MoveRecord says
  // the mover flipped, the destination ViewPiece (square-derived id in a
  // masked view) plays Board's flip animation.
  const flippingId =
    lastRecord?.flipped && lastMove && viewBoard
      ? (viewBoard[lastMove.toY]?.[lastMove.toX]?.id ?? null)
      : null;

  // End-of-game reveal: true layout + commitment audit (both PUBLIC now).
  const revealBoard = useMemo(() => {
    if (match.status !== "finished" || !match.revealed_layout) return null;
    try {
      return viewBoardFromTrueFen(match.revealed_layout.true_fen);
    } catch {
      return null;
    }
  }, [match.status, match.revealed_layout]);
  const commitmentOk = useMemo(() => {
    if (match.status !== "finished" || !match.revealed_seed) return null;
    try {
      return verifyCommitment(match.revealed_seed, match.commitment);
    } catch {
      return false;
    }
  }, [match.status, match.revealed_seed, match.commitment]);

  const drawOfferByOpponent =
    active && match.draw_offer_by && match.draw_offer_by !== userId
      ? match.draw_offer_by
      : null;
  const drawOfferMine =
    active && match.draw_offer_by === userId && userId !== "";

  return (
    <div className="cu-layout">
      <div className="cu-board-area">
        <div className="cu-room-board-wrap">
          <div className="cu-room-vs">
            <span className={turn === "red" && active ? "cu-room-turn" : ""}>
              🔴 {redName}
              {match.red_id === userId ? ` (${s.you ?? ""})` : ""}
            </span>
            <span className="cu-room-vs-mid">{s.roomVs}</span>
            <span className={turn === "black" && active ? "cu-room-turn" : ""}>
              ⚫ {blackName}
              {match.black_id === userId ? ` (${s.you ?? ""})` : ""}
            </span>
          </div>
          {turnLabel && (
            <div className="cu-room-turn-label" aria-live="polite">
              {turnLabel}
            </div>
          )}
          {lastRecord?.flipped && lastRecord.revealedType && (
            <div className="cu-room-turn-label" aria-live="polite">
              🃏 {s.roomFlipped(pieceNames[lastRecord.revealedType])}
            </div>
          )}
          {lastRecord?.captured?.wasCovered && (
            <div className="cu-room-turn-label" aria-live="polite">
              💥 {s.roomCapturedDark(pieceNames[lastRecord.captured.trueType])}
            </div>
          )}
          {myColor === null && active && (
            <div className="cu-room-spectate-badge">
              👁 {s.roomSpectating}
              {spectatorCount > 0 && ` · ${s.roomWatchers(spectatorCount)}`}
            </div>
          )}
          {myColor !== null && spectatorCount > 2 && (
            <div className="cu-room-spectate-badge">
              👁 {s.roomWatchers(spectatorCount - 2)}
            </div>
          )}
          {match.status === "finished" && (
            <div className="cu-room-result" aria-live="polite">
              <span>
                {match.result === "red"
                  ? s.roomRedWins
                  : match.result === "black"
                    ? s.roomBlackWins
                    : s.roomDraw}
                {reasonText ? ` · ${reasonText}` : ""}
              </span>
              <button
                type="button"
                className="cu-btn small"
                onClick={shareResult}
                title={s.roomShare}
              >
                📤 {shared ? s.roomShared : s.roomShare}
              </button>
              {onExit && (
                <button
                  type="button"
                  className="cu-btn small"
                  onClick={onExit}
                >
                  ← {s.roomBackToRoom}
                </button>
              )}
              {myColor !== null && !guest && (
                <button
                  type="button"
                  className="cu-btn small primary"
                  disabled={rematching}
                  onClick={async () => {
                    setRematching(true);
                    try {
                      await requestRematch(room.id, match.id);
                    } catch {
                      /* realtime will show the new match if it succeeded */
                    } finally {
                      setRematching(false);
                    }
                  }}
                >
                  🔄 {s.roomRematch}
                </button>
              )}
            </div>
          )}
          {xpToast && (
            <div className="cu-room-xp-toast" aria-live="polite">
              {xpToast}
            </div>
          )}
          {match.status === "cancelled" && (
            <div className="cu-room-result">
              {s.roomMatchCancelled}
              {onExit && (
                <button
                  type="button"
                  className="cu-btn small"
                  onClick={onExit}
                >
                  ← {s.roomBackToRoom}
                </button>
              )}
            </div>
          )}
          <div
            key={`room-board-${bigShakeKey}`}
            className={`cu-board-fit cu-room-board-fit${bigShakeKey > 0 ? " shake-big" : ""}`}
          >
            {viewBoard ? (
              <Board
                board={viewBoard}
                flipped={myColor === "black"}
                selected={selected}
                targets={targets}
                lastMove={lastMove}
                checkAt={checkAt}
                interactive={canMove && !anim}
                anim={anim}
                animTrail
                flippingId={flippingId}
                onSquareClick={onSquareClick}
              />
            ) : (
              <p className="cu-empty-note">{s.loading}</p>
            )}
            {mateBannerKey > 0 && (
              <div
                key={mateBannerKey}
                className="cu-check-banner cu-mate-banner"
                onAnimationEnd={() => setMateBannerKey(0)}
              >
                <span>♚ {s.checkmateBanner}</span>
              </div>
            )}
            {mateFxKey > 0 && (
              <div key={mateFxKey} className="cu-mate-flash" />
            )}
            {floaters.map((f) => (
              <span
                key={f.id}
                className="cu-reaction-float"
                style={{ left: `${f.x}%` }}
                aria-hidden="true"
              >
                {f.emoji}
              </span>
            ))}
          </div>
          <div className="cu-room-match-actions">
            {active && !guest && (
              <div className="cu-reaction-bar" role="group" aria-label={s.roomReact}>
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="cu-reaction-btn"
                    onClick={() => react(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {active && guest && onRequireLogin && (
              <button
                type="button"
                className="cu-btn small"
                onClick={onRequireLogin}
              >
                👏🔥 {s.guestReactTeaser}
              </button>
            )}
            {myColor && active && !guest && (
              <>
                <button
                  type="button"
                  className="cu-btn small danger"
                  onClick={resign}
                >
                  🏳 {s.roomResign}
                </button>
                {!match.draw_offer_by && (
                  <button
                    type="button"
                    className="cu-btn small"
                    onClick={() => drawAction("draw_offer")}
                  >
                    {s.roomDrawOffer}
                  </button>
                )}
                {drawOfferMine && (
                  <span className="cu-empty-note">{s.roomDrawWaiting}</span>
                )}
                {drawOfferByOpponent && (
                  <>
                    <span className="cu-empty-note">
                      {s.roomDrawOfferedBy(
                        drawOfferByOpponent === match.red_id
                          ? redName
                          : blackName
                      )}
                    </span>
                    <button
                      type="button"
                      className="cu-btn small primary"
                      onClick={() => drawAction("draw_accept")}
                    >
                      {s.roomDrawAccept}
                    </button>
                    <button
                      type="button"
                      className="cu-btn small"
                      onClick={() => drawAction("draw_decline")}
                    >
                      {s.roomDrawDecline}
                    </button>
                  </>
                )}
              </>
            )}
            {isLeader && active && (
              <button type="button" className="cu-btn small" onClick={cancel}>
                ✕ {s.roomCancelMatch}
              </button>
            )}
            {!myColor && active && (
              <span className="cu-empty-note">{s.roomSpectating}</span>
            )}
            {myColor && active && turn !== myColor && (
              <span className="cu-empty-note">{s.roomWaiting}</span>
            )}
          </div>
          {match.status === "finished" && revealBoard && (
            <div style={{ marginTop: 12 }}>
              <h3 className="cu-history-section-title">{s.roomRevealedTitle}</h3>
              {commitmentOk !== null && (
                <p className="cu-empty-note" aria-live="polite">
                  {commitmentOk ? s.roomDealVerified : s.roomDealVerifyFailed}
                </p>
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
        </div>
      </div>
      <aside className="cu-panel cu-room-side">
        {/* Aside order (user ruling): live comms first, public comments last:
            1. RoomVoice (player or listener mode), 2. RoomChat (private room
            text chat), 3. move list, 4. RoomComments (public per-move). */}
        {myColor !== null && !guest && peerUserId && (
          <RoomVoice
            lang={lang}
            roomId={room.id}
            myUserId={userId}
            peerUserId={peerUserId}
            mode="player"
          />
        )}
        {myColor === null && !guest && (
          <RoomVoice
            lang={lang}
            roomId={room.id}
            myUserId={userId}
            peerUserId={null}
            mode="listener"
          />
        )}
        <RoomChat
          lang={lang}
          roomId={room.id}
          messages={messages}
          onPosted={onMessage}
          onLoadMore={onLoadMoreMessages}
          hasMore={hasMoreMessages}
          disabled={match.status === "cancelled" || !!guest}
        />
        {effMasked && effMasked.captured.length > 0 && (
          <p className="cu-empty-note" style={{ marginTop: 12 }}>
            {s.captured}:{" "}
            {effMasked.captured
              .map(
                (c) =>
                  `${c.color === "red" ? "🔴" : "⚫"} ${pieceNames[c.trueType]}${c.wasCovered ? s.roomCoveredSuffix : ""}`
              )
              .join(" · ")}
          </p>
        )}
        {codes.length > 0 && (
          <div className="cu-room-moves" style={{ marginTop: 12 }}>
            {codes.map((c, i) => (
              <span key={i} className="cu-room-move-chip">
                {i + 1}. {moveLabels[i] ?? c}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <RoomComments
            lang={lang}
            roomId={room.id}
            matchId={match.id}
            moveNumber={codes.length}
            comments={comments}
            onPosted={onComment}
            disabled={match.status === "cancelled" || !!guest}
          />
        </div>
        {guest && onRequireLogin && (
          <button
            type="button"
            className="cu-btn small"
            onClick={onRequireLogin}
            style={{ marginTop: 8 }}
          >
            💬 {s.guestCommentTeaser}
          </button>
        )}
      </aside>
    </div>
  );
}
