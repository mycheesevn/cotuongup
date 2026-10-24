"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Board, MoveAnim } from "./Board";
import {
  applyMove,
  findKing,
  gameStatus,
  isInCheck,
  legalMovesForSquare,
  parseFen,
  viewBoard,
} from "../../lib/jieqi/engine";
import {
  LIBRARY,
  TOTAL_LESSONS,
  LibraryLesson,
  allLessonIds,
  findLesson,
  isChapterUnlocked,
  isLessonUnlocked,
  ltext,
  nextLessonId,
} from "../../lib/jieqi/library";
import {
  completeLesson,
  loadLocalDone,
  syncLibraryProgress,
} from "../../lib/supabase/libraryProgress";
import type { Lang, Strings } from "../../lib/jieqi/i18n";
import { fmt } from "../../lib/jieqi/i18n";
import type {
  Color,
  JieqiState,
  Move,
  MoveRecord,
} from "../../lib/jieqi/types";

function parseCoordMove(s: string): Move {
  const [a, b] = s.split(">");
  const [fromX, fromY] = a.split(",").map(Number);
  const [toX, toY] = b.split(",").map(Number);
  return { fromX, fromY, toX, toY };
}

function sameMove(a: Move, b: Move): boolean {
  return (
    a.fromX === b.fromX &&
    a.fromY === b.fromY &&
    a.toX === b.toX &&
    a.toY === b.toY
  );
}

type View =
  | { name: "home" }
  | { name: "chapter"; chapterId: string }
  | { name: "lesson"; lessonId: string };

export function LibraryView({ lang, s }: { lang: Lang; s: Strings }) {
  const [view, setView] = useState<View>({ name: "home" });
  const [done, setDone] = useState<Set<string>>(() => new Set(loadLocalDone()));

  useEffect(() => {
    let live = true;
    syncLibraryProgress().then((merged) => {
      if (live) setDone(new Set(merged));
    });
    return () => {
      live = false;
    };
  }, []);

  const markDone = async (lessonId: string) => {
    const merged = await completeLesson(lessonId);
    setDone(new Set(merged));
  };

  if (view.name === "lesson") {
    const lesson = findLesson(view.lessonId);
    if (!lesson) return null;
    return (
      <LessonPlayer
        key={lesson.id}
        lesson={lesson}
        lang={lang}
        s={s}
        done={done}
        onDone={markDone}
        onExit={() => setView({ name: "home" })}
        onNext={(id) => setView({ name: "lesson", lessonId: id })}
      />
    );
  }

  if (view.name === "chapter") {
    const ch = LIBRARY.find((c) => c.id === view.chapterId);
    if (ch && isChapterUnlocked(ch.id, done)) {
      return (
        <ChapterView
          chapterId={ch.id}
          lang={lang}
          s={s}
          done={done}
          onBack={() => setView({ name: "home" })}
          onLesson={(id) => setView({ name: "lesson", lessonId: id })}
        />
      );
    }
    // fall through to home
  }

  const doneCount = allLessonIds().filter((id) => done.has(id)).length;
  return (
    <main className="cu-layout">
      <div className="cu-lib-home">
        <div className="cu-lib-hero">
          <h2>📚 {s.modeLibrary}</h2>
          <p>{s.libTagline}</p>
          <div className="cu-lib-progress">
            <div className="cu-lib-bar">
              <div
                className="cu-lib-fill"
                style={{ width: `${(doneCount / TOTAL_LESSONS) * 100}%` }}
              />
            </div>
            <span>{fmt(s.libProgress, { done: doneCount, total: TOTAL_LESSONS })}</span>
          </div>
        </div>
        <div className="cu-lib-chapters">
          {LIBRARY.map((ch, ci) => {
            const unlocked = isChapterUnlocked(ch.id, done);
            const chDone = ch.lessons.filter((l) => done.has(l.id)).length;
            const complete = chDone === ch.lessons.length;
            return (
              <button
                key={ch.id}
                type="button"
                className={`cu-lib-chapter ${complete ? "is-done" : ""} ${
                  !unlocked ? "is-locked" : ""
                }`}
                disabled={!unlocked}
                onClick={() =>
                  setView({ name: "chapter", chapterId: ch.id })
                }
              >
                <span className="cu-lib-cicon">{unlocked ? ch.icon : "🔒"}</span>
                <span className="cu-lib-cbody">
                  <span className="cu-lib-ctitle">
                    {ltext(ch.title, lang)}
                    {complete && <em> ✓</em>}
                  </span>
                  <span className="cu-lib-csub">
                    {unlocked
                      ? ltext(ch.subtitle, lang)
                      : fmt(s.libUnlockHint, { title: LIBRARY[ci - 1] ? ltext(LIBRARY[ci - 1].title, lang) : "" })}
                  </span>
                  <span className="cu-lib-cmeta">
                    {unlocked
                      ? fmt(s.libLessons, { done: chDone, total: ch.lessons.length })
                      : ""}
                  </span>
                </span>
                <span className="cu-lib-lgo">{unlocked ? "›" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------ Chapter (lesson list) ------------------------------ */

function ChapterView({
  chapterId,
  lang,
  s,
  done,
  onBack,
  onLesson,
}: {
  chapterId: string;
  lang: Lang;
  s: Strings;
  done: Set<string>;
  onBack: () => void;
  onLesson: (id: string) => void;
}) {
  const ch = LIBRARY.find((c) => c.id === chapterId)!;
  return (
    <main className="cu-layout">
      <div className="cu-lib-home">
        <button type="button" className="cu-lib-back" onClick={onBack}>
          {s.libBack}
        </button>
        <div className="cu-lib-chead">
          <span className="cu-lib-cicon">{ch.icon}</span>
          <div>
            <h2>{ltext(ch.title, lang)}</h2>
            <p>{ltext(ch.subtitle, lang)}</p>
          </div>
        </div>
        <div className="cu-lib-lessons">
          {ch.lessons.map((l, i) => {
            const unlocked = isLessonUnlocked(l.id, done);
            const finished = done.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={`cu-lib-lesson ${finished ? "is-done" : ""} ${
                  !unlocked ? "is-locked" : ""
                }`}
                disabled={!unlocked}
                onClick={() => onLesson(l.id)}
              >
                <span className="cu-lib-lnum">
                  {finished ? "✅" : unlocked ? `${i + 1}` : "🔒"}
                </span>
                <span className="cu-lib-ltitle">{ltext(l.title, lang)}</span>
                <span className="cu-lib-lgo">{unlocked ? "›" : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------ Lesson player ------------------------------ */

function LessonPlayer({
  lesson,
  lang,
  s,
  done,
  onDone,
  onExit,
  onNext,
}: {
  lesson: LibraryLesson;
  lang: Lang;
  s: Strings;
  done: Set<string>;
  onDone: (id: string) => void;
  onExit: () => void;
  onNext: (id: string) => void;
}) {
  const n = lesson.steps.length;
  const [stepIdx, setStepIdx] = useState(0);
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [targets, setTargets] = useState<Move[]>([]);
  const [anim, setAnim] = useState<MoveAnim | null>(null);
  const [shake, setShake] = useState(0);
  const [wrongMsg, setWrongMsg] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const animId = useRef(0);
  const startState = useMemo(() => parseFen(lesson.startFen), [lesson]);

  const movesUpTo = (idx: number): Move[] => {
    const ms: Move[] = [];
    for (let i = 0; i < idx; i++) {
      const st = lesson.steps[i];
      if (st.move) ms.push(parseCoordMove(st.move));
    }
    return ms;
  };

  /** State + record after the first `idx` lesson steps. */
  const replayTo = (idx: number): { state: JieqiState; record: MoveRecord | null } => {
    let state = startState;
    let record: MoveRecord | null = null;
    for (const m of movesUpTo(idx)) {
      const r = applyMove(state, m);
      state = r.state;
      record = r.record;
    }
    return { state, record };
  };

  const { state, record: lastRecord } = useMemo(
    () => replayTo(stepIdx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startState, stepIdx]
  );
  const view = useMemo(() => viewBoard(state), [state]);
  const sideAt = (_idx: number): Color => state.turn;

  const lastMove: Move | null = useMemo(() => {
    const ms = movesUpTo(stepIdx);
    return ms.length ? ms[ms.length - 1] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const finished = stepIdx >= n;
  const step = finished ? null : lesson.steps[stepIdx];
  const quizActive = !!step?.quiz && !solved.has(stepIdx);
  const exploreActive = !!step?.explore;

  const checkAt = useMemo(() => {
    if (!isInCheck(state.board, state.turn)) return null;
    return findKing(state.board, state.turn);
  }, [state]);

  const clearSel = () => {
    setSelected(null);
    setTargets([]);
  };

  // Preselect the focus piece when an explore step opens.
  useEffect(() => {
    clearSel();
    setWrongMsg(false);
    if (step?.explore && step.exploreFocus) {
      const [x, y] = step.exploreFocus.split(",").map(Number);
      const pc = state.board[y]?.[x];
      if (pc) {
        setSelected({ x, y });
        setTargets(legalMovesForSquare(state, x, y));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const advance = (move: Move) => {
    const piece = view[move.fromY][move.fromX];
    const capTrue = state.board[move.toY][move.toX];
    const captured = capTrue
      ? {
          id: capTrue.id,
          color: capTrue.color,
          faceType: capTrue.trueType,
          covered: false,
          hostType: capTrue.fakeType,
        }
      : null;
    animId.current += 1;
    setAnim({ id: animId.current, move, piece: piece!, captured });
    setStepIdx((i) => i + 1);
    clearSel();
  };

  const doWrong = () => {
    setShake((x) => x + 1);
    setWrongMsg(true);
    clearSel();
  };

  const attemptQuizMove = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    if (!step?.move || !step.quiz) return;
    const expected = parseCoordMove(step.move);
    const played: Move = { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y };
    if (step.quiz === "exact") {
      if (sameMove(played, expected)) {
        setSolved((prev) => new Set(prev).add(stepIdx));
        advance(played);
      } else {
        doWrong();
      }
      return;
    }
    // quiz === "mate": any immediate checkmate wins.
    const ns = applyMove(state, played).state;
    const st = gameStatus(ns);
    if (st.over && st.winner === sideAt(stepIdx) && st.reason === "checkmate") {
      setSolved((prev) => new Set(prev).add(stepIdx));
      advance(played);
    } else {
      doWrong();
    }
  };

  const onSquareClick = (x: number, y: number) => {
    if (finished) return;
    if (quizActive) {
      const stm = sideAt(stepIdx);
      if (selected && targets.some((t) => t.toX === x && t.toY === y)) {
        attemptQuizMove(selected, { x, y });
        return;
      }
      const p = state.board[y][x];
      if (p && p.color === stm) {
        setSelected({ x, y });
        setTargets(legalMovesForSquare(state, x, y));
      } else {
        clearSel();
      }
      return;
    }
    if (exploreActive) {
      const p = state.board[y][x];
      if (p) {
        setSelected({ x, y });
        setTargets(legalMovesForSquare(state, x, y));
      } else {
        clearSel();
      }
    }
  };

  const showGuidedMove = () => {
    if (!step?.move || step.quiz || step.explore) return;
    advance(parseCoordMove(step.move));
  };

  // Autoplay: advance guided steps only.
  useEffect(() => {
    if (!autoplay || finished) return;
    if (step?.quiz || step?.explore) {
      setAutoplay(false);
      return;
    }
    const t = setTimeout(() => showGuidedMove(), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, stepIdx, finished]);

  const complete = async () => {
    setFinishing(true);
    await onDone(lesson.id);
  };

  const nextId = nextLessonId(lesson.id);
  const nextUnlocked = nextId ? isLessonUnlocked(nextId, done) : false;

  return (
    <main className="cu-layout">
      <div className="cu-board-area">
        <div key={shake} className={`cu-board-fit ${shake > 0 ? "shake" : ""}`}>
          <Board
            board={view}
            flipped={false}
            flippingId={
              lastRecord?.flipped && lastMove
                ? (state.board[lastMove.toY]?.[lastMove.toX]?.id ?? null)
                : null
            }
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            hintMove={null}
            checkAt={checkAt}
            interactive={quizActive || exploreActive}
            anim={anim}
            animTrail
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <aside className="cu-panel">
        <div className="cu-lib-topbar">
          <button type="button" className="cu-lib-back" onClick={onExit}>
            {s.libBack}
          </button>
          <span className="cu-lib-stepcount">
            {finished ? s.libDone : fmt(s.libStep, { cur: stepIdx + 1, total: n })}
          </span>
        </div>
        <h2 className="cu-lib-lesson-title">{ltext(lesson.title, lang)}</h2>

        {!finished ? (
          <>
            <div
              className={`cu-lib-card ${quizActive ? "is-quiz" : ""} ${
                exploreActive ? "is-explore" : ""
              }`}
              role="status"
              aria-live="polite"
            >
              <p>
                {quizActive
                  ? ltext(step!.quizPrompt ?? step!.text, lang)
                  : ltext(step!.text, lang)}
              </p>
              {wrongMsg && quizActive && (
                <p className="cu-lib-wrong">{s.libTryAgain}</p>
              )}
            </div>
            <div className="cu-lib-controls">
              <button
                type="button"
                disabled={stepIdx === 0}
                onClick={() => {
                  setAutoplay(false);
                  setStepIdx((i) => Math.max(0, i - 1));
                }}
                aria-label="previous"
              >
                ◀
              </button>
              {step!.explore ? (
                <button
                  type="button"
                  className="cu-lib-primary"
                  onClick={() => setStepIdx((i) => i + 1)}
                >
                  {s.libExploreDone}
                </button>
              ) : step!.quiz ? (
                <span className="cu-lib-quizbadge">🎯 {s.libFindMove}</span>
              ) : (
                <>
                  <button
                    type="button"
                    className="cu-lib-primary"
                    onClick={showGuidedMove}
                  >
                    {s.libShowMove}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoplay((a) => !a)}
                    aria-pressed={autoplay}
                    title="autoplay"
                  >
                    {autoplay ? "⏸" : "▶️"}
                  </button>
                </>
              )}
            </div>
            <div className="cu-lib-moves">
              {lesson.steps.map((st, i) =>
                st.move ? (
                  <button
                    key={i}
                    type="button"
                    className={`cu-lib-chip ${i < stepIdx ? "is-past" : ""} ${
                      i === stepIdx ? "is-cur" : ""
                    }`}
                    onClick={() => {
                      // Can't jump ahead past an unsolved quiz.
                      let target = i;
                      for (let k = 0; k < i; k++) {
                        if (lesson.steps[k].quiz && !solved.has(k)) {
                          target = k;
                          break;
                        }
                      }
                      setAutoplay(false);
                      setStepIdx(target);
                    }}
                  >
                    {i + 1}
                  </button>
                ) : null
              )}
            </div>
          </>
        ) : (
          <>
            <div className="cu-lib-card is-outro" role="status">
              <p>{ltext(lesson.outro, lang)}</p>
            </div>
            {!finishing ? (
              <button
                type="button"
                className="cu-lib-primary cu-lib-complete"
                onClick={complete}
              >
                {done.has(lesson.id) ? s.libDone : s.libCompleteLesson} ✓
              </button>
            ) : (
              <div className="cu-lib-celebrate" role="status">
                <div className="cu-lib-celebrate-emoji">🎉</div>
                <p>{s.libCelebration}</p>
                <div className="cu-lib-controls">
                  {nextId && nextUnlocked && (
                    <button
                      type="button"
                      className="cu-lib-primary"
                      onClick={() => onNext(nextId)}
                    >
                      {s.libNextLesson}
                    </button>
                  )}
                  <button type="button" onClick={onExit}>
                    {s.libBackToLibrary}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </aside>
    </main>
  );
}
