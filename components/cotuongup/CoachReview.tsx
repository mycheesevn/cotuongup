"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Board } from "./Board";
import {
  analyzePly,
  classifyMove,
  decodeMove,
  formatEval,
  moveText,
  positionAt,
  sideAtPly,
  type PlyAnalysis,
} from "@/lib/jieqi/analysis";
import {
  buildCoachReport,
  type CoachReport,
  type CoachStrength,
  type HumanPly,
} from "@/lib/jieqi/coach";
import { renderCoachCard, type CoachCardMistake } from "@/lib/jieqi/coachCard";
import { canvasToPngFile } from "@/lib/jieqi/shareCard";
import { shareLink, shareResultCard } from "@/lib/jieqi/share";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import { viewBoard } from "@/lib/jieqi/engine";
import type { Color, JieqiState } from "@/lib/jieqi/types";

interface Props {
  lang: Lang;
  moveCodes: string[];
  /** The game's true start state (from its full FEN). */
  startState: JieqiState;
  humanColor: Color;
  /** From the human's perspective. */
  result: "win" | "loss" | "draw";
  levelLabel: string;
  onBack: () => void;
}

const CLS_ICON: Record<string, string> = {
  mistake: "?",
  blunder: "??",
};

export function CoachReview({
  lang,
  moveCodes,
  startState,
  humanColor,
  result,
  levelLabel,
  onBack,
}: Props) {
  const s = STR[lang];

  // Snapshot the finished game: the analysis always covers the game that
  // just ended, even if the parent re-renders for other reasons.
  const snapRef = useRef({
    codes: moveCodes,
    state: startState,
    human: humanColor,
  });

  const cacheRef = useRef(new Map<number, PlyAnalysis>());
  const [analyzed, setAnalyzed] = useState(0);
  const [done, setDone] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const totalPlies = snapRef.current.codes.length;

  // Chunked full-game analysis: one ply per tick so the UI stays alive.
  // Starts only when this view opens (never delays the game-over screen).
  useEffect(() => {
    const { codes, state } = snapRef.current;
    const total = codes.length + 1;
    let p = 0;
    let cancelled = false;
    let timer = 0;
    const step = () => {
      if (cancelled) return;
      if (p >= total) {
        setDone(true);
        return;
      }
      cacheRef.current.set(p, analyzePly(codes, p, state));
      p++;
      setAnalyzed(p);
      timer = window.setTimeout(step, 25);
    };
    step();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Classify the human's moves from the analysis so far.
  const humanPlies: HumanPly[] = useMemo(() => {
    const { codes, state, human } = snapRef.current;
    const cache = cacheRef.current;
    const out: HumanPly[] = [];
    for (let i = 0; i < codes.length; i++) {
      if (sideAtPly(i, state.turn) !== human) continue;
      const before = cache.get(i);
      const after = cache.get(i + 1);
      if (!before || !after) continue;
      const played = decodeMove(codes[i]);
      const c = classifyMove(before, after, played);
      const posBefore = positionAt(codes, i, state);
      const swing = -after.score - before.score; // mover's perspective
      out.push({
        ply: i,
        mover: human,
        swing,
        loss: Math.max(0, -swing),
        cls: c.cls,
        moveText: moveText(posBefore, played, lang),
        bestMove: c.bestMove,
        bestMoveText: c.bestMove ? moveText(posBefore, c.bestMove, lang) : "—",
        evalBefore: before.score,
        evalAfter: -after.score,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzed, lang]);

  const report: CoachReport | null = useMemo(
    () => (done ? buildCoachReport(humanPlies) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done, humanPlies]
  );

  // formatEval takes Red's perspective; convert the mover's eval.
  const toRed = (cpMover: number) =>
    snapRef.current.human === "red" ? cpMover : -cpMover;

  const strengthText = (st: CoachStrength): string => {
    switch (st.kind) {
      case "brilliant":
        return fmt(s.coachStrengthBrilliant, { move: st.moveText ?? "", gain: st.gainPawns ?? "" });
      case "streak":
        return fmt(s.coachStrengthStreak, { n: st.streak ?? 0, from: st.fromMove ?? 0, to: st.toMove ?? 0 });
      case "bestRate":
        return fmt(s.coachStrengthBestRate, { rate: st.rate ?? 0 });
      case "strongFinish":
        return fmt(s.coachStrengthStrongFinish, { before: st.halfBefore ?? 0, after: st.halfAfter ?? 0 });
      case "solidPhase": {
        const ph =
          st.phase === "opening"
            ? s.coachPhaseOpening
            : st.phase === "middlegame"
              ? s.coachPhaseMiddlegame
              : s.coachPhaseEndgame;
        return fmt(s.coachStrengthSolidPhase, { phase: ph });
      }
    }
  };

  const cardTitle =
    result === "win"
      ? fmt(s.shareWinTitle, { level: levelLabel })
      : result === "draw"
        ? s.shareDrawTitle
        : s.shareLossTitle;

  const onShareCard = async () => {
    if (!report || sharing) return;
    const { codes, state } = snapRef.current;
    setSharing(true);
    try {
      const mistakes: CoachCardMistake[] = report.mistakes.map((m) => ({
        headline: `${CLS_ICON[m.cls] ?? "?"} ${fmt(s.coachMoveNum, { n: m.moveNumber })} · ${m.moveText}`,
        detail: `${s.coachBetter}: ${m.bestMoveText} · ${formatEval(
          toRed(m.evalBefore)
        )} → ${formatEval(toRed(m.evalAfter))}`,
      }));
      const canvas = renderCoachCard({
        board: viewBoard(positionAt(codes, codes.length, state)),
        title: cardTitle,
        accuracyLine: fmt(s.coachCardAccuracy, { n: report.accuracy }),
        mistakes,
        footer: s.shareFooter,
      });
      const file = await canvasToPngFile(canvas, "co-up-coach.png");
      const link = await shareLink("/");
      const outcome = await shareResultCard({
        file,
        fileName: "co-up-coach.png",
        title: cardTitle,
        text: `${cardTitle}\n${fmt(s.coachCardAccuracy, { n: report.accuracy })}`,
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

  const { codes, state: sb } = snapRef.current;
  const flipped = snapRef.current.human === "black";

  return (
    <main className="cu-layout">
      <div className="cu-scroll-area">
        <div style={{ maxWidth: 680, width: "100%" }}>
          <div className="cu-buttons" style={{ marginBottom: 8 }}>
            <button type="button" className="cu-btn" onClick={onBack}>
              {s.coachBack}
            </button>
          </div>

          <section>
            <h2>🎓 {s.coachTitle}</h2>
            {!done && (
              <>
                <div className="cu-captured-row">
                  <span className="cu-captured-label">
                    <span className="cu-spinner" aria-hidden="true" />{" "}
                    {s.coachAnalyzing}
                  </span>
                  <span className="cu-stats">
                    {fmt(s.coachAnalyzed, { done: analyzed, total: totalPlies + 1 })}
                  </span>
                </div>
                <div className="cu-progress" style={{ marginTop: 8 }}>
                  <div
                    className="cu-progress-fill"
                    style={{
                      width: `${(analyzed / Math.max(1, totalPlies + 1)) * 100}%`,
                    }}
                  />
                </div>
              </>
            )}
          </section>

          {done && report && report.moves === 0 && (
            <section>
              <p className="cu-empty-note">{s.coachNoData}</p>
            </section>
          )}

          {done && report && report.moves > 0 && (
            <>
              <section data-testid="coach-accuracy">
                <h2>{s.coachAccuracy}</h2>
                <div className="cu-captured-row">
                  <span
                    className="cu-stats"
                    style={{ fontSize: 56, fontWeight: 800, color: "#ffd43b" }}
                    data-testid="coach-accuracy-value"
                  >
                    {report.accuracy}
                  </span>
                  <span className="cu-captured-label">
                    /100 · {report.moves} {s.movesCount}
                  </span>
                </div>
              </section>

              <section data-testid="coach-mistakes">
                <h2>{s.coachTopMistakes}</h2>
                {report.mistakes.length === 0 ? (
                  <p className="cu-empty-note">{s.coachNoMistakes}</p>
                ) : (
                  report.mistakes.map((m) => {
                    const posBefore = positionAt(codes, m.ply, sb);
                    const played = decodeMove(codes[m.ply]);
                    const dropPawns = (
                      (m.evalAfter - m.evalBefore) /
                      100
                    ).toFixed(1);
                    return (
                      <div
                        key={m.ply}
                        className="cu-mistake-card"
                        data-testid="coach-mistake"
                        style={{ marginBottom: 16 }}
                      >
                        <div className="cu-captured-row" style={{ marginBottom: 6 }}>
                          <span className="cu-captured-label">
                            <strong>
                              {CLS_ICON[m.cls] ?? "?"} {fmt(s.coachMoveNum, { n: m.moveNumber })}
                            </strong>{" "}
                            · {m.moveText}
                          </span>
                        </div>
                        <div style={{ maxWidth: 420, margin: "0 auto" }}>
                          <Board
                            board={viewBoard(posBefore)}
                            flipped={flipped}
                            selected={null}
                            targets={[]}
                            lastMove={played}
                            hintMove={m.bestMove}
                            checkAt={null}
                            interactive={false}
                            anim={null}
                            onSquareClick={() => {}}
                          />
                        </div>
                        <div className="cu-captured-row" style={{ marginTop: 6 }}>
                          <span className="cu-captured-label">{s.coachBetter}</span>
                          <span>{m.bestMoveText}</span>
                        </div>
                        <div className="cu-captured-row">
                          <span className="cu-captured-label">{s.coachYouPlayed}</span>
                          <span>
                            {formatEval(toRed(m.evalBefore))} →{" "}
                            {formatEval(toRed(m.evalAfter))}{" "}
                            <span style={{ color: "#ff9d6b" }}>
                              ({Number(dropPawns) > 0 ? "+" : ""}
                              {dropPawns})
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>

              <section data-testid="coach-strength">
                <h2>💪 {s.coachStrength}</h2>
                <div className="cu-comment cu-comment-good">
                  <div className="cu-comment-head">
                    {strengthText(report.strength)}
                  </div>
                </div>
              </section>

              <section>
                <div className="cu-buttons">
                  <button
                    type="button"
                    className="cu-btn"
                    disabled={sharing}
                    onClick={onShareCard}
                  >
                    {s.coachShareCard}
                  </button>
                </div>
                {shareToast && (
                  <div className="cu-toast" style={{ marginTop: 8 }}>
                    {shareToast}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
