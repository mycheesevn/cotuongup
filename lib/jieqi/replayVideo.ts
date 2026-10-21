// Replay-to-video export: re-render a game on canvas with move animations,
// capture it with canvas.captureStream + MediaRecorder, and return a video file.
// Runs fully client-side; Safari records MP4, Chrome records WebM.

import {
  applyMove,
  effectiveType,
  gameStatus,
  initialState,
  isInCheck,
  viewBoard,
} from "./engine";
import { decodeMove } from "./analysis";
import {
  PIECE_CHARS,
  opposite,
  type Color,
  type JieqiState,
  type Move,
  type MoveRecord,
  type ViewBoard,
  type ViewPiece,
} from "./types";
import { moveEntryText } from "./notation";
import { synthCapture, synthCheck, synthMove, synthMoveStart } from "./sound";
import { STR, type Lang } from "./i18n";

export interface ReplayVideoInput {
  moveCodes: string[];
  /** True start state (the deal / setup position). Defaults to a fresh
   *  seed-0 deal when omitted. */
  startState?: JieqiState;
  /** Headline, e.g. "Tôi đã thắng máy Cấp 7! 🏆" */
  title: string;
  /** Second line, e.g. "32 nước · Khai cuộc Pháo đầu" */
  subtitle: string;
  lang: Lang;
  /** Playback speed multiplier (0.5 = half speed, slower). Defaults to 1. */
  speed?: number;
  /** Optional microphone stream mixed in as voice commentary. */
  micStream?: MediaStream | null;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

const VW = 720;
const VH = 960;
const CELL = 62;
const PAD = 34;
const GRID_W = CELL * 8;
const GRID_H = CELL * 9;
const BX = (VW - (GRID_W + PAD * 2)) / 2;
const BY = 218;
const GX = BX + PAD;
const GY = BY + PAD;

const TITLE_DUR = 2.0;
const END_DUR = 2.0;
/** Decisive-finish celebration (final board + banner + confetti,
 *  NO card) before the outro card — family-standard timeline. */
const FINISH_DUR = 2.2;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  piece: ViewPiece,
  alpha = 1,
  scale = 1
) {
  const r = 28 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(px + 3, py + 5, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();
  const grad = ctx.createRadialGradient(px - 9, py - 11, 5, px, py, r);
  if (piece.covered) {
    grad.addColorStop(0, "#e8c87a");
    grad.addColorStop(0.7, "#c99636");
    grad.addColorStop(1, "#9a742a");
  } else {
    grad.addColorStop(0, "#fff6dd");
    grad.addColorStop(0.7, "#f3d98b");
    grad.addColorStop(1, "#d9a83f");
  }
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = piece.covered
    ? piece.color === "red"
      ? "#93262e"
      : "#3a3230"
    : "#7a4d12";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, r - 7, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#b57e1e";
  ctx.stroke();
  ctx.font = `700 ${Math.round(36 * scale)}px 'Noto Sans SC', 'PingFang SC', serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (piece.covered) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.42;
    ctx.fillStyle = "#6e4d14";
    ctx.fillText(PIECE_CHARS[piece.color][piece.hostType], px, py + 2);
    ctx.restore();
  } else {
    ctx.fillStyle = piece.color === "red" ? "#c0392b" : "#1a1a1a";
    ctx.fillText(PIECE_CHARS[piece.color][piece.faceType], px, py + 2);
  }
  ctx.restore();
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x, y, r);
  ctx.closePath();
}

function drawBoardBase(ctx: CanvasRenderingContext2D) {
  // Board paper.
  ctx.fillStyle = "#f0d9a8";
  rr(ctx, BX, BY, GRID_W + PAD * 2, GRID_H + PAD * 2, 14);
  ctx.fill();
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 3;
  rr(ctx, BX, BY, GRID_W + PAD * 2, GRID_H + PAD * 2, 14);
  ctx.stroke();

  // Grid lines.
  ctx.strokeStyle = "#5d3a1a";
  ctx.lineWidth = 2.5;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  for (let x = 0; x <= 8; x++) {
    const px = GX + x * CELL;
    if (x === 0 || x === 8) line(px, GY, px, GY + GRID_H);
    else {
      line(px, GY, px, GY + CELL * 4);
      line(px, GY + CELL * 5, px, GY + GRID_H);
    }
  }
  for (let y = 0; y <= 9; y++) {
    line(GX, GY + y * CELL, GX + GRID_W, GY + y * CELL);
  }
  // Palace diagonals.
  line(GX + 3 * CELL, GY, GX + 5 * CELL, GY + 2 * CELL);
  line(GX + 5 * CELL, GY, GX + 3 * CELL, GY + 2 * CELL);
  line(GX + 3 * CELL, GY + 7 * CELL, GX + 5 * CELL, GY + 9 * CELL);
  line(GX + 5 * CELL, GY + 7 * CELL, GX + 3 * CELL, GY + 9 * CELL);
  // River label.
  ctx.fillStyle = "#5d3a1a";
  ctx.font = "400 30px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("楚河", GX + 2 * CELL, GY + 4.5 * CELL);
  ctx.fillText("漢界", GX + 6 * CELL, GY + 4.5 * CELL);
  // Star points.
  const stars: Array<[number, number]> = [
    [1, 2], [7, 2], [1, 3], [7, 3], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
    [1, 6], [7, 6], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6], [1, 7], [7, 7],
  ];
  ctx.fillStyle = "#5d3a1a";
  for (const [sx, sy] of stars) {
    ctx.beginPath();
    ctx.arc(GX + sx * CELL, GY + sy * CELL, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPieces(
  ctx: CanvasRenderingContext2D,
  board: ViewBoard,
  skip?: { x: number; y: number } | null,
  capturedFade?: { x: number; y: number; alpha: number } | null,
  mover?: { piece: ViewPiece; px: number; py: number } | null
) {
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      if (skip && skip.x === x && skip.y === y) continue;
      const p = board[y]?.[x];
      if (!p) continue;
      let alpha = 1;
      if (capturedFade && capturedFade.x === x && capturedFade.y === y) {
        alpha = capturedFade.alpha;
        if (alpha <= 0) continue;
      }
      drawPiece(ctx, GX + x * CELL, GY + y * CELL, p, alpha);
    }
  }
  if (mover) {
    drawPiece(ctx, mover.px, mover.py, mover.piece, 1, 1.07);
  }
}

function drawHighlight(ctx: CanvasRenderingContext2D, m: Move) {
  ctx.save();
  ctx.strokeStyle = "#ffd43b";
  ctx.lineWidth = 4;
  for (const [x, y] of [
    [m.fromX, m.fromY],
    [m.toX, m.toY],
  ]) {
    ctx.beginPath();
    ctx.arc(GX + x * CELL, GY + y * CELL, 33, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

const CONFETTI_COLORS = ["#ffd43b", "#e2483d", "#f3d27a", "#ffffff", "#d4a017"];
interface Confetto {
  x0: number; vx: number; vy: number; size: number;
  color: string; rot: number; vrot: number; delay: number;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeConfetti(seed: number): Confetto[] {
  const rnd = mulberry32(seed);
  const out: Confetto[] = [];
  const bursts: Array<[number, number]> = [[0, 0.5], [0.55, 0.18], [1.1, 0.82]];
  for (const [delay, cx] of bursts) {
    for (let i = 0; i < 46; i++) {
      out.push({
        x0: cx + (rnd() - 0.5) * 0.14,
        vx: (rnd() - 0.5) * 0.36,
        vy: 0.52 + rnd() * 0.5,
        size: 7 + rnd() * 8,
        color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
        rot: rnd() * Math.PI,
        vrot: (rnd() - 0.5) * 9,
        delay,
      });
    }
  }
  return out;
}
function drawConfetti(
  ctx: CanvasRenderingContext2D,
  parts: Confetto[],
  age: number
) {
  for (const p of parts) {
    const t = age - p.delay;
    if (t <= 0) continue;
    const x = (p.x0 + p.vx * t) * VW;
    const y = (-0.05 + p.vy * t + 0.55 * t * t) * VH;
    if (y > VH + 20) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rot + p.vrot * t);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const cands = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];
  for (const c of cands) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Render the game replay to a video file. Rejects on cancel or unsupported. */
export async function exportReplayVideo(input: ReplayVideoInput): Promise<File> {
  const { moveCodes, lang, onProgress, signal } = input;
  const start = input.startState ?? initialState(0);
  const mime = pickMime();
  const canvas = document.createElement("canvas");
  if (!mime || typeof canvas.captureStream !== "function") {
    throw new Error("unsupported");
  }
  canvas.width = VW;
  canvas.height = VH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unsupported");

  // Precompute one state (and its render model) per ply, plus the move
  // records (flip / capture events drive the animation + soundtrack).
  const states: JieqiState[] = [start];
  const records: MoveRecord[] = [];
  for (let i = 0; i < moveCodes.length; i++) {
    const r = applyMove(states[i], decodeMove(moveCodes[i]));
    states.push(r.state);
    records.push(r.record);
  }
  const boards: ViewBoard[] = states.map((st) => viewBoard(st));
  const moves: Move[] = moveCodes.map(decodeMove);
  const n = moves.length;
  // Detect checkmate from the final position for the end banner.
  const endStatus = n > 0 ? gameStatus(states[n]) : null;
  const mateText =
    endStatus?.reason === "checkmate" ? STR[input.lang].checkmateBanner : null;
  // Decisive = the game produced a winner (checkmate OR stalemate —
  // in xiangqi both are wins). Only then does the video celebrate.
  const decisive = !!endStatus?.winner;
  const finishText = mateText ?? (decisive ? input.title : null);
  const confetti = decisive ? makeConfetti(20261014 + n) : [];
  const speed =
    input.speed && input.speed > 0
      ? Math.min(2, Math.max(0.25, input.speed))
      : 1;
  const GLIDE = 0.6 / speed;
  const HOLD = 1.0 / speed;
  const PER = GLIDE + HOLD;
  const total = TITLE_DUR + n * PER + (decisive ? FINISH_DUR : 0) + END_DUR;

  const drawFrame = (t: number) => {
    // Background.
    const bg = ctx.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, "#3d2b16");
    bg.addColorStop(0.5, "#2e2010");
    bg.addColorStop(1, "#241a0c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VW, VH);
    ctx.strokeStyle = "#d4a017";
    ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, VW - 28, VH - 28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let board = boards[0];
    let caption: string | null = null;
    let anim: {
      move: Move;
      p: number;
      piece: ViewPiece;
      captured: boolean;
    } | null = null;
    let lastMove: Move | null = null;
    let trailRemnant: { move: Move; q: number } | null = null;
    let card: { title: string; subtitle: string } | null = null;
    let showMate = false;
    let finishAge = -1;

    if (t < TITLE_DUR) {
      card = { title: input.title, subtitle: input.subtitle };
    } else {
      const mt = t - TITLE_DUR;
      const idx = Math.floor(mt / PER);
      if (idx >= n) {
        board = boards[n];
        lastMove = n > 0 ? moves[n - 1] : null;
        const ft = mt - n * PER;
        if (decisive && ft < FINISH_DUR) {
          // Celebration: final board at full brightness, result
          // banner, confetti — the outro card comes after.
          finishAge = ft;
          showMate = !!finishText;
        } else {
          card = { title: input.title, subtitle: input.subtitle };
        }
      } else {
        const lt = mt - idx * PER;
        const m = moves[idx];
        board = boards[idx];
        const piece = board[m.fromY]?.[m.fromX];
        if (lt < GLIDE && piece) {
          const p01 = lt / GLIDE;
          // Flip plies: the disc shows its brass back for the first half
          // of the glide, then the revealed face (state already flipped).
          const landed = boards[idx + 1][m.toY]?.[m.toX];
          anim = {
            move: m,
            p: easeInOut(p01),
            piece:
              records[idx].flipped && p01 >= 0.5 && landed ? landed : piece,
            captured: !!board[m.toY]?.[m.toX],
          };
        } else {
          board = boards[idx + 1];
          lastMove = m;
          // Let the trail linger briefly after the piece lands.
          const holdT = lt - GLIDE;
          if (holdT < 0.45) trailRemnant = { move: m, q: 1 - holdT / 0.45 };
        }
        const mv = moves[idx];
        const pc = states[idx].board[mv.fromY]?.[mv.fromX];
        caption = pc
          ? `${idx + 1}/${n} · ${moveEntryText(pc.color, effectiveType(pc), mv, lang, records[idx])}`
          : `${idx + 1}/${n}`;
      }
    }

    // Slim header during play.
    ctx.fillStyle = "#f3d27a";
    ctx.font = "700 44px Georgia, serif";
    ctx.fillText("🃏 CỜ ÚP", VW / 2, 62);
    if (!card) {
      ctx.fillStyle = "#e8d9b0";
      ctx.font = "400 27px system-ui, sans-serif";
      ctx.fillText(input.title, VW / 2, 112, VW - 80);
    }

    drawBoardBase(ctx);

    if (anim) {
      const { move: m, p, piece, captured } = anim;
      // Turquoise trail from→to: full strength while gliding, fades at the end.
      const fade = p < 0.75 ? 1 : (1 - p) / 0.25;
      ctx.save();
      ctx.strokeStyle = "#40e0d0";
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.85 * fade;
      ctx.lineWidth = 5 + 11 * fade;
      ctx.beginPath();
      ctx.moveTo(GX + m.fromX * CELL, GY + m.fromY * CELL);
      ctx.lineTo(GX + m.toX * CELL, GY + m.toY * CELL);
      ctx.stroke();
      // Expanding ring at the origin square — visible even on 1-square moves.
      ctx.globalAlpha = 0.9 * (1 - p);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(
        GX + m.fromX * CELL,
        GY + m.fromY * CELL,
        24 + 18 * p,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
      const px = GX + (m.fromX + (m.toX - m.fromX) * p) * CELL;
      const py = GY + (m.fromY + (m.toY - m.fromY) * p) * CELL;
      // Halo traveling with the piece — visible on every move.
      ctx.save();
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = "#40e0d0";
      ctx.beginPath();
      ctx.arc(px, py, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawPieces(
        ctx,
        board,
        { x: m.fromX, y: m.fromY },
        captured ? { x: m.toX, y: m.toY, alpha: Math.max(0, 1 - p * 2) } : null,
        { piece, px, py }
      );
    } else {
      // Fading trail remnant just after the piece lands.
      if (trailRemnant) {
        const m = trailRemnant.move;
        ctx.save();
        ctx.strokeStyle = "#40e0d0";
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.7 * trailRemnant.q;
        ctx.lineWidth = 5 + 9 * trailRemnant.q;
        ctx.beginPath();
        ctx.moveTo(GX + m.fromX * CELL, GY + m.fromY * CELL);
        ctx.lineTo(GX + m.toX * CELL, GY + m.toY * CELL);
        ctx.stroke();
        ctx.restore();
      }
      drawPieces(ctx, board);
      if (lastMove) drawHighlight(ctx, lastMove);
    }

    // Bottom caption.
    if (caption && !card) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 30px system-ui, sans-serif";
      ctx.fillText(caption, VW / 2, 906, VW - 80);
    }

    // Result banner during the finish celebration — gold on black,
    // like the in-game checkmate banner.
    if (showMate && finishText) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
      const bw = VW - 160;
      const bh = 110;
      const bx = (VW - bw) / 2;
      const by = VH / 2 - bh / 2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = "#ffd43b";
      ctx.lineWidth = 4;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = "#ffd43b";
      ctx.font = "700 56px Georgia, serif";
      ctx.fillText(finishText, VW / 2, VH / 2, bw - 40);
      ctx.restore();
    }

    if (finishAge >= 0) drawConfetti(ctx, confetti, finishAge);

    // Title / end card overlay.
    if (card) {
      ctx.fillStyle = "rgba(10, 6, 2, 0.62)";
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = "#f3d27a";
      ctx.font = "700 64px Georgia, serif";
      ctx.fillText("🃏 CỜ ÚP", VW / 2, VH / 2 - 120);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 44px system-ui, sans-serif";
      ctx.fillText(card.title, VW / 2, VH / 2 - 30, VW - 80);
      ctx.fillStyle = "#e8d9b0";
      ctx.font = "400 34px system-ui, sans-serif";
      ctx.fillText(card.subtitle, VW / 2, VH / 2 + 36, VW - 80);
      ctx.fillStyle = "#ffd43b";
      ctx.font = "700 32px system-ui, sans-serif";
      ctx.fillText(STR[input.lang].replaySiteCta, VW / 2, VH / 2 + 96, VW - 80);
    }
  };

  const stream = canvas.captureStream(30);

  // Recorded soundtrack: synthesized move / capture / check sounds,
  // scheduled on the video timeline through a MediaStreamDestination.
  let actx: AudioContext | null = null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    actx = new AC();
    if (actx.state === "suspended") await actx.resume();
    const dest = actx.createMediaStreamDestination();
    const track = dest.stream.getAudioTracks()[0];
    if (track) stream.addTrack(track);
    // Optional microphone commentary mixed into the recording.
    if (input.micStream) {
      try {
        actx.createMediaStreamSource(input.micStream).connect(dest);
      } catch {
        /* ignore */
      }
    }
    moves.forEach((m, i) => {
      const t0 = TITLE_DUR + i * PER;
      if (records[i].captured) synthCapture(dest, t0 + 0.04);
      synthMoveStart(dest, t0);
      synthMove(dest, t0 + GLIDE);
      const mover = states[i].turn;
      if (isInCheck(states[i + 1].board, opposite(mover)))
        synthCheck(dest, t0 + GLIDE + 0.1);
    });
  } catch {
    actx = null; // audio unavailable — keep recording silent
  }

  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 2_500_000,
  });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    rec.onerror = () => reject(new Error("record_failed"));
  });

  let raf = 0;
  let lastPct = -1;
  let cancelled = false;
  const onAbort = () => {
    cancelled = true;
  };
  signal?.addEventListener("abort", onAbort);

  try {
    rec.start(250);
    const t0 = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (cancelled || signal?.aborted) {
          reject(new Error("cancelled"));
          return;
        }
        const t = (performance.now() - t0) / 1000;
        if (t >= total) {
          drawFrame(total);
          resolve();
          return;
        }
        drawFrame(t);
        const pct = Math.floor((t / total) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress?.(pct / 100);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    cancelAnimationFrame(raf);
    signal?.removeEventListener("abort", onAbort);
    if (rec.state !== "inactive") rec.stop();
    if (actx) {
      try {
        await actx.close();
      } catch {
        /* ignore */
      }
    }
  }

  const blob = await finished;
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `co-up-replay.${ext}`, { type: mime });
}
