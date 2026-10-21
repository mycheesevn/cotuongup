# Famous-games research notes (Chapter 5: Ván đấu nổi tiếng)

## 2026-10-10: 弃马十三着 (Abandoned Horse in 13) — DO NOT USE the Wikipedia score

Source: https://zh.wikipedia.org/wiki/%E5%BC%83%E9%A9%AC%E5%8D%81%E4%B8%89%E7%9D%80
(claims to be the 橘中秘/Jú Zhōng Mì 1632 manual game)

**The published 13-move score is broken.** Verified with the engine
(`scripts/verify-game.ts`, which converts Chinese notation to coordinates
and checks each move against `legalMoves`):

- Plies 1–14 (moves 1–7) verify cleanly — the opening and the horse
  sacrifice are real and legal.
- **Move 10 breaks it.** After 9...将5平6 and 10.前车进一 (rook captures the
  advisor on (3,0)), black is IN CHECK along the rank (rook on (3,0),
  king on (5,0), (4,0) empty). The published reply 10...士5退4 does NOT
  get out of check → illegal. Black has only 2 legal moves; neither is
  the published one.
- Even if move 10 were fixed, the advertised finish fails: 13.炮八平五
  is not checkmate (black's advisor blocks on (4,1)).
- Engine evaluation after move 7 (depth-3 quiescence): −201cp for red,
  i.e. the "trap" does not even give red an advantage at that depth.
  The sacrifice's soundness is doubtful.

**Conclusion:** do not build a library lesson from this transcription.
The 橘中秘 original may differ, but no clean source was found.

## Tooling

`scripts/verify-game.ts` — paste any Chinese-notation score into the MOVES
array and run `npx tsx scripts/verify-game.ts`. It reports per-move
OK/FAIL, prints the `x1,y1>x2,y2` coordinate list for library.ts, and the
final game status. Use it to vet every candidate game before writing
a lesson. (This is the same standard as `scripts/verify-library2.ts`.)

## Open question for Chapter 5

Candidate directions:
- **A. Classical manual games** (橘中秘/梅花谱 "danh cục") — most authentic
  for "ván đấu nổi tiếng", public domain, but each score must be
  engine-vetted (this note shows why).
- **B. Community games** — feature exciting real games from the app's own
  database ("ván hay của cộng đồng"). Real and verifiable, but needs
  player consent and curation; not "famous" in the historical sense.
- **C. Master style lessons** — e.g. "phong cách Hồ Vinh Hoa" taught via
  verified illustrative positions (honest about being style, not games).

## Chapter 5 build result (2026-10-14) — direction A chosen

**Games shipped** (all in `lib/jieqi/library.ts`, chapter `danh-cuc` 📜):

1. **Thuận Pháo danh cục (1+2)** — full 37-move 顺炮 classical game from
   the "中国象棋棋谱" Wikipedia page
   (`https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%9C%8B%E8%B1%A1%E6%A3%8B%E6%A3%8B%E8%AD%9C`).
   All 73 plies verified legal via verify-game.ts; ends in genuine
   checkmate (winner=red) at 37.马八进七. Split into two lessons at move
   20; lesson 2 starts from engine-generated FEN
   `1r1ak3C/4a4/2n1b3c/p3p3p/9/2R6/Pc2P1P1n/2N1C3N/4A2r1/1RBAK1B2`.
   Quiz 1 (exact): 6.炮三进七 sacrifice. Quiz 2 (mate): final 1,3>2,1.
2. **Bẫy thí Mã — 弃马局** — the famous horse-sacrifice trap OPENING
   (moves 1–7 only). The first 7 moves verified clean, including black's
   6...炮2进7 cannon sacrifice. The online 13-move version is corrupt
   (see above) so the lesson teaches ONLY the verified 7 moves and says
   so in the outro. Quiz (exact): 9.车六进七.

**Dropped:** 七星聚会 — could not obtain a reliable starting FEN;
reconstruction from the published line produced contradictions.

**verify-game.ts hardening** (2026-10-14): normalize() now maps
traditional chars (馬車帥將進→simplified) and full-width digits;
moveToNotation() omits the from-file numeral after 前/后/中 per the
standard convention. All 87 chapter-5 steps re-verified end-to-end;
live playthrough of all 3 lessons vs dev server: every guided move
accepted, both quiz types solvable, zero app console errors.
