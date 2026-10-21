import { PIECE_CHARS, type ViewBoard } from "./types";

export interface ShareCardInput {
  /** Final position as the player saw it ([y][x], y=0 is Black's back
   *  rank). Covered pieces render as brass backs. */
  board: ViewBoard;
  /** Main headline, e.g. "Tôi đã thắng máy Cấp 7! 🏆" */
  title: string;
  /** Second line, e.g. "32 nước đi · Khai cuộc Pháo đầu" */
  subtitle: string;
  /** Footer CTA, e.g. "Thách đấu ngay 👉 cotuongup.synerworlds.com" */
  footer: string;
}

const W = 1080;
const H = 1400;
const CELL = 92;
const BOARD_PX = CELL * 8; // 736
const BOARD_PY = CELL * 9; // 828
const PAD = 50; // half-cell margin around the grid
const BX = (W - (BOARD_PX + PAD * 2)) / 2; // board area origin
const BY = 300;

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** Render a shareable result card (board + headline) to a canvas. */
export function renderShareCard(input: ShareCardInput): HTMLCanvasElement {
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
  ctx.font = "700 72px Georgia, 'Times New Roman', serif";
  ctx.fillText("🃏 CỜ ÚP", W / 2, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillText(input.title, W / 2, 196);
  ctx.fillStyle = "#e8d9b0";
  ctx.font = "400 36px system-ui, sans-serif";
  ctx.fillText(input.subtitle, W / 2, 252);

  // Board paper.
  const gx = BX + PAD;
  const gy = BY + PAD;
  ctx.fillStyle = "#f0d9a8";
  roundRect(ctx, BX, BY, BOARD_PX + PAD * 2, BOARD_PY + PAD * 2, 18);
  ctx.fill();
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 3;
  roundRect(ctx, BX, BY, BOARD_PX + PAD * 2, BOARD_PY + PAD * 2, 18);
  ctx.stroke();

  paintBoard(ctx, input.board, gx, gy, CELL);

  // Footer CTA.
  ctx.fillStyle = "#f3d27a";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText(input.footer, W / 2, BY + BOARD_PY + PAD * 2 + 52);

  return canvas;
}

/**
 * Board geometry shared by all cards: grid + palace + river + star
 * points + pieces, scaled to `cell` px per intersection. Pixel-identical
 * to the previous inline renderer for cell = 92.
 */
export function paintBoard(
  ctx: CanvasRenderingContext2D,
  board: ViewBoard,
  gx: number,
  gy: number,
  cell: number
): void {
  const px8 = cell * 8;
  const py9 = cell * 9;
  const lw = cell >= 80 ? 3 : 2;
  // Grid lines.
  ctx.strokeStyle = "#5d3a1a";
  ctx.lineWidth = lw;
  for (let x = 0; x <= 8; x++) {
    const px = gx + x * cell;
    if (x === 0 || x === 8) {
      line(ctx, px, gy, px, gy + py9);
    } else {
      line(ctx, px, gy, px, gy + cell * 4);
      line(ctx, px, gy + cell * 5, px, gy + py9);
    }
  }
  for (let y = 0; y <= 9; y++) {
    line(ctx, gx, gy + y * cell, gx + px8, gy + y * cell);
  }
  // Palace diagonals.
  line(ctx, gx + 3 * cell, gy, gx + 5 * cell, gy + 2 * cell);
  line(ctx, gx + 5 * cell, gy, gx + 3 * cell, gy + 2 * cell);
  line(ctx, gx + 3 * cell, gy + 7 * cell, gx + 5 * cell, gy + 9 * cell);
  line(ctx, gx + 5 * cell, gy + 7 * cell, gx + 3 * cell, gy + 9 * cell);
  // River label.
  ctx.fillStyle = "#5d3a1a";
  ctx.font = `400 ${Math.round(cell * 0.435)}px serif`;
  ctx.fillText("楚河", gx + 2 * cell, gy + 4.5 * cell);
  ctx.fillText("漢界", gx + 6 * cell, gy + 4.5 * cell);

  // Star points.
  const stars: Array<[number, number]> = [
    [1, 2], [7, 2], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
    [1, 3], [7, 3], [1, 6], [7, 6],
    [0, 6], [2, 6], [4, 6], [6, 6], [8, 6], [1, 7], [7, 7],
  ];
  ctx.fillStyle = "#5d3a1a";
  const sr = Math.max(3, Math.round(cell * 0.054));
  for (const [sx, sy] of stars) {
    ctx.beginPath();
    ctx.arc(gx + sx * cell, gy + sy * cell, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pieces.
  const r = Math.round(cell * 0.4565);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y]?.[x];
      if (!p) continue;
      const px = gx + x * cell;
      const py = gy + y * cell;
      // Shadow.
      ctx.beginPath();
      ctx.arc(
        px + Math.round(cell * 0.033),
        py + Math.round(cell * 0.054),
        r,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
      // Piece body. A covered piece is a brass back (double ring, host
      // glyph at low opacity) — its true identity is never drawn.
      const grad = ctx.createRadialGradient(px - 10, py - 12, 6, px, py, r);
      if (p.covered) {
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
      ctx.lineWidth = lw;
      ctx.strokeStyle = p.covered
        ? p.color === "red"
          ? "#93262e"
          : "#3a3230"
        : "#7a4d12";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, Math.round(cell * 0.37), 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#b57e1e";
      ctx.stroke();
      // Character.
      ctx.font = `700 ${Math.round(
        cell * 0.565
      )}px 'Noto Sans SC', 'PingFang SC', serif`;
      if (p.covered) {
        ctx.save();
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = "#6e4d14";
        ctx.fillText(
          PIECE_CHARS[p.color][p.hostType],
          px,
          py + Math.round(cell * 0.022)
        );
        ctx.restore();
      } else {
        ctx.fillStyle = p.color === "red" ? "#c0392b" : "#1a1a1a";
        ctx.fillText(
          PIECE_CHARS[p.color][p.faceType],
          px,
          py + Math.round(cell * 0.022)
        );
      }
    }
  }
}

export function roundRect(
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
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Convert a canvas to a shareable PNG File. */
export function canvasToPngFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("render_failed"));
        return;
      }
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png");
  });
}

export interface RoomPromoInput {
  /** Room display name. */
  roomName: string;
  /** Join code, e.g. "X7K2P". */
  code: string;
  /** "3 người đang chơi" style member line. */
  memberLine: string;
  /** Footer CTA, e.g. "Tham gia ngay 👉 cotuongup.synerworlds.com" */
  footer: string;
}

/** Render a shareable room-promo card (no board, big join code). */
export function renderRoomPromoCard(input: RoomPromoInput): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#3d2b16");
  bg.addColorStop(0.5, "#2e2010");
  bg.addColorStop(1, "#241a0c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Header.
  ctx.fillStyle = "#f3d27a";
  ctx.font = "700 72px Georgia, 'Times New Roman', serif";
  ctx.fillText("🃏 CỜ ÚP", W / 2, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 52px system-ui, sans-serif";
  const name = input.roomName.length > 28 ? input.roomName.slice(0, 27) + "…" : input.roomName;
  ctx.fillText(name, W / 2, 210, W - 120);
  ctx.fillStyle = "#e8d9b0";
  ctx.font = "400 36px system-ui, sans-serif";
  ctx.fillText(input.memberLine, W / 2, 275, W - 120);

  // Big code panel.
  const pw = 720;
  const ph = 420;
  const px = (W - pw) / 2;
  const py = 380;
  ctx.fillStyle = "#f0d9a8";
  roundRect(ctx, px, py, pw, ph, 24);
  ctx.fill();
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 4;
  roundRect(ctx, px, py, pw, ph, 24);
  ctx.stroke();
  ctx.fillStyle = "#5d3a1a";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText("MÃ PHÒNG", W / 2, py + 90);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "800 130px system-ui, sans-serif";
  ctx.fillText(input.code, W / 2, py + 230);
  ctx.fillStyle = "#5d3a1a";
  ctx.font = "400 32px system-ui, sans-serif";
  ctx.fillText("Nhập mã để vào phòng", W / 2, py + 350);

  // Decorative mini pieces.
  const pieces: Array<[string, string]> = [["俥", "#c0392b"], ["馬", "#2c2c2c"], ["炮", "#c0392b"]];
  ctx.font = "700 64px serif";
  pieces.forEach(([ch, col], i) => {
    const cx = W / 2 + (i - 1) * 170;
    const cy = 950;
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = "#f7e9c4";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#7a4d12";
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillText(ch, cx, cy + 2);
  });

  // Footer CTA.
  ctx.fillStyle = "#ffd43b";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText(input.footer, W / 2, 1120, W - 120);

  return canvas;
}
