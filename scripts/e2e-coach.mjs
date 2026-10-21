// E2E for the post-game coach review.
// Flow: vs-computer game (level 1, 1-minute clock) → play 3 red moves →
// let the clock run out (timeout = game over) → open coach review →
// assert accuracy + sections → share card pixel check.
// Run: npm run build && PORT=3109 npm start -- -p 3109 & then
//      PORT=3109 node scripts/e2e-coach.mjs
import { chromium } from "playwright-core";

const PORT = process.env.PORT || 3109;
const BASE = `http://127.0.0.1:${PORT}`;
const EXE =
  "/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";

const results = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  results.push(!!cond);
};

async function clickSquare(page, bx, by) {
  const pt = await page.evaluate(
    ([x, y]) => {
      const svg = document.querySelector(".cu-board-fit svg");
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const W = 600;
      const H = 664;
      const MARGIN = 44;
      const CELL = 64;
      const scale = Math.min(rect.width / W, rect.height / H);
      const offX = (rect.width - W * scale) / 2;
      const offY = (rect.height - H * scale) / 2;
      return [
        rect.left + offX + (MARGIN + x * CELL) * scale,
        rect.top + offY + (MARGIN + y * CELL) * scale,
      ];
    },
    [bx, by]
  );
  if (!pt) throw new Error("board svg not found");
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(400);
}

/** Wait until it's Red's (the human's) turn again after the AI replied. */
async function waitRedToMove(page, timeout = 45000) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".cu-status");
      return !!el && el.textContent.includes("Đỏ đi");
    },
    { timeout }
  );
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message || e).slice(0, 160)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160));
});

// Capture blob URLs so we can fetch the downloaded share card.
await page.addInitScript(() => {
  window.__blobUrls = [];
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => {
    const u = orig(b);
    window.__blobUrls.push(u);
    return u;
  };
});

await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".cu-board-fit svg", { timeout: 30000 });
ok("game page loads", true);

// Drawer: level 1, then 1-minute clock (restarts the game with the clock).
await page.click(".cu-menu-btn");
await page.waitForSelector(".cu-drawer");
await page
  .locator(".cu-drawer label", { hasText: "Cấp độ" })
  .locator("select")
  .selectOption("1");
await page.waitForTimeout(300);
await page
  .locator(".cu-drawer label", { hasText: "Thời gian" })
  .locator("select")
  .selectOption("60");
await page.waitForTimeout(500);
await page.click(".cu-backdrop");
await page.waitForTimeout(500);
ok("level 1 + 1-minute clock set", true);

// Play 3 red moves (pawn, cannon, horse — all standard legal openers).
const redMoves = [
  [[4, 6], [4, 5]],
  [[1, 7], [1, 4]],
  [[1, 9], [2, 7]],
];
for (const [from, to] of redMoves) {
  await clickSquare(page, from[0], from[1]);
  await clickSquare(page, to[0], to[1]);
  await waitRedToMove(page, 60000);
}
ok("played 3 red moves with AI replies", true);

// Stop moving: the 1-minute clock runs out → game over by timeout.
await page.waitForSelector('[data-testid="coach-open"]', { timeout: 120000 });
ok("game over: coach review button visible", true);

// Open the coach review; analysis runs on tap.
await page.click('[data-testid="coach-open"]');
await page.waitForSelector('[data-testid="coach-accuracy"]', { timeout: 240000 });
ok("coach accuracy panel rendered", true);

const accText = (await page.textContent('[data-testid="coach-accuracy-value"]')).trim();
const acc = Number(accText);
ok("accuracy is a number 0-100", /^\d{1,3}$/.test(accText) && acc >= 0 && acc <= 100, `accuracy=${accText}`);

ok(
  "mistakes section renders",
  await page.locator('[data-testid="coach-mistakes"]').isVisible()
);
ok(
  "strength section renders",
  await page.locator('[data-testid="coach-strength"]').isVisible()
);

// Share card: click share, capture the downloaded PNG, check real pixels.
await page.click('button:has-text("📤 Chia sẻ thẻ kết quả")');
await page.waitForFunction(() => window.__blobUrls.length > 0, { timeout: 20000 });
const px = await page.evaluate(async () => {
  const url = window.__blobUrls[window.__blobUrls.length - 1];
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 1600) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += lum;
    sum2 += lum * lum;
    n++;
  }
  const mean = sum / n;
  return { w: c.width, h: c.height, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
});
ok("share card is 1080x1350", px.w === 1080 && px.h === 1350, `${px.w}x${px.h}`);
ok("share card non-blank (pixel variance)", px.sd > 15, `sd=${px.sd.toFixed(1)}`);

const realErrors = errors.filter(
  (e) => !/realtime|websocket|WebSocket|net::ERR|favicon|404/i.test(e)
);
ok("no unexpected page errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed === 0 ? "E2E PASS" : `E2E FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
