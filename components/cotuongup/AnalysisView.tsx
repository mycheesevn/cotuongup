"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, type MoveAnim } from "./Board";
import {
  analyzePly,
  classifyMove,
  decodeMove,
  evalShare,
  formatEval,
  moveText,
  positionAt,
  type ClassifiedMove,
  type PlyAnalysis,
} from "@/lib/jieqi/analysis";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import { commentOnMove } from "@/lib/jieqi/commentary";
import {
  applyMove,
  gameStatus,
  isInCheck,
  toFen,
  viewBoard,
} from "@/lib/jieqi/engine";
import {
  playCapture,
  playCheck,
  playCheckmateFanfare,
  playMove,
  playWin,
} from "@/lib/jieqi/sound";
import { burstConfetti } from "@/lib/jieqi/confetti";
import {
  Color,
  JieqiState,
  Move,
  ViewBoard,
  ViewPiece,
  opposite,
} from "@/lib/jieqi/types";

interface Props {
  lang: Lang;
  moveCodes: string[];
  /** The game's true start state (from its full FEN). */
  startState: JieqiState;
  replayTitle?: string | null;
  onClearReplay?: () => void;
}

const CLS_ICON: Record<string, string> = {
  best: "⭐",
  good: "✓",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/** Identity of the analyzed game: start FEN + move list. */
function gameKey(start: JieqiState, codes: string[]): string {
  const str = toFen(start);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return `${h.toString(36)}:${codes.join(",")}`;
}

/** ViewBoard with every covered piece forced face-up (finished games
 *  only — the end-of-replay "reveal all" curiosity view). */
function revealedView(state: JieqiState): ViewBoard {
  return state.board.map((row) =>
    row.map((p): ViewPiece | null =>
      p
        ? {
            id: p.id,
            color: p.color,
            faceType: p.trueType,
            covered: false,
            hostType: p.fakeType,
          }
        : null
    )
  );
}

/** Animation models for one replayed move from `state`. */
function animFor(state: JieqiState, move: Move) {
  const piece = state.board[move.fromY][move.fromX]!;
  const capTrue = state.board[move.toY][move.toX];
  const { state: next, record } = applyMove(state, move);
  return {
    state: next,
    record,
    pieceView: {
      id: piece.id,
      color: piece.color,
      faceType: piece.trueType,
      covered: false,
      hostType: piece.fakeType,
    } as ViewPiece,
    capturedView: capTrue
      ? ({
          id: capTrue.id,
          color: capTrue.color,
          faceType: capTrue.trueType,
          covered: false,
          hostType: capTrue.fakeType,
        } as ViewPiece)
      : null,
  };
}

export function AnalysisView({
  lang,
  moveCodes,
  startState,
  replayTitle,
  onClearReplay,
}: Props) {
  const s = STR[lang];
  const totalPlies = moveCodes.length;

  const [ply, setPly] = useState(totalPlies);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const [tick, setTick] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playInterval, setPlayInterval] = useState(2000);
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const animId = useRef(0);

  const cacheRef = useRef(new Map<number, PlyAnalysis>());
  const keyRef = useRef("");
  const autoRef = useRef(false);
  const timers = useRef<number[]>([]);
  /** Game key for which the checkmate celebration already fired. */
  const celebratedRef = useRef("");
  const codesRef = useRef(moveCodes);
  codesRef.current = moveCodes;
  const startRef = useRef(startState);
  startRef.current = startState;
  const [revealAllOn, setRevealAllOn] = useState(false);
  const [flipId, setFlipId] = useState<number | null>(null);

  const key = gameKey(startState, moveCodes);

  // New game (or first mount): clear cache, jump to the final position.
  useEffect(() => {
    keyRef.current = key;
    cacheRef.current = new Map();
    autoRef.current = false;
    celebratedRef.current = "";
    setBigShakeKey(0);
    setMateFxKey(0);
    setAutoOn(false);
    setAutoPlay(false);
    setRevealAllOn(false);
    setFlipId(null);
    setAnim(null);
    setAnalyzing(null);
    setPly(moveCodes.length);
    setTick((x) => x + 1);
  }, [key, moveCodes.length]);

  /**
   * Fire the checkmate celebration (banner is rendered separately):
   * big board shake + gold flash + fanfare + confetti, once per game.
   * Mirrors the live-match checkmate drama in RoomMatchView.
   */
  const [bigShakeKey, setBigShakeKey] = useState(0);
  const [mateFxKey, setMateFxKey] = useState(0);
  const celebrateMate = useCallback(() => {
    const codes = codesRef.current;
    const sb = startRef.current;
    const gk = gameKey(sb, codes);
    if (celebratedRef.current === gk || codes.length === 0) return;
    const nb = positionAt(codes, codes.length, sb);
    const end = gameStatus(nb);
    if (!end.over || !end.inCheck) return;
    celebratedRef.current = gk;
    setBigShakeKey((k) => k + 1);
    setMateFxKey((k) => k + 1);
    timers.current.push(window.setTimeout(() => setMateFxKey(0), 1300));
    timers.current.push(
      window.setTimeout(() => {
        playCheckmateFanfare();
        burstConfetti();
      }, 600)
    );
  }, []);

  useEffect(
    () => () => {
      autoRef.current = false;
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const analyzeOne = useCallback((p: number) => {
    // Analyze the current ply and the previous one: both are needed for
    // move classification and per-move commentary.
    const targets = p > 0 ? [p, p - 1] : [p];
    for (const q of targets) {
      if (cacheRef.current.has(q)) continue;
      setAnalyzing(q);
      timers.current.push(
        window.setTimeout(() => {
          const codes = codesRef.current;
          const sb = startRef.current;
          if (keyRef.current !== gameKey(sb, codes)) return;
          if (cacheRef.current.has(q)) return;
          cacheRef.current.set(q, analyzePly(codes, q, sb));
          setAnalyzing((a) => (a === q ? null : a));
          setTick((x) => x + 1);
        }, 60)
      );
    }
  }, []);

  useEffect(() => {
    if (totalPlies > 0) analyzeOne(ply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, totalPlies]);

  const analyzeAll = useCallback(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    setAutoOn(true);
    let p = 0;
    const step = () => {
      if (!autoRef.current) return;
      const codes = codesRef.current;
      const sb = startRef.current;
      if (keyRef.current !== gameKey(sb, codes)) {
        autoRef.current = false;
        setAutoOn(false);
        return;
      }
      if (p > codes.length) {
        autoRef.current = false;
        setAutoOn(false);
        return;
      }
      if (!cacheRef.current.has(p)) {
        cacheRef.current.set(p, analyzePly(codes, p, sb));
        setTick((x) => x + 1);
      }
      p++;
      timers.current.push(window.setTimeout(step, 30));
    };
    step();
  }, []);

  const stopAuto = useCallback(() => {
    autoRef.current = false;
    setAutoOn(false);
  }, []);

  const stopPlay = useCallback(() => {
    setAutoPlay(false);
  }, []);

  const startPlay = useCallback(() => {
    if (totalPlies === 0) return;
    setAnim(null);
    if (ply >= totalPlies) setPly(0);
    setAutoPlay(true);
  }, [ply, totalPlies]);

  // Auto-play: advance one ply per interval with a slow glide animation.
  useEffect(() => {
    if (!autoPlay) return;
    if (ply >= totalPlies) {
      setAutoPlay(false);
      return;
    }
    const t = window.setTimeout(() => {
      const codes = codesRef.current;
      const sb = startRef.current;
      if (ply >= codes.length) {
        setAutoPlay(false);
        return;
      }
      const move = decodeMove(codes[ply]);
      const b = positionAt(codes, ply, sb);
      const piece = b.board[move.fromY]?.[move.fromX];
      if (piece) {
        const applied = animFor(b, move);
        const captured = applied.capturedView;
        animId.current += 1;
        setAnim({
          id: animId.current,
          move,
          piece: applied.pieceView,
          captured,
        });
        setFlipId(applied.record.flipped ? piece.id : null);
        timers.current.push(window.setTimeout(() => setAnim(null), 1400));
        // Sound effects, like a real game.
        if (captured) playCapture();
        else playMove();
        const foe = opposite(b.turn);
        if (isInCheck(applied.state.board, foe)) {
          timers.current.push(window.setTimeout(() => playCheck(), 1150));
        }
        const end = gameStatus(applied.state);
        if (end.over && ply + 1 >= codes.length) {
          if (end.inCheck) {
            celebrateMate();
          } else {
            timers.current.push(
              window.setTimeout(() => playWin(), 1350)
            );
          }
        }
      }
      setPly(ply + 1);
    }, playInterval);
    return () => window.clearTimeout(t);
  }, [autoPlay, ply, playInterval, totalPlies]);

  const board = useMemo(
    () => positionAt(moveCodes, ply, startState),
    [moveCodes, ply, startState]
  );
  const turn: Color = board.turn;
  const endStatus = useMemo(() => gameStatus(board), [board]);
  const hasCovered = useMemo(
    () => board.board.some((row) => row.some((pc) => pc?.covered)),
    [board]
  );
  const displayView = useMemo(
    () =>
      revealAllOn && ply >= totalPlies
        ? revealedView(board)
        : viewBoard(board),
    [revealAllOn, ply, totalPlies, board]
  );
  const cur = cacheRef.current.get(ply);
  const analyzedCount = cacheRef.current.size;

  const classified: Array<ClassifiedMove | null> = useMemo(() => {
    const cache = cacheRef.current;
    return moveCodes.map((code, i) => {
      const before = cache.get(i);
      const after = cache.get(i + 1);
      if (!before || !after) return null;
      return classifyMove(before, after, decodeMove(code));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveCodes, tick]);

  const comment = useMemo(() => {
    if (ply === 0) return null;
    const cache = cacheRef.current;
    const before = cache.get(ply - 1);
    const after = cache.get(ply);
    if (!before || !after) return null;
    return commentOnMove({
      lang,
      ply,
      codes: moveCodes,
      before,
      after,
      startState,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveCodes, ply, tick, lang, startState]);

  const goPly = useCallback(
    (p: number) => {
      stopAuto();
      setAutoPlay(false);
      const target = Math.max(0, Math.min(totalPlies, p));
      const codes = codesRef.current;
      const sb = startRef.current;
      if (Math.abs(target - ply) === 1) {
        // Single step: smooth glide animation + move sound, like auto-play.
        const move = decodeMove(codes[Math.min(ply, target)]);
        const b = positionAt(codes, Math.min(ply, target), sb);
        const piece = b.board[move.fromY]?.[move.fromX];
        if (piece) {
          const applied = animFor(b, move);
          animId.current += 1;
          setAnim({
            id: animId.current,
            move,
            piece: applied.pieceView,
            captured: applied.capturedView,
          });
          setFlipId(
            target > ply && applied.record.flipped ? piece.id : null
          );
          timers.current.push(window.setTimeout(() => setAnim(null), 1000));
          if (applied.capturedView) playCapture();
          else playMove();
          if (target > ply) {
            const foe = opposite(b.turn);
            if (isInCheck(applied.state.board, foe)) playCheck();
          }
        }
      } else {
        setAnim(null);
        setFlipId(null);
      }
      setPly(target);
      // Landing on the final ply of a checkmated game: celebrate.
      if (target === totalPlies && totalPlies > 0) celebrateMate();
    },
    [stopAuto, totalPlies, ply, celebrateMate]
  );

  if (totalPlies === 0) {
    return (
      <main className="cu-layout">
        <div className="cu-board-area">
          <p className="cu-empty-note">{s.noGameToAnalyze}</p>
        </div>
      </main>
    );
  }

  const curEvalRed = cur ? cur.score * (turn === "red" ? 1 : -1) : null;
  const gameEnded = cur !== undefined && cur !== null && cur.bestMove === null;
  // The replayed position's own status is authoritative for the result
  // (checkmate AND stalemate carry a winner in Jieqi; draw-120 doesn't).
  const winner: Color | null = endStatus.over
    ? endStatus.winner
    : gameEnded
      ? opposite(turn)
      : null;
  const endedInCheck = endStatus.reason === "checkmate";

  const rows: number[] = [];
  for (let i = 0; i < totalPlies; i += 2) rows.push(i);

  const renderCell = (i: number) => {
    if (i >= totalPlies) return <span className="cu-movecell empty" />;
    const b = positionAt(moveCodes, i, startState);
    const c = classified[i];
    return (
      <button
        type="button"
        className={`cu-movecell ${ply === i + 1 ? "active" : ""}`}
        onClick={() => goPly(i + 1)}
      >
        <span className="cu-movenum">{Math.floor(i / 2) + 1}.</span>
        {c && (
          <span className={`cu-cls cu-cls-${c.cls}`} title={{ best: s.moveClassBest, good: s.moveClassGood, inaccuracy: s.moveClassInaccuracy, mistake: s.moveClassMistake, blunder: s.moveClassBlunder }[c.cls]}>
            {CLS_ICON[c.cls]}
          </span>
        )}
        <span className="cu-movetext">{moveText(b, decodeMove(moveCodes[i]), lang)}</span>
        {c && <span className="cu-moveeval">{formatEval(c.evalAfterRed)}</span>}
      </button>
    );
  };

  return (
    <main className="cu-layout">
      <div className="cu-board-area">
        <div className={`cu-board-fit${bigShakeKey > 0 ? " shake-big" : ""}`}>
          <Board
            board={displayView}
            flipped={false}
            flippingId={flipId}
            selected={null}
            targets={[]}
            lastMove={cur?.bestMove ?? null}
            checkAt={null}
            interactive={false}
            anim={anim}
            animSlow
            animTrail
            onSquareClick={() => {}}
          />
          {mateFxKey > 0 && <div key={mateFxKey} className="cu-mate-flash" />}
          {gameEnded && endedInCheck && (
            <div className="cu-check-banner cu-mate-banner cu-mate-stay">
              <span>♚ {s.checkmateBanner}</span>
            </div>
          )}
        </div>
      </div>

      <aside className="cu-panel">
        {replayTitle && (
          <section>
            <div className="cu-captured-row">
              <span className="cu-captured-label">📼 {replayTitle}</span>
              {onClearReplay && (
                <button
                  type="button"
                  className="cu-btn small"
                  onClick={onClearReplay}
                >
                  {s.replayBack}
                </button>
              )}
            </div>
          </section>
        )}
        <section>
          <h2>{s.evaluation}</h2>
          <div className="cu-evalbar" aria-hidden="true">
            <div
              className="cu-evalbar-fill"
              style={{ width: `${(curEvalRed === null ? 0.5 : evalShare(curEvalRed)) * 100}%` }}
            />
          </div>
          <div className="cu-captured-row">
            <span className="cu-captured-label">
              {analyzing !== null ? s.analyzing : fmt(s.toMove, { color: turn === "red" ? s.redName : s.blackName })}
            </span>
            <span className="cu-stats">
              {curEvalRed === null ? "…" : formatEval(curEvalRed)}
            </span>
          </div>
          {gameEnded && winner && (
            <div className="cu-captured-row">
              <span className="cu-captured-label">
                {fmt(endedInCheck ? s.checkmate : s.stalemate, {
                  name: winner === "red" ? s.redName : s.blackName,
                })}
              </span>
            </div>
          )}
          {endStatus.over && endStatus.reason === "draw-120" && (
            <div className="cu-captured-row">
              <span className="cu-captured-label">{s.draw120}</span>
            </div>
          )}
          <div className="cu-captured-row">
            <span className="cu-captured-label">{s.bestMoveLabel}</span>
            <span className="cu-stats">
              {cur?.bestMove ? moveText(board, cur.bestMove, lang) : "—"}
            </span>
          </div>
        </section>

        <section>
          <h2>💬 {s.commentary}</h2>
          {comment ? (
            <div className={`cu-comment cu-comment-${comment.cls}`}>
              <div className="cu-comment-head">{comment.headline}</div>
              {comment.details.map((d, i) => (
                <div key={i} className="cu-comment-detail">
                  {d}
                </div>
              ))}
            </div>
          ) : (
            <p className="cu-empty-note">
              {ply === 0 ? s.commentaryStart : s.analyzing}
            </p>
          )}
        </section>

        <section>
          <div className="cu-navbtns">
            <button type="button" className="cu-btn" onClick={() => goPly(0)} title={s.navFirst}>⏮</button>
            <button type="button" className="cu-btn" onClick={() => goPly(ply - 1)} title={s.navPrev}>◀</button>
            <button type="button" className="cu-btn" onClick={() => goPly(ply + 1)} title={s.navNext}>▶</button>
            <button type="button" className="cu-btn" onClick={() => goPly(totalPlies)} title={s.navLast}>⏭</button>
          </div>
          {ply >= totalPlies && hasCovered && (
            <div className="cu-buttons" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="cu-btn"
                aria-pressed={revealAllOn}
                onClick={() => setRevealAllOn((v) => !v)}
              >
                🃏 {s.revealAll}
              </button>
            </div>
          )}
          <div className="cu-buttons" style={{ marginTop: 8 }}>
            {!autoOn ? (
              <button type="button" className="cu-btn" onClick={analyzeAll}>
                {s.analyzeAll}
              </button>
            ) : (
              <button type="button" className="cu-btn" onClick={stopAuto}>
                {s.stopAnalysis} ({analyzedCount}/{totalPlies + 1})
              </button>
            )}
          </div>
          <div className="cu-buttons" style={{ marginTop: 8 }}>
            {!autoPlay ? (
              <button type="button" className="cu-btn" onClick={startPlay}>
                ▶️ {s.autoPlay}
              </button>
            ) : (
              <button type="button" className="cu-btn" onClick={stopPlay}>
                ⏸ {s.autoPause}
              </button>
            )}
            <select
              className="cu-select"
              value={playInterval}
              onChange={(e) => setPlayInterval(Number(e.target.value))}
              title={s.playSpeed}
              aria-label={s.playSpeed}
            >
              <option value={1000}>{fmt(s.playSpeedSec, { n: 1 })}</option>
              <option value={2000}>{fmt(s.playSpeedSec, { n: 2 })}</option>
              <option value={3000}>{fmt(s.playSpeedSec, { n: 3 })}</option>
              <option value={5000}>{fmt(s.playSpeedSec, { n: 5 })}</option>
            </select>
          </div>
          {autoOn && (
            <div className="cu-progress">
              <div
                className="cu-progress-fill"
                style={{ width: `${(analyzedCount / (totalPlies + 1)) * 100}%` }}
              />
            </div>
          )}
        </section>

        <section className="cu-moves">
          <h2>{s.moves}</h2>
          <div className="cu-movelist">
            {rows.map((i) => (
              <div className="cu-moverow" key={i}>
                {renderCell(i)}
                {renderCell(i + 1)}
              </div>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}
