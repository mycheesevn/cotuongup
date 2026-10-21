"use client";

import { useMemo, useRef } from "react";
import {
  Move,
  PIECE_CHARS,
  PieceType,
  ViewBoard,
  ViewPiece,
} from "@/lib/jieqi/types";

const CELL = 64;
const MARGIN = 44;
const W = 8 * CELL + MARGIN * 2; // 600
const H = 9 * CELL + MARGIN * 2; // 664

const LINE = "#5e3a17";

const STAR_POINTS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [7, 2],
  [0, 3],
  [2, 3],
  [4, 3],
  [6, 3],
  [8, 3],
  [0, 6],
  [2, 6],
  [4, 6],
  [6, 6],
  [8, 6],
  [1, 7],
  [7, 7],
];

function StarTicks({ x, y }: { x: number; y: number }) {
  const px = MARGIN + x * CELL;
  const py = MARGIN + y * CELL;
  const g = 7;
  const L = 17;
  const paths: string[] = [];
  const quads: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (const [qx, qy] of quads) {
    if (x === 0 && qx === -1) continue;
    if (x === 8 && qx === 1) continue;
    const hx = px + qx * g;
    const hy = py + qy * g;
    paths.push(
      `M ${px + qx * (g + L)} ${hy} L ${hx} ${hy} L ${hx} ${py + qy * (g + L)}`
    );
  }
  return <path d={paths.join(" ")} stroke={LINE} strokeWidth={2.5} fill="none" />;
}

/**
 * The face type a piece renders as. ViewPieces carry `faceType`; the room
 * views (Agent C) still pass legacy `{ type, color }` pieces through an
 * adapter — tolerate both so their swap can land independently.
 */
function faceOf(piece: ViewPiece): PieceType {
  return (
    piece.faceType ??
    (piece as unknown as { type?: PieceType }).type ??
    piece.hostType
  );
}

/** A single 3D piece disc centered at (x, y). Covered pieces render the
 *  brass back: double ring, rim tinted by side, and the host (starting
 *  square) glyph at low opacity — identical silhouette per side. */
function PieceDisc({ piece, x, y }: { piece: ViewPiece; x: number; y: number }) {
  const red = piece.color === "red";
  if (piece.covered) {
    const rim = red ? "#93262e" : "#3a3230";
    return (
      <g filter="url(#pieceShadow)">
        <circle cx={x} cy={y} r={28} fill="url(#pieceBack)" stroke={rim} strokeWidth={3} />
        <circle
          cx={x}
          cy={y}
          r={22.5}
          fill="none"
          stroke="#8a6420"
          strokeWidth={1.2}
          opacity={0.75}
        />
        <circle
          cx={x}
          cy={y}
          r={16}
          fill="none"
          stroke="#8a6420"
          strokeWidth={0.8}
          opacity={0.5}
        />
        <ellipse
          cx={x - 8}
          cy={y - 11}
          rx={11}
          ry={6.5}
          fill="#ffffff"
          opacity={0.3}
          transform={`rotate(-18 ${x - 8} ${y - 11})`}
        />
        <text
          x={x}
          y={y + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={26}
          fontWeight={700}
          fill="#6e4d14"
          opacity={0.42}
          fontFamily="'Noto Serif SC', 'Songti SC', serif"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {PIECE_CHARS[piece.color][piece.hostType]}
        </text>
      </g>
    );
  }
  const ink = red ? "#a82c20" : "#2b2724";
  const grad = red ? "url(#pieceRed)" : "url(#pieceBlack)";
  return (
    <g filter="url(#pieceShadow)">
      <circle cx={x} cy={y} r={28} fill={grad} stroke={ink} strokeWidth={2.5} />
      <circle
        cx={x}
        cy={y}
        r={22.5}
        fill="none"
        stroke={ink}
        strokeWidth={1}
        opacity={0.5}
      />
      <ellipse
        cx={x - 8}
        cy={y - 11}
        rx={11}
        ry={6.5}
        fill="#ffffff"
        opacity={0.38}
        transform={`rotate(-18 ${x - 8} ${y - 11})`}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={29}
        fontWeight={700}
        fill={ink}
        fontFamily="'Noto Serif SC', 'Songti SC', serif"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {PIECE_CHARS[piece.color][faceOf(piece)]}
      </text>
    </g>
  );
}

/** Expanding ring when a piece lands on a quiet square (CSS-driven). */
function Ripple({ x, y }: { x: number; y: number }) {
  return (
    <circle
      cx={x}
      cy={y}
      r={46}
      fill="none"
      stroke="#ffd43b"
      strokeWidth={4}
      className="cu-ripple"
    />
  );
}

/** Clash burst + the captured piece sent flying (CSS-driven). */
function Clash({
  x,
  y,
  captured,
  fromX,
  fromY,
}: {
  x: number;
  y: number;
  captured: ViewPiece;
  fromX: number;
  fromY: number;
}) {
  const spikes = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    const c = Math.cos(a);
    const s = Math.sin(a);
    spikes.push(
      <line
        key={i}
        x1={x + c * 18}
        y1={y + s * 18}
        x2={x + c * 32}
        y2={y + s * 32}
        stroke="#ffd43b"
        strokeWidth={7}
        strokeLinecap="round"
        className="cu-spike"
        style={{ "--sx": `${c * 30}px`, "--sy": `${s * 30}px` } as React.CSSProperties}
      />
    );
  }
  const dx = Math.sign(x - fromX) * 70 || 50;
  const dy = -60;
  return (
    <g>
      <circle cx={x} cy={y} r={60} fill="#ffd43b" className="cu-blast" />
      <circle cx={x} cy={y} r={32} fill="#fff9db" className="cu-blast" />
      {spikes}
      <g
        className="cu-fly"
        style={{ "--fx": `${dx}px`, "--fy": `${dy}px` } as React.CSSProperties}
      >
        <g transform={`translate(${x} ${y})`}>
          <PieceDisc piece={captured} x={0} y={0} />
        </g>
      </g>
    </g>
  );
}

export interface MoveAnim {
  id: number;
  move: Move;
  piece: ViewPiece;
  captured: ViewPiece | null;
}

interface BoardProps {
  board: ViewBoard;
  flipped: boolean;
  selected: { x: number; y: number } | null;
  targets: Move[];
  lastMove: Move | null;
  /** Suggested move: pulsing rings + arrow overlay. */
  hintMove?: Move | null;
  checkAt: { x: number; y: number } | null;
  interactive: boolean;
  anim: MoveAnim | null;
  /** Slower piece glide (used by replay auto-play). */
  animSlow?: boolean;
  /** Slightly slower piece glide for the opponent's move. */
  animTrail?: boolean;
  /** Id of a piece that just flipped face-up: its disc plays the flip
   *  animation (state already shows the face; the disc flips from back). */
  flippingId?: number | null;
  onSquareClick: (x: number, y: number) => void;
}

export function Board({
  board,
  flipped,
  selected,
  targets,
  animSlow,
  animTrail,
  lastMove,
  hintMove = null,
  checkAt,
  interactive,
  anim,
  flippingId = null,
  onSquareClick,
}: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const px = (x: number) => MARGIN + (flipped ? 8 - x : x) * CELL;
  const py = (y: number) => MARGIN + (flipped ? 9 - y : y) * CELL;

  const targetSet = useMemo(() => {
    const quiet = new Set<string>();
    const captures = new Set<string>();
    for (const m of targets) {
      const key = `${m.toX},${m.toY}`;
      if (board[m.toY][m.toX]) captures.add(key);
      else quiet.add(key);
    }
    return { quiet, captures };
  }, [targets, board]);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    // The SVG fills its container but keeps the viewBox aspect via
    // preserveAspectRatio="xMidYMid meet": when the container's aspect
    // differs from the board's, the drawing is letterboxed (centered with
    // empty bands). A naive linear map across the full element is then
    // off — increasingly toward the edges — and taps land on a
    // neighbouring intersection. Convert through the meet transform.
    const scale = Math.min(rect.width / W, rect.height / H);
    if (scale <= 0) return;
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;
    const sx = (e.clientX - rect.left - offX) / scale;
    const sy = (e.clientY - rect.top - offY) / scale;
    const dx = Math.round((sx - MARGIN) / CELL);
    const dy = Math.round((sy - MARGIN) / CELL);
    if (dx < 0 || dx > 8 || dy < 0 || dy > 9) return;
    onSquareClick(flipped ? 8 - dx : dx, flipped ? 9 - dy : dy);
  };

  const hLines = [];
  for (let y = 0; y <= 9; y++) {
    hLines.push(
      <line
        key={`h${y}`}
        x1={MARGIN}
        y1={MARGIN + y * CELL}
        x2={MARGIN + 8 * CELL}
        y2={MARGIN + y * CELL}
        stroke={LINE}
        strokeWidth={y === 0 || y === 9 ? 3 : 1.6}
      />
    );
  }
  const vLines = [];
  for (let x = 0; x <= 8; x++) {
    if (x === 0 || x === 8) {
      vLines.push(
        <line
          key={`v${x}`}
          x1={MARGIN + x * CELL}
          y1={MARGIN}
          x2={MARGIN + x * CELL}
          y2={MARGIN + 9 * CELL}
          stroke={LINE}
          strokeWidth={3}
        />
      );
    } else {
      vLines.push(
        <g key={`v${x}`} stroke={LINE} strokeWidth={1.6}>
          <line
            x1={MARGIN + x * CELL}
            y1={MARGIN}
            x2={MARGIN + x * CELL}
            y2={MARGIN + 4 * CELL}
          />
          <line
            x1={MARGIN + x * CELL}
            y1={MARGIN + 5 * CELL}
            x2={MARGIN + x * CELL}
            y2={MARGIN + 9 * CELL}
          />
        </g>
      );
    }
  }

  const palace = (y0: number) => (
    <g stroke={LINE} strokeWidth={1.6}>
      <line
        x1={MARGIN + 3 * CELL}
        y1={MARGIN + y0 * CELL}
        x2={MARGIN + 5 * CELL}
        y2={MARGIN + (y0 + 2) * CELL}
      />
      <line
        x1={MARGIN + 5 * CELL}
        y1={MARGIN + y0 * CELL}
        x2={MARGIN + 3 * CELL}
        y2={MARGIN + (y0 + 2) * CELL}
      />
    </g>
  );

  const pieces = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      // The animated mover is drawn in the overlay layer instead.
      if (anim && anim.move.toX === x && anim.move.toY === y) continue;
      const cx = px(x);
      const cy = py(y);
      const isSel = selected?.x === x && selected?.y === y;
      const isLast =
        lastMove &&
        ((lastMove.fromX === x && lastMove.fromY === y) ||
          (lastMove.toX === x && lastMove.toY === y));
      const isCheck = checkAt?.x === x && checkAt?.y === y;
      const isFlipping = flippingId !== null && p.id === flippingId;
      pieces.push(
        <g key={`${x}-${y}`}>
          {isLast && (
            <circle cx={cx} cy={cy} r={32} fill="#f0b429" opacity={0.4} />
          )}
          <g
            className={isFlipping ? "cu-flip" : undefined}
            style={
              isFlipping
                ? ({ transformOrigin: `${cx}px ${cy}px` } as React.CSSProperties)
                : undefined
            }
          >
            <PieceDisc piece={p} x={cx} y={cy} />
          </g>
          {isSel && (
            <circle
              cx={cx}
              cy={cy}
              r={32}
              fill="none"
              stroke="#f0b429"
              strokeWidth={4}
            />
          )}
          {isCheck && (
            <circle
              cx={cx}
              cy={cy}
              r={33}
              fill="none"
              stroke="#e03131"
              strokeWidth={4}
            >
              <animate
                attributeName="opacity"
                values="1;0.25;1"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      );
    }
  }

  const markers = [];
  for (const key of targetSet.quiet) {
    const [x, y] = key.split(",").map(Number);
    markers.push(
      <circle
        key={`t${key}`}
        cx={px(x)}
        cy={py(y)}
        r={8}
        fill="#2f9e44"
        opacity={0.8}
        stroke="#ffffff"
        strokeWidth={1.5}
        strokeOpacity={0.5}
      />
    );
  }
  for (const key of targetSet.captures) {
    const [x, y] = key.split(",").map(Number);
    markers.push(
      <circle
        key={`c${key}`}
        cx={px(x)}
        cy={py(y)}
        r={33}
        fill="none"
        stroke="#e03131"
        strokeWidth={3.5}
      />
    );
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="cu-board-svg"
      style={{ cursor: interactive ? "pointer" : "default", touchAction: "manipulation" }}
      onClick={handleClick}
      role="img"
      aria-label="Cờ Úp board"
    >
      <style>{`
        .cu-flip { animation: cuFlipAnim 0.32s ease-in-out; }
        @keyframes cuFlipAnim {
          0% { transform: scaleX(1); }
          45% { transform: scaleX(0.06); }
          100% { transform: scaleX(1); }
        }
      `}</style>
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2d79c" />
          <stop offset="0.45" stopColor="#eac684" />
          <stop offset="1" stopColor="#d5a55c" />
        </linearGradient>
        <linearGradient id="frameEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a5227" />
          <stop offset="0.5" stopColor="#5e3618" />
          <stop offset="1" stopColor="#7c4a22" />
        </linearGradient>
        <radialGradient id="pieceRed" cx="0.36" cy="0.3" r="0.95">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.55" stopColor="#f7ead0" />
          <stop offset="1" stopColor="#d8bd8d" />
        </radialGradient>
        <radialGradient id="pieceBlack" cx="0.36" cy="0.3" r="0.95">
          <stop offset="0" stopColor="#fdf6ea" />
          <stop offset="0.55" stopColor="#efe2c8" />
          <stop offset="1" stopColor="#c9b48c" />
        </radialGradient>
        <radialGradient id="pieceBack" cx="0.36" cy="0.3" r="0.95">
          <stop offset="0" stopColor="#e8c87a" />
          <stop offset="0.55" stopColor="#c99636" />
          <stop offset="1" stopColor="#9a742a" />
        </radialGradient>
        <filter id="pieceShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="3.5" stdDeviation="3.5" floodOpacity="0.45" />
        </filter>
        <filter id="boardShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* beveled outer frame */}
      <g filter="url(#boardShadow)">
        <rect x={4} y={4} width={W - 8} height={H - 8} rx={14} fill="url(#frameEdge)" />
        <rect
          x={4}
          y={4}
          width={W - 8}
          height={H - 8}
          rx={14}
          fill="none"
          stroke="#3d2410"
          strokeWidth={2}
        />
        <rect x={20} y={20} width={W - 40} height={H - 40} rx={8} fill="url(#wood)" />
        <rect
          x={20}
          y={20}
          width={W - 40}
          height={H - 40}
          rx={8}
          fill="none"
          stroke="#8a5a28"
          strokeWidth={1.5}
          opacity={0.7}
        />
      </g>

      {hLines}
      {vLines}
      {palace(0)}
      {palace(7)}
      {STAR_POINTS.map(([x, y]) => (
        <StarTicks key={`${x}-${y}`} x={x} y={y} />
      ))}
      <text
        x={MARGIN + 1.75 * CELL}
        y={MARGIN + 4.5 * CELL}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={36}
        fontWeight={700}
        fill={LINE}
        opacity={0.85}
        fontFamily="'Noto Serif SC', 'Songti SC', serif"
        letterSpacing={8}
      >
        楚河
      </text>
      <text
        x={MARGIN + 6.25 * CELL}
        y={MARGIN + 4.5 * CELL}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={36}
        fontWeight={700}
        fill={LINE}
        opacity={0.85}
        fontFamily="'Noto Serif SC', 'Songti SC', serif"
        letterSpacing={8}
      >
        漢界
      </text>
      {markers}
      {pieces}

      {/* hint overlay: pulsing rings + animated arrow from → to */}
      {hintMove && !anim && (
        <g key={`hint-${hintMove.fromX}-${hintMove.fromY}-${hintMove.toX}-${hintMove.toY}`}>
          <defs>
            <marker
              id="cu-hint-arrow"
              markerWidth="9"
              markerHeight="9"
              refX="6.5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L7,3 L0,6 Z" fill="#ffd43b" opacity="0.95" />
            </marker>
          </defs>
          {[hintMove.fromX, hintMove.toX].map((hx, i) => {
            const hy = i === 0 ? hintMove.fromY : hintMove.toY;
            return (
              <circle
                key={i}
                cx={px(hx)}
                cy={py(hy)}
                r={30}
                fill="none"
                stroke="#ffd43b"
                strokeWidth={5}
              >
                <animate
                  attributeName="opacity"
                  values="1;0.25;1"
                  dur="1.1s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="r"
                  values="27;34;27"
                  dur="1.1s"
                  repeatCount="indefinite"
                />
              </circle>
            );
          })}
          <line
            x1={px(hintMove.fromX)}
            y1={py(hintMove.fromY)}
            x2={px(hintMove.toX)}
            y2={py(hintMove.toY)}
            stroke="#ffd43b"
            strokeWidth={7}
            opacity={0.8}
            strokeLinecap="round"
            strokeDasharray="14 10"
            markerEnd="url(#cu-hint-arrow)"
          >
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-24"
              dur="0.7s"
              repeatCount="indefinite"
            />
          </line>
        </g>
      )}

      {/* move / fight animation overlay — pure CSS (no SMIL), restarted by key */}
      {anim && (
        <g key={anim.id}>
          {/* turquoise trail line from origin to destination */}
          <line
            x1={px(anim.move.fromX)}
            y1={py(anim.move.fromY)}
            x2={px(anim.move.toX)}
            y2={py(anim.move.toY)}
            stroke="#40e0d0"
            strokeWidth={16}
            strokeLinecap="round"
            className="cu-trail"
            style={{ "--td": animSlow ? "1.4s" : "1s" } as React.CSSProperties}
          />
          {/* expanding turquoise ring at the origin square */}
          <circle
            cx={px(anim.move.fromX)}
            cy={py(anim.move.fromY)}
            r={50}
            fill="none"
            stroke="#40e0d0"
            strokeWidth={8}
            className="cu-ring"
            style={{ "--td": animSlow ? "1.4s" : "1s" } as React.CSSProperties}
          />
          {/* gliding piece with turquoise halo */}
          <g
            className="cu-glide"
            style={
              {
                "--gx": `${px(anim.move.fromX) - px(anim.move.toX)}px`,
                "--gy": `${py(anim.move.fromY) - py(anim.move.toY)}px`,
                "--gd": animSlow ? "1.2s" : animTrail ? "0.9s" : "0.55s",
              } as React.CSSProperties
            }
          >
            <g transform={`translate(${px(anim.move.toX)} ${py(anim.move.toY)})`}>
              <circle
                r={44}
                fill="#40e0d0"
                className="cu-halo"
                style={{ "--td": animSlow ? "1.4s" : "1s" } as React.CSSProperties}
              />
              <PieceDisc piece={anim.piece} x={0} y={0} />
            </g>
          </g>
          {anim.captured ? (
            <Clash
              x={px(anim.move.toX)}
              y={py(anim.move.toY)}
              captured={anim.captured}
              fromX={px(anim.move.fromX)}
              fromY={py(anim.move.fromY)}
            />
          ) : (
            <Ripple x={px(anim.move.toX)} y={py(anim.move.toY)} />
          )}
        </g>
      )}
    </svg>
  );
}
