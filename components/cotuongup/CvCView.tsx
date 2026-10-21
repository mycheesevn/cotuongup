import { useEffect, useMemo, useRef, useState } from "react";
import { Board, type MoveAnim } from "./Board";
import {
  applyMove,
  effectiveType,
  findKing,
  gameStatus,
  moveToUci,
  viewBoard,
} from "@/lib/jieqi/engine";
import { findBestMove } from "@/lib/jieqi/ai";
import { moveEntryText } from "@/lib/jieqi/notation";
import { burstConfetti } from "@/lib/jieqi/confetti";
import {
  playCapture,
  playCheck,
  playMove,
  playWin,
} from "@/lib/jieqi/sound";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import { useAuth } from "@/lib/supabase/AuthContext";
import { saveCvcGame } from "@/lib/supabase/games";
import type {
  JieqiState,
  Level,
  Move,
  ViewPiece,
} from "@/lib/jieqi/types";

interface Props {
  lang: Lang;
  startState: JieqiState;
  /** Both engines play at this level (the setup form's level). */
  level: Level;
  onExit: () => void;
}

const SPEEDS = [0.5, 1, 2];
/** Safety cap: an endless shuffle ends as a draw. */
const MAX_PLIES = 300;

/**
 * Computer vs Computer: both engines play the arranged position at
 * the setup form's level so users can watch a position solve itself.
 * Pure spectator mode — no stats/XP — but the finished game is saved
 * to History (player_color 'cvc') for replay and video export.
 */
export function CvCView({ lang, startState, level, onExit }: Props) {
  const s = STR[lang];
  const { user } = useAuth();
  const [state, setState] = useState<JieqiState>(startState);
  const turn = state.turn;
  const view = useMemo(() => viewBoard(state), [state]);
  const [entries, setEntries] = useState<string[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const [playing, setPlaying] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [capped, setCapped] = useState(false);
  const [flippingId, setFlippingId] = useState<number | null>(null);
  const animId = useRef(0);
  // Position-occurrence counts for the engines' repetition steering.
  // Repetition steering reads the state's own masked key history.
  const seenRef = useRef<Map<string, number> | null>(null);
  if (seenRef.current === null) {
    seenRef.current = new Map();
    for (const k of startState.maskedKeyHistory)
      seenRef.current.set(k, (seenRef.current.get(k) ?? 0) + 1);
  }
  const listRef = useRef<HTMLDivElement | null>(null);

  const status = useMemo(() => gameStatus(state), [state]);
  const over = status.over || capped;
  const checkAt = status.inCheck ? findKing(state.board, turn) : null;

  // Engine loop: one ply per tick, paced by the speed control.
  useEffect(() => {
    if (!playing || over) return;
    let cancelled = false;
    const delay = 550 / speed;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setThinking(true);
      // Let the "thinking" state paint before the synchronous search.
      window.setTimeout(() => {
        if (cancelled) return;
        const { move } = findBestMove(state, level, seenRef.current ?? undefined);
        setThinking(false);
        if (!move) return;
        const piece = state.board[move.fromY][move.fromX];
        if (!piece) return;
        const capturedTrue = state.board[move.toY][move.toX];
        const { state: next, record } = applyMove(state, move);
        {
          const m = seenRef.current;
          if (m)
            for (const k of next.maskedKeyHistory.slice(-1))
              m.set(k, (m.get(k) ?? 0) + 1);
        }
        const st = gameStatus(next);
        const pieceView: ViewPiece = {
          id: piece.id,
          color: piece.color,
          faceType: piece.trueType,
          covered: false,
          hostType: piece.fakeType,
        };
        const capturedView: ViewPiece | null = capturedTrue
          ? {
              id: capturedTrue.id,
              color: capturedTrue.color,
              faceType: capturedTrue.trueType,
              covered: false,
              hostType: capturedTrue.fakeType,
            }
          : null;
        setState(next);
        setLastMove(move);
        setFlippingId(record.flipped ? piece.id : null);
        setAnim({
          id: ++animId.current,
          move,
          piece: pieceView,
          captured: capturedView,
        });
        window.setTimeout(() => setAnim(null), 430);
        setEntries((prev) => [
          ...prev,
          moveEntryText(turn, effectiveType(piece), move, lang, record),
        ]);
        setCodes((prev) => {
          const nextCodes = [...prev, moveToUci(move, record.revealedType)];
          if (nextCodes.length >= MAX_PLIES) setCapped(true);
          return nextCodes;
        });
        if (capturedView) playCapture();
        else playMove();
        if (st.over) {
          playWin();
        } else if (st.inCheck) {
          window.setTimeout(() => playCheck(), 120);
        }
      }, 30);
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [playing, over, state, level, lang, speed]);

  // Keep the latest move visible.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  // Save the finished game to History once (signed-in users only).
  const savedRef = useRef(false);
  useEffect(() => {
    if (!over || savedRef.current || !user || codes.length === 0) return;
    savedRef.current = true;
    saveCvcGame({
      moveCodes: codes,
      startState,
      winner: status.over ? status.winner : null,
      level,
    }).catch(() => {});
  }, [over, status, user, codes, startState, level]);

  // Celebrate a decisive finish once.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (!status.over || celebratedRef.current) return;
    celebratedRef.current = true;
    burstConfetti({ count: 130 });
    window.setTimeout(
      () => burstConfetti({ count: 70 }),
      280
    );
  }, [status.over]);

  const restart = () => {
    celebratedRef.current = false;
    savedRef.current = false;
    seenRef.current = new Map();
    for (const k of startState.maskedKeyHistory)
      seenRef.current.set(k, (seenRef.current.get(k) ?? 0) + 1);
    setState(startState);
    setEntries([]);
    setCodes([]);
    setLastMove(null);
    setAnim(null);
    setFlippingId(null);
    setCapped(false);
    setPlaying(true);
  };

  const resultText = !over
    ? null
    : status.over && status.winner
      ? `${status.winner === "red" ? s.cvcRedWon : s.cvcBlackWon} ${
          status.reason === "checkmate" ? s.cvcReasonMate : s.cvcReasonStalemate
        }`
      : status.reason === "draw-120"
        ? s.draw120
        : `${s.cvcDrawn} · ${s.cvcReasonCap}`;

  const pairs = useMemo(() => {
    const out: { n: number; red?: string; black?: string }[] = [];
    entries.forEach((text, i) => {
      const n = Math.floor(i / 2);
      if (!out[n]) out[n] = { n: n + 1 };
      if (i % 2 === 0) out[n].red = text;
      else out[n].black = text;
    });
    return out;
  }, [entries]);

  return (
    <main className="cu-layout">
      <div className="cu-board-area">
        <div className="cu-board-fit">
          <Board
            board={view}
            flipped={false}
            flippingId={flippingId}
            selected={null}
            targets={[]}
            lastMove={lastMove}
            checkAt={checkAt}
            interactive={false}
            anim={anim}
            onSquareClick={() => {}}
          />
        </div>
      </div>

      <aside className="cu-panel">
        <section>
          <h2>🤖 {s.cvcTitle}</h2>
          <p className="cu-hint">{s.cvcHint}</p>
          <p className="cu-hint" aria-live="polite">
            {s.level} {level} · {s.cvcTurn}:{" "}
            {turn === "red" ? s.redName : s.blackName}
            {thinking && !over ? ` · ${s.cvcThinking}` : ""}
          </p>
          {resultText && <p className="cu-cvc-result">{resultText}</p>}
          <div className="cu-buttons">
            <button
              type="button"
              className="cu-btn"
              onClick={() => setPlaying((p) => !p)}
              disabled={over}
            >
              {playing ? s.cvcPause : s.cvcPlay}
            </button>
            <button type="button" className="cu-btn" onClick={restart}>
              {s.cvcRestart}
            </button>
            <button type="button" className="cu-btn" onClick={onExit}>
              {s.cvcBackToSetup}
            </button>
          </div>
          <label className="cu-field">
            <span>{s.cvcSpeed}</span>
            <span className="cu-seg">
              {SPEEDS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={speed === v ? "active" : ""}
                  onClick={() => setSpeed(v)}
                >
                  {v}×
                </button>
              ))}
            </span>
          </label>
        </section>

        <section>
          <div className="cu-cvc-moves" ref={listRef}>
            {pairs.map((p) => (
              <div key={p.n} className="cu-cvc-move-row">
                <span className="cu-cvc-move-no">{p.n}.</span>
                <span>{p.red ?? ""}</span>
                <span>{p.black ?? ""}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}
