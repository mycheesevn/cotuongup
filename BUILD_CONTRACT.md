# Cờ Úp (cotuongup) — build contract for all agents

App root: `~/workspace/cotuongup` (ported from PacClone `~/workspace/xiangqi`).
Canonical host: `https://cotuongup.synerworlds.com`. DB prefix `cu_`.
Accent: wine red `#701e24`, gradient `#93262e`, brass `#c99636`. Emoji 🃏.
CSS prefix already renamed `xq-` → `cu-`; dirs: `components/cotuongup/`, game lib: `lib/jieqi/`.

## Engine (DO NOT modify `lib/jieqi/core/` except to fix a proven bug)

`@/lib/jieqi/core` exports (see `~/workspace/co-up/engine/README.md`):
`createGame(seed)`, `createGameWithRng`, `legalMoves(state)`,
`legalMovesForSquare(state, x, y)`, `applyMove(state, move) -> { state, record }`,
`gameStatus(state)`, `isInCheck(state, color)`, `maskState(state)`,
`toFen / parseFen / toPublicFen / maskedFen`, `moveToUci / parseUci`,
`makeState(placements, opts)` (setup editor), `commitmentForSeed`,
`verifyCommitment`, `layoutString`, `evaluate(state)`, `repetitionCount(state)`.
Types: `JieqiState`, `JPiece {id,color,trueType,fakeType,covered}`,
`MaskedState`, `MaskedPiece {color,fakeType,trueType:null|type}`,
`Move {from:{x,y}, to:{x,y}}`, `MoveRecord {flipped, revealedType, captured, gaveCheck, repetitionCountAfter,...}`,
`Color`, `PieceType` ("K|A|B|N|R|C|P"). Board coords: `board[y][x]`, y=0 Black back rank, Red at y=9 side. Red moves first.

## App-facing adapter (Agent A owns: `lib/jieqi/engine.ts`, `lib/jieqi/fen.ts`, `lib/jieqi/types.ts`)

Replace the old Xiangqi board-based modules with a state-based adapter:
- `types.ts`: re-export core types; add app types kept from PacClone where
  components need them (`Level`, `Difficulty`, `DIFFICULTIES`, `PIECE_CHARS`,
  `PIECE_NAMES` — copy values from git history of the old file / PacClone).
- `engine.ts`: re-export core engine + helpers:
  - `initialState(seed?: number|string): JieqiState` (= createGame)
  - `viewBoard(state: JieqiState): ViewPiece[][]` and
    `viewBoardMasked(m: MaskedState): ViewPiece[][]` where
    `ViewPiece = { id:number; color:Color; faceType:PieceType; covered:boolean; hostType:PieceType }`
    (faceType = trueType when revealed; when covered, faceType is unused for
    rendering the face — Board renders the brass back + subtle host glyph
    from hostType).
  - `capturedLists(state)` -> per-color captured CapturedInfo[] for trays.
  - `remainingDark(state|masked)` -> per-color multiset of still-unknown
    identities (public info: standard multiset − revealed − captured) for
    the "bộ bài còn úp" panel.
- `fen.ts`: re-export core fen + `initialFen()` (full FEN of a fresh deal is
  seed-dependent — provide `initialPublicFen()` = the design-doc string).
- `notation.ts` (Agent A): `moveEntryText(...)` must append the flip suffix
  (`=Xe` style, i.e. `=<revealed type name>`) when `record.flipped`.

## AI (Agent A owns `lib/jieqi/ai.ts`, `hint.worker.ts`, `liveEval.ts`, `mate.ts`, `analysis.ts`, `coach.ts` glue)

- Keep exported names components use: `VALUES`, `LEVELS`, `MAX_LEVEL`,
  `getLevelConfig`, `findBestMove(...)`, `analyzePosition`, `searchDepthQ`,
  `PositionAnalysis`, `DepthSearchResult`, `SearchStats` — but re-implement
  over JieqiState + determinization:
  - AI input is ALWAYS `maskState(state)` internally: sample assignments of
    covered identities consistent with public info (unknown multiset per
    side), build sampled true states via `makeState`, negamax+alpha-beta
    with core `legalMoves/applyMove` and core `evaluate` (+PST port from
    PacClone `pst.ts` adapted to Jieqi values) per design §4.3 ladder:
    L1–2 weighted-random/greedy w/ blunders; L3–4 expected-value heuristic
    1–2 ply; L5–6 4–8 samples depth 2; L7–8 16–32 samples depth 3–4;
    L9–10 48–96 samples depth 4–5 + quiescence; L11–12 128+ samples,
    deeper search, risk management.
  - **Repetition steering (MANDATORY, ruling 7 addendum)**: wrapper around
    move choice for the AI side — exclude moves whose resulting position
    key would reach a 3rd occurrence (per `state.keyHistory`), penalize
    2nd-occurrence moves (−50cp equivalent in sample-averaged score); when
    the opponent has given check on consecutive moves / is repeating, the
    AI must prefer a reply that changes the position (deviation bonus).
    Implement as `steerMoves(state, scoredMoves)` in ai.ts and use it in
    `findBestMove` for ALL levels ≥3 (levels 1–2 keep it too via the
    3rd-occurrence exclusion only).
  - Fully-revealed positions: determinization degenerates to plain negamax
    (samples = the position itself).
- `mate.ts`: mate-in-N solver over JieqiState (used by daily puzzles —
  fully-revealed positions only).
- Worker: `hint.worker.ts` runs findBestMove off-thread like PacClone.

## Rooms — server-authoritative (Agent C owns)

- DB: `cu_rooms`, `cu_room_members`, `cu_matches` (PUBLIC masked state only:
  public FEN, move list with flip suffixes, commitment hash, players
  `red_id`/`black_id`, status, result), `cu_match_secrets` (true_layout
  jsonb + seed; RLS enabled, NO policies for anon/authenticated; not in
  realtime publication).
- Move flow: client POSTs `{matchId, from, to}` to `app/api/rooms/move/route.ts`
  (auth via supabase cookies; service-role admin client server-side).
  Server: load secret + match, verify caller is the side to move, run core
  engine validate+apply, write new public FEN + move + secrets, if over →
  finalize via `cu_record_room_result` RPC (Elo/XP like siblings), reveal
  true layout into the match row (`revealed_layout jsonb`) at end.
  Match creation: `app/api/rooms/start/route.ts` (or extend startNextMatch
  flow) — server deals `createGame(seed)` with a server-only random seed,
  stores secret, publishes `commitmentForSeed(seed)` on the match row.
- Clients subscribe to `cu_matches` changes (masked data only) as in
  PacClone's RoomMatchView; spectators get the same masked feed.
- Keep PacClone rooms.ts client API shape where possible; add
  `submitRoomMove(matchId, from, to)` calling the API route.
- Chat trio: `cu_room_messages` (chat), voice via existing
  `lib/voice/useRoomVoice.ts` + `app/api/voice/turn-credentials` (env names
  `CLOUDFLARE_TURN_TOKEN_ID`/`CLOUDFLARE_TURN_API_TOKEN` — read as usual;
  a known Vercel-side var-name typo is the user's to fix, NOT code),
  room delete RPC `cu_delete_room` (owner only, blocked while a match is
  active). Aside order: Voice → private Chat → move list → Comments.
- Correspondence: port CorrView/correspondence.ts to cu_ tables, moves go
  through the same server-authoritative route (mode flag on match row).

## Migrations (Agent D owns `supabase/migrations/`)

Replace the copied Xiangqi migration files with a numbered cu_ set modeled
on `~/workspace/caro/supabase/migrations/001..011` structure:
001 foundation (cu_stats, cu_games, cu_rating_history, cu_checkins,
cu_game_events + record RPC), 002 rooms+members+matches+match_secrets,
003 room play RPCs (create/join/start/finish/delete), 004 correspondence,
005 puzzles (daily + community), 006 push/notifications glue (shared tables
already exist — only cu_-specific bits), 007 setups (cu_setups),
008 registry row (game_registry: slug `co-up`?? — NO: slug is the game's
hub slug; check `~/workspace/synerworlds` hub registry seeds for slug
convention and existing sort values; site_url https://cotuongup.synerworlds.com,
stats_source cu_stats, icon 🃏, accent #701e24, prefix cu_,
match_col_a red_id / match_col_b black_id), 009 room chat, 010 room delete,
011 quests/rewards glue if sibling pattern needs cu_ tables.
Rules (AGENTS.md): smoke-test EVERY file on `~/workspace/tools/sql-smoke.mjs`
(grant-faithful), EXECUTE every new PL/pgSQL function as authenticated
(win+loss args, assert rows land), assert role-specific error codes,
revoke SECURITY DEFINER from public AND anon (RLS helpers keep
authenticated+anon execute), all plpgsql vars prefixed `v_`, never name a
variable after a column it touches. cu_match_secrets: RLS on, zero client
policies; only SECURITY DEFINER functions / service role touch it.
Deliver `supabase/PASTE_ALL.sql` (concatenation in order) + a ledger in the
build report.

## Shell & growth (Agent E owns)

- `app/layout.tsx`: SITE_URL `https://cotuongup.synerworlds.com`, title/meta
  for Cờ Úp / Dark Xiangqi, keywords; JSON-LD game name.
- `app/globals.css`: `--accent: #701e24`, `--accent-2: #c99636` (brass) —
  check how PacClone uses accent-2 (it was green #2f9e44 for the opponent/
  positive cues; brass is the Cờ Úp secondary — keep semantics, just recolor).
  Board LINE color may stay; piece red ink may stay.
- `lib/jieqi/i18n.ts`: game identity strings → Cờ Úp; add keys (at the END of
  the Strings interface + both locales) for: covered piece, flip/reveal,
  remaining-dark panel, server room notes. VI default, EN parity (key sets
  must match exactly).
- Share/video/live: canonical host is already `cotuong.synerworlds.com` in
  copied files — sweep for `cotuong.synerworlds.com` → `cotuongup.`, and for
  any `location.origin` in share/invite/video flows (must be ZERO).
  LiveStreamModal LS key `cotuongup-live-keys`, LiveKit room prefix
  `cotuongup-live-`. `lib/live/*`, `app/api/live/*` copied as-is otherwise.
- `components/cotuongup/SiteFooter.tsx`: list all 14 games incl.
  Cờ Úp 🃏 https://cotuongup.synerworlds.com in registry sort order
  (check hub registry for the other 13 + sorts).
- Blog: family rule — blog lives on the hub. Replace local blog pages with
  redirects to `https://synerworlds.com/blog` (308 pattern as in checkers/
  caro: check `~/workspace/checkers/next.config.mjs`), delete `content/blog`
  + `lib/blog.ts` usage, Guides drawer entry →
  `https://synerworlds.com/blog?cat=co-up`.
- Icons: `app/icon.svg` redrawn (🃏-like dark piece back: wine disc + brass
  ring + "ÚP"?) — keep `app/apple-icon.tsx` + `iconSvg.ts`/`iconResponse.ts`
  pattern generating from the SVG; manifest name "Cờ Úp".
- `lib/supabase/games.ts`: SavedGame stores FULL FEN (with hidden field) in
  the existing fen/moves fields for local games; room games store public
  FEN + revealed_layout at end. `decodeGame` uses core parseFen.
- Folk encouragement: NOT approved by user yet — do not add.
- `vercel.json` already has deploymentEnabled.main=false — keep.
- `.gitignore` (create if missing): node_modules, .next, etc.

## Play UI (Agent B owns components; starts after A+E land)

Board renders ViewPiece: covered → brass back disc (double ring, side-tinted
rim, subtle host glyph at low opacity, identical silhouette for all covered
pieces of a side); revealed → PacClone disc with faceType char. Flip
animation: CSS/SMIL rotateY ~300ms when a piece transitions covered→revealed
(track prev covered map by piece id). Move list notation shows flip suffix.
Panels under board: captured trays (captured covered pieces shown revealed —
ruling 3), remaining-dark panel (counts by candidate type), check status in
panel (big banner default OFF, existing setting key pattern).
Play screen keeps the 4-button row; Undo in vs-AI re-covers the flipped
piece (state stack of JieqiState makes this natural). Swap sides + Hint
(worker, determinization mid-level) genuinely work. Setup editor: palette
includes covered pieces — placing a covered piece requires choosing its
hidden trueType from the side's remaining multiset (makeState); fully-
revealed setups also allowed; CvC lives ONLY inside Setup (no menu item).
Daily puzzle = fully-revealed mate-in-N from `mate.ts`, seeded by date.
Replay: from full FEN + UCI list; flip animation at flip plies; end-of-
replay "reveal all" button flips remaining covered pieces (finished games
only).

## General

- TypeScript strict; `npx tsc --noEmit` and `npm run build` must pass.
- No `window.location.origin` in share/invite/video code.
- Pagination: shared Pagination component (10 history / 15 leaderboard).
- Every mode view is a DIRECT child of the page flex column; Board only via
  `.cu-board-area > .cu-board-fit`.
- Do NOT run production SQL, do NOT push git, do NOT deploy.
