"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board, type MoveAnim } from "./Board";
import { findBestMove } from "@/lib/jieqi/ai";
import { useAuth } from "@/lib/supabase/AuthContext";
import {
  fetchPuzzleProgress,
  savePuzzleProgress,
} from "@/lib/supabase/progress";
import {
  applyMove,
  findKing,
  gameStatus,
  legalMoves,
  legalMovesForSquare,
  moveToUci,
  viewBoard,
} from "@/lib/jieqi/engine";
import { findMateMove } from "@/lib/jieqi/mate";
import { savePuzzleResult } from "@/lib/supabase/puzzleHistory";
import { syncRewards } from "@/lib/supabase/rewards";
import { bumpGuestStat } from "@/lib/guestStats";
import { canvasToPngFile, renderShareCard } from "@/lib/jieqi/shareCard";
import { shareAchievement } from "@/lib/jieqi/achievementCard";
import { shareLink, shareResultCard } from "@/lib/jieqi/share";
import { getDailyPuzzle, puzzleState, type Puzzle } from "@/lib/jieqi/puzzles";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import {
  playCapture,
  playCheck,
  playCheckmateFanfare,
  playLose,
  playMove,
  playSelect,
} from "@/lib/jieqi/sound";
import {
  Color,
  JieqiState,
  Move,
  ViewPiece,
} from "@/lib/jieqi/types";
import { SignupNudge } from "./SignupNudge";
import { PuzzleRush } from "./PuzzleRush";
import { loadGuestStats } from "@/lib/guestStats";

const PLAYER: Color = "red";
const DEFENDER: Color = "black";
const STREAK_KEY = "cu-puzzle-streak";

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function shiftDay(ds: string, delta: number): string {
  const d = new Date(ds + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return dayStr(d);
}

interface Streak {
  lastSolved: string;
  count: number;
}

function loadStreak(): Streak {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.count === "number" && typeof s.lastSolved === "string")
        return s;
    }
  } catch {
    /* storage unavailable */
  }
  return { lastSolved: "", count: 0 };
}

function markSolved(today: string): Streak {
  const s = loadStreak();
  if (s.lastSolved === today) return s;
  const next: Streak = {
    lastSolved: today,
    count: s.lastSolved === shiftDay(today, -1) ? s.count + 1 : 1,
  };
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

function parseDateStr(d: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export interface CustomPuzzlePlay {
  /** FEN of the position to solve. */
  fen: string;
  movesToMate: number;
  /** Header label, e.g. the creator credit. */
  label: string;
  /** Called on solve instead of the daily flow. */
  onSolved: (movesUsed: number, moveCodes: string[]) => void;
  /** Hide streak / progress UI (creation verify + community). */
  hideMeta?: boolean;
}

export function PuzzleMode({
  lang,
  initialDate,
  custom,
}: {
  lang: Lang;
  initialDate?: string | null;
  custom?: CustomPuzzlePlay;
}) {
  const s = STR[lang];
  const [today] = useState(() => dayStr(new Date()));
  /** The puzzle being displayed — today, or a shared date via ?puzzle=. */
  const [puzzleDate] = useState(() =>
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
      ? initialDate
      : dayStr(new Date())
  );
  const isDaily = !custom && puzzleDate === today;
  const [puzzle] = useState<Puzzle>(() =>
    custom
      ? { id: -2, fen: custom.fen, movesToMate: custom.movesToMate }
      : getDailyPuzzle(parseDateStr(puzzleDate))
  );
  const [state, setState] = useState<JieqiState>(() => puzzleState(puzzle));
  const view = useMemo(() => viewBoard(state), [state]);
  const [movesUsed, setMovesUsed] = useState(0);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<"playing" | "solved" | "failed">("playing");
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [puzzleNudge, setPuzzleNudge] = useState(true); // session-scoped
  const [sharingAch, setSharingAch] = useState(false);

  /** Share the daily solve streak as an achievement card. */
  const shareStreak = async () => {
    if (sharingAch || streak.count < 2) return;
    setSharingAch(true);
    try {
      const outcome = await shareAchievement(
        "streak",
        { title: s.achStreakTitle(streak.count), days: streak.count },
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

  /** Share the solved puzzle as a result-card image + challenge link. */
  const sharePuzzle = async () => {
    if (sharing || status !== "solved") return;
    setSharing(true);
    try {
      const link = await shareLink(`/?puzzle=${puzzleDate}`);
      const title = s.sharePuzzleTitle;
      const canvas = renderShareCard({
        board: viewBoard(state),
        title,
        subtitle: s.sharePuzzleSubtitle(movesUsed),
        footer: s.shareFooter,
      });
      const file = await canvasToPngFile(canvas, "co-up-puzzle.png");
      const outcome = await shareResultCard({
        file,
        fileName: "co-up-puzzle.png",
        title,
        text: `${title}\n${s.sharePuzzleSubtitle(movesUsed)}`,
        url: link,
      });
      setShareToast(outcome === "shared" ? s.shareDone : s.shareDownloaded);
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      /* ignore */
    } finally {
      setSharing(false);
    }
  };
  const [failKind, setFailKind] = useState<"wrong" | "out" | null>(null);
  const [turn, setTurn] = useState<Color>(PLAYER);
  const [checkSide, setCheckSide] = useState<Color | null>(null);
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  const [streak, setStreak] = useState<Streak>(() => loadStreak());
  const [shakeId, setShakeId] = useState(0);
  const { user: authUser } = useAuth();

  // Sync streak with the cloud when logged in (cloud wins on conflict).
  useEffect(() => {
    if (!authUser) return;
    fetchPuzzleProgress().then((cloud) => {
      if (cloud && cloud.lastSolvedDate) {
        setStreak((prev) => {
          const merged: Streak =
            cloud.lastSolvedDate! > prev.lastSolved
              ? { lastSolved: cloud.lastSolvedDate!, count: cloud.streak }
              : prev.lastSolved > cloud.lastSolvedDate!
                ? prev
                : {
                    lastSolved: prev.lastSolved,
                    count: Math.max(prev.count, cloud.streak),
                  };
          try {
            localStorage.setItem(STREAK_KEY, JSON.stringify(merged));
          } catch {
            /* ignore */
          }
          return merged;
        });
      }
    });
  }, [authUser]);

  const boardRef = useRef(state);
  boardRef.current = state;
  const movesUsedRef = useRef(movesUsed);
  movesUsedRef.current = movesUsed;
  /** Move codes of the current attempt, for the history record. */
  const moveCodesRef = useRef<string[]>([]);
  const animId = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const solvedToday = streak.lastSolved === today;

  const targets = useMemo(
    () =>
      selected
        ? legalMovesForSquare(state, selected.x, selected.y)
        : [],
    [state, selected]
  );

  const checkAt = checkSide ? findKing(state.board, checkSide) : null;

  /** Apply a move with slide animation + sound. Returns null when illegal. */
  const animateMove = useCallback(
    (b: JieqiState, move: Move) => {
      const piece = b.board[move.fromY][move.fromX];
      if (!piece) return null;
      const capturedTrue = b.board[move.toY][move.toX];
      const { state: nb, record } = applyMove(b, move);
      moveCodesRef.current.push(moveToUci(move, record.revealedType));
      const pieceView: ViewPiece = {
        id: piece.id,
        color: piece.color,
        faceType: piece.trueType,
        covered: false,
        hostType: piece.fakeType,
      };
      const captured: ViewPiece | null = capturedTrue
        ? {
            id: capturedTrue.id,
            color: capturedTrue.color,
            faceType: capturedTrue.trueType,
            covered: false,
            hostType: capturedTrue.fakeType,
          }
        : null;
      setState(nb);
      setSelected(null);
      setHintMove(null);
      animId.current += 1;
      setAnim({ id: animId.current, move, piece: pieceView, captured });
      if (captured) {
        setShakeId((i) => i + 1);
        later(() => playCapture(), 480);
        later(() => setAnim(null), 1200);
      } else {
        later(() => playMove(), 560);
        later(() => setAnim(null), 1000);
      }
      return { nb, captured: captured !== null, record };
    },
    [later]
  );

  const solvePuzzle = useCallback(
    (captured: boolean) => {
      setStatus("solved");
      if (custom) {
        custom.onSolved(movesUsedRef.current, [...moveCodesRef.current]);
        later(() => playCheckmateFanfare(), captured ? 750 : 500);
        return;
      }
      // Streaks only advance for the actual daily puzzle, not shared ones.
      if (isDaily) {
        const next = markSolved(today);
        setStreak(next);
        if (authUser) savePuzzleProgress(next.count, next.lastSolved);
      }
      if (authUser) {
        savePuzzleResult({
          puzzleDate,
          puzzleId: puzzle.id,
          solved: true,
          moveCodes: moveCodesRef.current,
        }).then(() => {
          syncRewards();
          window.dispatchEvent(new CustomEvent("xq:quest-refresh"));
        });
      } else {
        bumpGuestStat("puzzles");
      }
      later(() => playCheckmateFanfare(), captured ? 750 : 500);
    },
    [later, today, isDaily, puzzleDate, authUser, puzzle.id, custom]
  );

  const failPuzzle = useCallback(
    (kind: "wrong" | "out") => {
      setStatus("failed");
      setFailKind(kind);
      if (!custom && authUser) {
        savePuzzleResult({
          puzzleDate,
          puzzleId: puzzle.id,
          solved: false,
          moveCodes: moveCodesRef.current,
        }).then(() => syncRewards());
      }
      later(() => playLose(), 400);
    },
    [later, puzzleDate, authUser, puzzle.id, custom]
  );

  const onPlayerMove = useCallback(
    (move: Move) => {
      const b = boardRef.current;
      const res = animateMove(b, move);
      if (!res) return;
      const { nb, captured } = res;
      const used = movesUsedRef.current + 1;
      setMovesUsed(used);
      setTurn(DEFENDER);
      const st = gameStatus(nb);
      setCheckSide(st.inCheck ? DEFENDER : null);
      if (st.over) {
        // Defender has no legal moves: player wins.
        solvePuzzle(captured);
        return;
      }
      if (used >= puzzle.movesToMate) {
        failPuzzle("out");
        return;
      }
      // Fail fast when the move breaks the forced mate; otherwise the
      // defender replies with its best defense.
      const remaining = Math.max(1, puzzle.movesToMate - used);
      let keepsMate = true;
      for (const r of legalMoves(nb)) {
        if (!findMateMove(applyMove(nb, r).state, remaining)) {
          keepsMate = false;
          break;
        }
      }
      if (!keepsMate) {
        failPuzzle("wrong");
        return;
      }
      if (st.inCheck) later(() => playCheck(), 560);
      setThinking(true);
      later(() => {
        const bb = boardRef.current;
        const { move: dm } = findBestMove(bb, 9);
        setThinking(false);
        if (!dm) {
          solvePuzzle(false);
          return;
        }
        const res2 = animateMove(bb, dm);
        if (!res2) return;
        const st2 = gameStatus(res2.nb);
        setCheckSide(st2.inCheck ? PLAYER : null);
        setTurn(PLAYER);
        if (st2.over) {
          if (st2.winner === PLAYER) solvePuzzle(res2.captured);
          else failPuzzle("wrong");
        }
      }, 650);
    },
    [animateMove, failPuzzle, later, puzzle.movesToMate, solvePuzzle]
  );

  const onSquareClick = useCallback(
    (x: number, y: number) => {
      if (status !== "playing" || thinking || anim || turn !== PLAYER) return;
      const hit = targets.find((t) => t.toX === x && t.toY === y);
      if (hit) {
        onPlayerMove(hit);
        return;
      }
      const piece = state.board[y][x];
      if (piece && piece.color === PLAYER) playSelect();
      setSelected(piece && piece.color === PLAYER ? { x, y } : null);
    },
    [status, thinking, anim, turn, targets, state, onPlayerMove]
  );

  const onHint = useCallback(() => {
    if (status !== "playing" || thinking || hintThinking || turn !== PLAYER)
      return;
    setHintThinking(true);
    later(() => {
      const remaining = Math.max(1, puzzle.movesToMate - movesUsedRef.current);
      const m = findMateMove(boardRef.current, remaining);
      setHintMove(m);
      setHintThinking(false);
    }, 60);
  }, [status, thinking, hintThinking, turn, later, puzzle.movesToMate]);

  const retry = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setState(puzzleState(puzzle));
    moveCodesRef.current = [];
    setMovesUsed(0);
    setSelected(null);
    setStatus("playing");
    setFailKind(null);
    setTurn(PLAYER);
    setCheckSide(null);
    setAnim(null);
    setThinking(false);
    setHintMove(null);
    setHintThinking(false);
  }, [puzzle]);

  const dateLabel = useMemo(() => {
    const d = new Date();
    return lang === "vi"
      ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
      : d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  }, [lang]);

  const [rushMode, setRushMode] = useState(false);

  if (rushMode) {
    return <PuzzleRush lang={lang} onExit={() => setRushMode(false)} />;
  }

  return (
    <main className="cu-layout">
      <div className="cu-rush-enter">
        <button
          type="button"
          className="cu-btn cu-btn-rush"
          onClick={() => setRushMode(true)}
        >
          {s.rushTab}
        </button>
      </div>
      <div className="cu-board-area">
        <div key={shakeId} className={`cu-board-fit ${shakeId > 0 ? "shake" : ""}`}>
          <Board
            board={view}
            flipped={false}
            selected={selected}
            targets={targets}
            lastMove={hintMove}
            checkAt={checkAt}
            interactive={
              status === "playing" && !thinking && !anim && turn === PLAYER
            }
            anim={anim}
            animTrail
            onSquareClick={onSquareClick}
          />
          {thinking && (
            <div className="cu-think-overlay" aria-hidden="true">
              <span className="cu-spinner cu-spinner-lg" />
            </div>
          )}
        </div>
      </div>

      <aside className="cu-panel">
        <section>
          <h2>{custom ? custom.label : s.puzzleToday}</h2>
          {!custom && (
            <div className="cu-captured-row">
              <span className="cu-captured-label">{s.puzzleNum(puzzle.id)}</span>
              <span>{dateLabel}</span>
            </div>
          )}
          <div className="cu-captured-row">
            <span className="cu-captured-label">{s.mateIn(puzzle.movesToMate)}</span>
            <span className="cu-stats">
              {s.moveCount(movesUsed, puzzle.movesToMate)}
            </span>
          </div>
          {!custom?.hideMeta && (
            <div className="cu-captured-row">
              <span className="cu-captured-label">{s.youAreRed}</span>
              <span className="cu-streak">
                {streak.count > 0 ? s.streak(streak.count) : s.noStreak}
              </span>
              {streak.count >= 3 && (
                <button
                  type="button"
                  className="cu-btn cu-btn-icon"
                  onClick={shareStreak}
                  disabled={sharingAch}
                  title={s.achShare}
                  aria-label={s.achShare}
                >
                  📤
                </button>
              )}
            </div>
          )}
          {!custom && status === "playing" && solvedToday && (
            <div className="cu-captured-row">
              <span className="cu-captured-label">{s.alreadySolved}</span>
            </div>
          )}
        </section>

        {status !== "playing" && (
          <div className={`cu-puzzle-banner ${status}`} role="status">
            {status === "solved"
              ? s.solvedMsg
              : failKind === "out"
                ? s.failedOut
                : s.failedWrong}
          </div>
        )}

        <section>
          <div className="cu-buttons">
            <button
              type="button"
              className="cu-btn"
              onClick={onHint}
              disabled={
                status !== "playing" || thinking || hintThinking || turn !== PLAYER
              }
            >
              {hintThinking ? s.hintThinking : s.hintBtn}
            </button>
            <button type="button" className="cu-btn" onClick={retry}>
              {s.retryBtn}
            </button>
            {!custom && status === "solved" && (
              <button
                type="button"
                className="cu-btn"
                disabled={sharing}
                onClick={sharePuzzle}
              >
                {s.shareBrag}
              </button>
            )}
            {!custom && status === "solved" && streak.count >= 2 && (
              <button
                type="button"
                className="cu-btn"
                disabled={sharingAch}
                onClick={shareStreak}
              >
                {s.streakShareBtn(streak.count)}
              </button>
            )}
          </div>
          {shareToast && <div className="cu-toast">{shareToast}</div>}
          {!custom &&
            status === "solved" &&
            !authUser &&
            puzzleNudge && (
              <SignupNudge
                lang={lang}
                title={s.puzzleNudgeTitle}
                text={s.puzzleNudgeText(loadGuestStats().puzzles)}
                onDismiss={() => setPuzzleNudge(false)}
              />
            )}
        </section>

        <section className="cu-help">
          <h2>{s.howToPlay}</h2>
          <ul>
            {s.puzzleHelpBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      </aside>
    </main>
  );
}
