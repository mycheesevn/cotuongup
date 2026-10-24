import { canvasToPngFile } from "./shareCard";
import { shareLink, shareResultCard, type ShareOutcome } from "./share";
import type { Lang } from "./i18n";

export type AchievementKind = "streak" | "rank" | "profile";

export interface AchievementData {
  /** Localized headline, e.g. fmt(s.achStreakTitle, { days }). */
  title: string;
  days?: number;
  rank?: number;
  displayName?: string;
  playerTitle?: string;
  rating?: number;
  level?: number;
}

const W = 1080;
const H = 1350;

function ctaFor(lang: Lang): string {
  return lang === "vi"
    ? "👉 Chơi miễn phí tại cotuongup.synerworlds.com"
    : "👉 Play free at cotuongup.synerworlds.com";
}

function unitFor(kind: AchievementKind, lang: Lang): string {
  if (kind === "streak")
    return lang === "vi" ? "ngày liên tiếp" : "days in a row";
  return "";
}

/** Word-wrap a string to lines that fit maxWidth. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Render a shareable achievement card (no board, giant stat). */
export function renderAchievementCard(
  kind: AchievementKind,
  data: AchievementData,
  lang: Lang
): HTMLCanvasElement {
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
  ctx.fillText("象棋 CỜ TƯỚNG", W / 2, 110);

  // Title (wrapped).
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 54px system-ui, sans-serif";
  const titleLines = wrap(ctx, data.title, W - 140);
  titleLines.slice(0, 3).forEach((ln, i) => {
    ctx.fillText(ln, W / 2, 215 + i * 68);
  });
  const afterTitle = 215 + Math.min(titleLines.length, 3) * 68;

  // Giant stat block.
  const cy = Math.max(afterTitle + 180, 560);
  if (kind === "streak") {
    ctx.fillStyle = "#ffd43b";
    ctx.font = "800 300px system-ui, sans-serif";
    ctx.fillText(String(data.days ?? 0), W / 2, cy);
    ctx.fillStyle = "#e8d9b0";
    ctx.font = "600 52px system-ui, sans-serif";
    ctx.fillText(unitFor(kind, lang), W / 2, cy + 200);
  } else if (kind === "rank") {
    ctx.fillStyle = "#ffd43b";
    ctx.font = "800 260px system-ui, sans-serif";
    ctx.fillText(`#${data.rank ?? 0}`, W / 2, cy);
    ctx.font = "160px serif";
    ctx.fillText("🏆", W / 2, cy + 230);
  } else {
    // profile
    ctx.font = "220px serif";
    ctx.fillText("🏆", W / 2, cy - 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 72px system-ui, sans-serif";
    const name = (data.displayName ?? "").slice(0, 24) || "—";
    ctx.fillText(name, W / 2, cy + 170, W - 140);
    ctx.fillStyle = "#f3d27a";
    ctx.font = "500 44px system-ui, sans-serif";
    const line = `${data.playerTitle ?? ""} · ${data.rating ?? 0} Elo · ${
      lang === "vi" ? "Cấp" : "Level"
    } ${data.level ?? 1}`;
    ctx.fillText(line, W / 2, cy + 250, W - 120);
  }

  // Decorative piece medallions.
  const pieces: Array<[string, string]> = [
    ["將", "#c0392b"],
    ["俥", "#2c2c2c"],
    ["馬", "#c0392b"],
  ];
  ctx.font = "700 64px serif";
  pieces.forEach(([ch, col], i) => {
    const cx = W / 2 + (i - 1) * 170;
    const cyy = 1060;
    ctx.beginPath();
    ctx.arc(cx, cyy, 52, 0, Math.PI * 2);
    ctx.fillStyle = "#f7e9c4";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#7a4d12";
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillText(ch, cx, cyy + 2);
  });

  // Footer CTA.
  ctx.fillStyle = "#ffd43b";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText(ctaFor(lang), W / 2, 1200, W - 120);

  return canvas;
}

/**
 * Render an achievement card and share it via the native share sheet
 * (PNG-download fallback). Returns the share outcome for the caller to toast.
 */
export async function shareAchievement(
  kind: AchievementKind,
  data: AchievementData,
  lang: Lang
): Promise<ShareOutcome> {
  const canvas = renderAchievementCard(kind, data, lang);
  const fileName = `achievement-${kind}.png`;
  const file = await canvasToPngFile(canvas, fileName);
  const levelLabel = lang === "vi" ? "Cấp" : "Level";
  const text =
    kind === "profile"
      ? `${data.title}\n${data.displayName ?? ""} — ${
          data.playerTitle ?? ""
        } · ${data.rating ?? 0} Elo · ${levelLabel} ${data.level ?? 1}`
      : data.title;
  return shareResultCard({
    file,
    fileName,
    title: data.title,
    text,
    url: await shareLink("/"),
  });
}
