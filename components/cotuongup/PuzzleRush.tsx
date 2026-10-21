"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import { findBestMove } from "@/lib/jieqi/ai";
import {
  applyMove,
  gameStatus,
  legalMoves,
  viewBoard,
} from "@/lib/jieqi/engine";
import { findMateMove } from "@/lib/jieqi/mate";
import {
  PUZZLES,
  puzzleState,
  type Puzzle,
} from "@/lib/jieqi/puzzles";
import { STR, type Lang } from "@/lib/jieqi/i18n";
import {
  playCheck,
  playCheckmateFanfare,
  playLose,
  playMove,
  playSelect,
} from "@/lib/jieqi/sound";
import { shareLink, shareResultCard } from "@/lib/jieqi/share";
import { canvasToPngFile, renderShareCard } from "@/lib/jieqi/shareCard";
import type { Color, JieqiState, Move } from "@/lib/jieqi/types";

const PLAYER: Color = "red";
const DEFENDER: Color = "black";
const RUSH_TIME = 180; // 3 minutes
const RUSH_LIVES = 3;
const BEST_KEY = "cu-rush-best";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Easy first (mate-in-1), then harder — natural difficulty ramp. */
function buildQueue(): Puzzle[] {
  const m1 = shuffled(PUZZLES.filter((p) => p.movesToMate === 1));
  const m2 = shuffled(PUZZLES.filter((p) => p.movesToMate > 1));
  return [...m1, ...m2];
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export function PuzzleRush({ lang, onExit }: { lang: Lang; onExit: () => void }) {
  const s = STR[lang];
  const [queue] = useState<Puzzle[]>(buildQueue);
  const [qi, setQi] = useState(0);
  const puzzle = queue[qi % queue.length];
  const [board, setBoard] = useState<JieqiState>(() => puzzleState(puzzle));
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [turn, setTurn] = useState<Color>(PLAYER);
  const [movesUsed, setMovesUsed] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(RUSH_LIVES);
  const [timeLeft, setTimeLeft] = useState(RUSH_TIME);
  const [phase, setPhase] = useState<"playing" | "reveal" | "over">("playing");
  const [best, setBest] = useState(loadBest);
  const [newBest, setNewBest] = useState(false);
  const [revealMove, setRevealMove] = useState<Move | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Countdown.
  useEffect(() => {
    if (phase === "over") return;
    if (timeLeft <= 0) {
      setPhase("over");
      return;
    }
    const t = window.setTimeout(() => setTimeLeft((x) => x - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timeLeft, phase]);

  // Game over: record best.
  useEffect(() => {
    if (phase !== "over") return;
    playLose();
    if (score > best) {
      setBest(score);
      setNewBest(true);
      try {
        localStorage.setItem(BEST_KEY, String(score));
      } catch {
        /* ignore */
      }
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextPuzzle = useCallback(() => {
    const nq = qi + 1;
    setQi(nq);
    const p = queue[nq % queue.length];
    setBoard(puzzleState(p));
    setSelected(null);
    setTurn(PLAYER);
    setMovesUsed(0);
    setRevealMove(null);
    setPhase("playing");
  }, [qi, queue]);

  const strike = useCallback(
    (answerBoard: JieqiState, movesBefore: number) => {
      // Wrong move: lose a life, briefly show the right answer, move on.
      // The answer is computed from the position BEFORE the wrong move
      // (answerBoard), and the board is restored there so the revealed
      // move aligns with the pieces on screen.
      const p = queue[qi % queue.length];
      const remaining = Math.max(1, p.movesToMate - movesBefore);
      const answer = findMateMove(answerBoard, remaining);
      setBoard(answerBoard);
      setRevealMove(answer);
      setPhase("reveal");
      playLose();
      later(() => {
        const nl = lives - 1;
        setLives(nl);
        if (nl <= 0) setPhase("over");
        else nextPuzzle();
      }, 1400);
    },
    [qi, queue, lives, later, nextPuzzle]
  );

  const solved = useCallback(() => {
    setScore((x) => x + 1);
    playCheckmateFanfare();
    later(nextPuzzle, 700);
  }, [later, nextPuzzle]);

  const onPlayerMove = useCallback(
    (move: Move) => {
      if (phase !== "playing" || turn !== PLAYER) return;
      const b = boardRef.current;
      const { state: nb, record } = applyMove(b, move);
      setBoard(nb);
      if (record.captured) playCheck();
      else playMove();
      const used = movesUsed + 1;
      setMovesUsed(used);
      const st = gameStatus(nb);
      if (st.over) {
        solved();
        return;
      }
      if (used >= puzzle.movesToMate) {
        strike(b, movesUsed);
        return;
      }
      // Still mate in the remaining moves?
      const remaining = Math.max(1, puzzle.movesToMate - used);
      let keepsMate = true;
      for (const r of legalMoves(nb)) {
        if (!findMateMove(applyMove(nb, r).state, remaining)) {
          keepsMate = false;
          break;
        }
      }
      if (!keepsMate) {
        strike(b, movesUsed);
        return;
      }
      // Defender replies with best defense.
      setTurn(DEFENDER);
      later(() => {
        const { move: dm } = findBestMove(boardRef.current, 9);
        if (!dm) {
          setBoard(boardRef.current);
          solved();
          return;
        }
        const res2 = applyMove(boardRef.current, dm);
        setBoard(res2.state);
        const st2 = gameStatus(res2.state);
        setTurn(PLAYER);
        if (st2.over) {
          if (st2.winner === PLAYER) solved();
          else strike(b, movesUsed);
        }
      }, 450);
    },
    [phase, turn, movesUsed, puzzle, solved, strike, later]
  );

  const targets = useMemo(() => {
    if (!selected || phase !== "playing" || turn !== PLAYER) return [];
    const out: Move[] = [];
    for (const m of legalMoves(board)) {
      if (m.fromX === selected.x && m.fromY === selected.y) out.push(m);
    }
    return out;
  }, [selected, board, phase, turn]);

  const onSquareClick = (x: number, y: number) => {
    if (phase !== "playing" || turn !== PLAYER) return;
    const hit = targets.find((t) => t.toX === x && t.toY === y);
    if (hit) {
      onPlayerMove(hit);
      return;
    }
    const piece = board.board[y][x];
    if (piece && piece.color === PLAYER) playSelect();
    setSelected(piece && piece.color === PLAYER ? { x, y } : null);
  };

  const restart = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const q = buildQueue();
    // Rebuild by resetting index state via a fresh queue reference.
    setQi(0);
    setBoard(puzzleState(q[0]));
    (queue as Puzzle[]).splice(0, queue.length, ...q);
    setSelected(null);
    setTurn(PLAYER);
    setMovesUsed(0);
    setScore(0);
    setLives(RUSH_LIVES);
    setTimeLeft(RUSH_TIME);
    setPhase("playing");
    setNewBest(false);
    setRevealMove(null);
  };

  const shareScore = async () => {
    if (sharing || phase !== "over") return;
    setSharing(true);
    try {
      const title = s.rushShareTitle(score);
      const canvas = renderShareCard({
        board: viewBoard(board),
        title,
        subtitle: s.rushShareSubtitle(score, best),
        footer: s.shareFooter,
      });
      const file = await canvasToPngFile(canvas, "rush.png");
      const outcome = await shareResultCard({
        file,
        fileName: "rush.png",
        title,
        text: `${title}\n${s.rushShareSubtitle(score, best)}`,
        url: await shareLink("/"),
      });
      setShareToast(outcome === "shared" ? s.shareDone : s.shareDownloaded);
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      /* ignore */
    } finally {
      setSharing(false);
    }
  };

  const mm = Math.floor(timeLeft / 60);
  const ss = String(timeLeft % 60).padStart(2, "0");
  const lowTime = timeLeft <= 30;

  return (
    <main className="cu-layout">
      <div className="cu-board-area">
        <div className="cu-board-fit">
          <Board
            board={viewBoard(board)}
            flipped={false}
            selected={selected}
            targets={targets}
            lastMove={revealMove}
            checkAt={null}
            interactive={phase === "playing" && turn === PLAYER}
            anim={null}
            animTrail
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <aside className="cu-panel">
        <div className="cu-rush-hud">
          <div className={`cu-rush-timer ${lowTime ? "cu-rush-low" : ""}`}>
            ⏱ {mm}:{ss}
          </div>
          <div className="cu-rush-score">
            ⚡ {score}
          </div>
          <div className="cu-rush-lives" aria-label={s.rushLives}>
            {"❤".repeat(Math.max(0, lives))}
            {"🖤".repeat(Math.max(0, RUSH_LIVES - lives))}
          </div>
        </div>
        <div className="cu-status" role="status">
          {phase === "over"
            ? s.rushOver(score, best)
            : phase === "reveal"
              ? s.rushWrong()
              : s.rushMateIn(puzzle.movesToMate)}
        </div>
        {phase === "over" && (
          <div className="cu-share-row">
            <button type="button" className="cu-btn" onClick={restart}>
              🔄 {s.rushRetry}
            </button>
            <button
              type="button"
              className="cu-btn"
              disabled={sharing}
              onClick={shareScore}
            >
              📤 {s.shareBrag}
            </button>
            <button type="button" className="cu-btn" onClick={onExit}>
              ← {s.rushBack}
            </button>
          </div>
        )}
        {newBest && phase === "over" && (
          <div className="cu-rush-best">🎉 {s.rushNewBest}</div>
        )}
        {shareToast && <div className="cu-toast">{shareToast}</div>}
        {phase !== "over" && (
          <button type="button" className="cu-btn" onClick={onExit}>
            ← {s.rushBack}
          </button>
        )}
      </aside>
    </main>
  );
}
