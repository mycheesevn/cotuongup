"use client";

interface Props {
  /** Win probability for Red, 0..1. */
  winProbRed: number;
  /** Centipawns from Red's perspective. */
  cpRed: number;
  /** Forced mate found. */
  mate: boolean;
  /** True when Black is at the bottom of the board (board flipped). */
  flipped: boolean;
}

/**
 * Live evaluation bar: vertical beside the board on desktop, thin
 * horizontal above the board on phones (CSS switches orientation).
 * The bottom side's color always fills from the bottom/left.
 */
export function EvalBar({ winProbRed, cpRed, mate, flipped }: Props) {
  const bottomProb = flipped ? 1 - winProbRed : winProbRed;
  const pct = Math.max(0, Math.min(100, Math.round(bottomProb * 100)));
  const label = mate
    ? cpRed > 0
      ? "M"
      : "-M"
    : `${cpRed >= 0 ? "+" : ""}${(cpRed / 100).toFixed(1)}`;
  return (
    <div className="cu-evalbar-wrap" aria-hidden="true">
      <div className={`cu-evalbar${flipped ? " flipped" : ""}`}>
        <div
          className="cu-evalbar-fill"
          style={{ "--fill": `${pct}%` } as React.CSSProperties}
        />
      </div>
      <div className="cu-evalbar-label">{label}</div>
    </div>
  );
}
