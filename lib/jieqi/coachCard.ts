// Shareable coach-review card: final board + accuracy + headline mistakes.
// 1080×1350, same visual language as the other cards (shareCard.ts).

import { paintBoard, roundRect } from "./shareCard";
import type { ViewBoard } from "./types";

export interface CoachCardMistake {
  /** Short headline, e.g. "?! Nước 12 · Pháo đỏ 1,7→4,7". */
  headline: string;
  /** Detail line, e.g. "Tốt hơn: Mã đỏ 2,0→3,2 · +1.2 → −0.8". */
  detail: string;
}

export interface CoachCardInput {
  /** Final board position ([y][x], y=0 is Black's back rank). */
  board: ViewBoard;
  /** Result headline, e.g. "Tôi đã thắng máy Cấp 5! 🏆" */
  title: string;
  /** Accuracy line, e.g. "Độ chính xác: 72/100". */
  accuracyLine: string;
  /** Up to 3 headline mistakes. */
  mistakes: CoachCardMistake[];
  /** Footer CTA, e.g. "Thách đấu ngay 👉 cotuongup.synerworlds.com" */
  footer: string;
}

const W = 1080;
const H = 1350;

/** Draw centered text, shrinking the font until it fits maxWidth. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  basePx: number,
  weight: number,
  color: string,
  font = "system-ui, sans-serif"
): void {
  let px = basePx;
  ctx.font = `${weight} ${px}px ${font}`;
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${font}`;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, cx, y);
}

/** Render the coach review card to a canvas (1080×1350). */
export function renderCoachCard(input: CoachCardInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background: dark wood gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#3d2b16");
  bg.addColorStop(0.5, "#2e2010");
  bg.addColorStop(1, "#241a0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Gold frame.
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Header.
  ctx.fillStyle = "#f3d27a";
  ctx.font = "700 64px Georgia, 'Times New Roman', serif";
  ctx.fillText("🃏 CỜ ÚP", W / 2, 88);
  fitText(ctx, input.title, W / 2, 168, W - 120, 44, 600, "#ffffff");
  fitText(ctx, input.accuracyLine, W / 2, 240, W - 120, 46, 700, "#ffd43b");

  // Board paper.
  const cell = 56;
  const pad = 36;
  const bw = cell * 8 + pad * 2;
  const bh = cell * 9 + pad * 2;
  const bx = (W - bw) / 2;
  const by = 292;
  ctx.fillStyle = "#f0d9a8";
  roundRect(ctx, bx, by, bw, bh, 16);
  ctx.fill();
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 3;
  roundRect(ctx, bx, by, bw, bh, 16);
  ctx.stroke();
  paintBoard(ctx, input.board, bx + pad, by + pad, cell);

  // Mistakes.
  const rows = input.mistakes.slice(0, 3);
  let y = by + bh + 52;
  rows.forEach((m, i) => {
    fitText(ctx, m.headline, W / 2, y, W - 140, 36, 700, "#ff9d6b");
    y += 46;
    fitText(ctx, m.detail, W / 2, y, W - 140, 32, 400, "#e8d9b0");
    y += i === rows.length - 1 ? 0 : 34;
  });

  // Footer CTA.
  ctx.fillStyle = "#f3d27a";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.fillText(input.footer, W / 2, H - 68, W - 120);

  return canvas;
}
