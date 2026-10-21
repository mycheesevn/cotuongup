# Cờ Úp — Rooms schema & API spec (Agent C → Agent D normative)

This is the contract Agent D implements as SQL migrations. Agent C's
TypeScript (`lib/supabase/rooms.ts`, `lib/supabase/correspondence.ts`,
`lib/rooms/*`, `app/api/rooms/*`) is written against exactly this spec.
If a name here and the TS disagree, this file wins — flag it, don't fork.

Prefix: `cu_`. Shared tables (`profiles`, `cu_stats`, `cu_rating_history`,
`cu_game_events`, …) belong to the foundation migration (Agent D, 001) and
are only referenced here.

---

## 0. Decisions (read first)

1. **Match creation / dealing is server-side TypeScript, NOT an RPC.**
   `POST /api/rooms/start` (service role) deals with the TS engine
   (`createGame(seed)`, `@/lib/jieqi/core`) — the engine is the single
   source of truth for the deal, the commitment and every move. There is
   deliberately **no** `cu_start_next_match`, `cu_rematch` or
   `cu_tournament_next_match` RPC: all three flows need a fresh hidden
   deal, so all three go through the start route (rotation / pairing
   selection happens in the route, in TS). The old PacClone RPC names
   must NOT be recreated for matches.
2. **Move application is server-side TypeScript, NOT an RPC and NOT a
   client table update.** `POST /api/rooms/move` loads the true state,
   validates with the core engine, persists public + secret state. There
   is **no client UPDATE policy on `cu_matches`** at all (see §3).
   Finalization (Elo/XP/room status/tournament write-back) is the one
   piece of SQL: the move route calls `cu_record_room_result` (§4) with
   the service role after the engine says the game is over (or on
   resign / agreed draw).
3. **Correspondence = `cu_matches` rows with `mode = 'corr'`.** No
   separate `cu_corr_*` table. Corr matches have `room_id = NULL`,
   `red_id` = creator, `black_id` = opponent, and use the *same*
   secrets table, the *same* move route and the *same* masked-state
   route as room matches. `lib/supabase/correspondence.ts` is a thin
   adapter over `cu_matches` + the API routes.
4. **`moves` is `text`, comma-joined UCI** (e.g. `a6a5,b0c2r,h9g7`),
   where a flipping move carries the revealed true type as a lowercase
   suffix letter (`r` = chariot … per core `moveToUci`). This preserves
   every existing client call site's `moves.split(",")` shape while
   carrying the flip information publicly (the suffix is public info —
   the flip is revealed to everyone when it happens). Empty string = no
   moves yet. It is NOT jsonb and NOT the legacy 4-digit codes.
5. **The seed never leaves the server while a match is active.** It is
   stored only in `cu_match_secrets`, and copied to
   `cu_matches.revealed_seed` (plus `revealed_layout`) **only at
   finalization**, so anyone can audit the deal afterwards with
   `verifyCommitment(seed, commitment)`.

---

## 1. Tables

### 1.1 `cu_rooms`

| column | type | notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| code | text unique not null | 6-char invite code, family alphabet |
| name | text not null | |
| leader_id | uuid not null references profiles(id) | room owner ("leader") |
| max_players | int not null default 8 check 2..20 | |
| status | text not null default 'lobby' check in ('lobby','playing','closed') | 'closed' = deleted (soft) |
| turn_order | uuid[] not null default '{}' | rotation of player user_ids |
| is_public | boolean not null default false | listed in public lobby / guest-visible |
| rules | text not null default '' | leader-written house rules, ≤ 500 chars |
| created_at | timestamptz not null default now() | |

### 1.2 `cu_room_members`

| column | type | notes |
|---|---|---|
| room_id | uuid not null references cu_rooms(id) on delete cascade | PK part |
| user_id | uuid not null references profiles(id) on delete cascade | PK part |
| role | text not null default 'player' check in ('player','spectator') | |
| joined_at | timestamptz not null default now() | |

PK `(room_id, user_id)`. FK names must be the Postgres defaults so
PostgREST hints read `profiles!cu_room_members_user_id_fkey`.

### 1.3 `cu_matches` — PUBLIC masked state only. Nothing secret, ever.

| column | type | notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| room_id | uuid references cu_rooms(id) on delete cascade, **nullable** | NULL ⇔ correspondence |
| mode | text not null default 'room' check in ('room','corr') | tournament matches are mode='room' + tournament_id set |
| match_no | int nullable | per-room sequential number (route assigns max+1); NULL for corr |
| red_id | uuid references profiles(id) | Red moves first; room host side per rotation |
| black_id | uuid references profiles(id) | |
| status | text not null default 'active' check in ('active','finished','cancelled') | |
| public_fen | text not null | core `toPublicFen` — 6 fields, NO hidden field |
| moves | text not null default '' | comma-joined UCI + flip suffixes (§0.4) |
| commitment | text not null | `commitmentForSeed(seed)` SHA-256 hex, published at creation |
| result | text nullable check in ('red','black','draw') | set at finish |
| reason | text nullable check in ('checkmate','stalemate','draw-120','resign','draw-agreed','cancelled') | set at finish/cancel |
| winner_id | uuid nullable references profiles(id) | = red_id/black_id of winner; NULL on draw/cancel |
| draw_offer_by | uuid nullable references profiles(id) | pending draw offer (the player who offered); cleared on any move / decline / finish |
| revealed_layout | jsonb nullable | ONLY at finish: `{"layout": <layoutString>, "true_fen": <full 7-field FEN>}` |
| revealed_seed | text nullable | ONLY at finish: the deal seed, for commitment audit |
| tournament_id | uuid nullable references cu_tournaments(id) on delete set null | |
| created_at | timestamptz not null default now() | |
| updated_at | timestamptz not null default now() | route bumps on every move (corr lists sort by it) |
| finished_at | timestamptz nullable | |

Indexes: `(room_id, created_at desc)`, `(red_id, status)`,
`(black_id, status)`, partial index on corr rows
`(mode, updated_at desc) where mode = 'corr'`.

### 1.4 `cu_match_secrets` — server-only. The crown jewels.

| column | type | notes |
|---|---|---|
| match_id | uuid PK references cu_matches(id) on delete cascade | |
| seed | text not null | deal seed (server-generated random hex) |
| true_layout | jsonb not null | `{"layout": <layoutString at deal>, "pieces": [{"x":0,"y":0,"color":"black","trueType":"R","fakeType":"R","covered":true}, …]}` — audit/deal record |
| true_fen | text not null | full 7-field FEN (with hidden field) of the CURRENT true state; updated by the move route every ply (cache/cross-check — the route's source of truth is replay: `createGame(seed)` + re-apply `moves`) |
| created_at | timestamptz not null default now() | |
| updated_at | timestamptz not null default now() | |

**RLS: enabled, ZERO policies for anon and authenticated** (no select,
no insert, no update, no delete). Only the service role (RLS bypass) and
SECURITY DEFINER functions owned by the migration role may touch it.
**NEVER added to the `supabase_realtime` publication.**

### 1.5 `cu_room_messages` (private room chat, members only)

`id uuid PK`, `room_id uuid not null → cu_rooms cascade`,
`user_id uuid not null → profiles cascade`,
`body text not null check char_length 1..500`,
`created_at timestamptz not null default now()`.
Index `(room_id, created_at)`.

### 1.6 `cu_room_comments` (public per-move comments)

`id uuid PK`, `room_id uuid not null → cu_rooms cascade`,
`match_id uuid → cu_matches cascade` (nullable),
`move_number int not null default 0`,
`user_id uuid not null → profiles cascade`,
`body text not null`, `created_at timestamptz not null default now()`.
FK hint used by clients: `profiles!cu_room_comments_user_id_fkey`.

### 1.7 `cu_match_reactions`

`id uuid PK`, `room_id uuid not null → cu_rooms cascade`,
`match_id uuid not null → cu_matches cascade`,
`user_id uuid not null → profiles cascade`,
`emoji text not null`, `created_at timestamptz not null default now()`.

### 1.8 `cu_tournaments`

`id uuid PK`, `room_id uuid not null → cu_rooms cascade`,
`name text not null`,
`status text not null default 'open' check in ('open','finished')`,
`pairings jsonb not null default '[]'` — array of
`{"red": uuid, "black": uuid, "result": 'red'|'black'|'draw'|null, "match_id": uuid|null}`
(note: keys are `red`/`black`, matching the client `TournamentPairing`
type — NOT caro's `x`/`o`),
`created_at`, `finished_at nullable`.

### 1.9 `cu_room_xp_ledger` (anti-double-award guard for §4)

Same shape as caro's: PK `(user_id, kind, ref_id, day)`,
`kind in ('play','host','comment','daily')`, `xp int not null`,
`day date not null default current_date`. RLS on; self-read policy only.

---

## 2. RLS posture (summary — D writes the policies)

Helpers (family pattern, SECURITY DEFINER, `language sql stable`):
`is_cu_room_member(rid uuid)`, `is_cu_room_leader(rid uuid)`.
**Both keep EXECUTE for anon + authenticated** (policy expressions run
with the caller's privileges — revoking breaks every room read; family
lesson). All other DEFINER functions: `revoke all … from public` AND
`from anon`, grant exactly the roles listed in §4.

- `cu_rooms`: SELECT for members, the leader, or anyone when
  `is_public`. INSERT/UPDATE/DELETE: no direct client writes (RPCs and
  the service role do it) — leader UPDATE policy may exist for parity
  but is not relied on.
- `cu_room_members`: SELECT for members of that room. Writes via RPCs.
- `cu_matches`: SELECT for (a) room members of `room_id`, (b) anyone
  when the room `is_public` (guest spectating reads through
  `cu_guest_room_detail`, but the policy must also allow the realtime /
  direct reads the guest view performs), (c) either player when
  `mode='corr'`. **No INSERT/UPDATE/DELETE policies for clients at
  all** — creation and moves are service-role only (§0.1/§0.2). This is
  the deliberate break from PacClone, whose players updated the match
  row directly.
- `cu_match_secrets`: RLS on, **no policies** (§1.4).
- `cu_room_messages`: SELECT/INSERT for room members only,
  `auth.uid() = user_id` on insert.
- `cu_room_comments`: SELECT/INSERT for room members,
  `auth.uid() = user_id` on insert.
- `cu_match_reactions`: all operations for room members.
- `cu_tournaments`: SELECT for room members.
- `cu_room_xp_ledger`: SELECT own rows only.

## 3. Realtime publication

Add: `cu_rooms`, `cu_room_members`, `cu_matches`, `cu_room_messages`,
`cu_room_comments`, `cu_match_reactions`, `cu_tournaments`.
**NEVER `cu_match_secrets`.** `cu_matches` rows are masked-only by
construction (§1.3), so postgres_changes payloads are safe for players
and spectators alike.

Client channel names: `cu-room:<roomId>` (room stream),
`cu-match-watch:<matchId>` (presence), `cu-corr:<matchId>`,
`room-voice:<roomId>` (voice signaling, pre-existing pattern).

## 4. RPCs Agent D must implement (exact signatures)

All `security definer set search_path = public`, all plpgsql variables
prefixed `v_`, all revoked from public + anon then granted as noted.
Error strings are contractual — the client maps them via
`roomErrorKey`: `room_not_found`, `room_full`, `room_closed`,
`not_enough_players`, `match_in_progress`, `not_leader`,
`not_authenticated`, `match_not_found`, `not_allowed`,
`tournament_in_progress`, `tournament_finished`, `tournament_not_found`.

| function | grant | behaviour |
|---|---|---|
| `cu_create_room(p_name text, p_max_players int) returns cu_rooms` | authenticated | Generates unique code, inserts room (`turn_order = [auth.uid()]`, status 'lobby') + leader member row ('player'). Name default/trim/clamp like caro. |
| `cu_join_room(p_code text) returns cu_rooms` | authenticated | Idempotent for members; `room_not_found` / `room_closed` / `room_full`; appends caller to members + turn_order. |
| `cu_leave_room(p_room_id uuid) returns void` | authenticated | Removes member + turn_order entry. (Leader leaving is allowed by the client flow only via delete; if D keeps caro's leader block, raise `not_leader`-family error — client treats leave failure as non-fatal.) |
| `cu_update_room_rules(p_room_id uuid, p_rules text) returns void` | authenticated | Leader only (`not_leader`); clamp 500. |
| `cu_set_turn_order(p_room_id uuid, p_order uuid[]) returns void` | authenticated | Leader only; sanitize to current players (caro pattern). |
| `cu_set_member_role(p_room_id uuid, p_user_id uuid, p_role text) returns void` | authenticated | Leader only; keeps turn_order in sync; leader cannot become spectator. |
| `cu_kick_member(p_room_id uuid, p_user_id uuid) returns void` | authenticated | Leader only; cannot kick self/leader. |
| `cu_close_room(p_room_id uuid) returns void` | authenticated | Leader only; status := 'closed'. |
| `cu_set_room_public(p_room_id uuid, p_public boolean) returns void` | authenticated | Leader only. |
| `cu_delete_room(p_room_id uuid) returns void` | authenticated | **Owner (leader) only** (`not_leader`); **blocked while any `cu_matches` row of the room is `status='active'`** (`match_in_progress`); soft-close: status := 'closed' (never hard DELETE — history survives). |
| `cu_list_public_rooms() returns table(id uuid, code text, name text, member_count int, max_players int, has_active_match boolean)` | anon + authenticated | Non-closed public rooms. |
| `cu_room_leaderboard() returns table(room_id uuid, name text, code text, matches_7d int, member_count int)` | anon + authenticated | Hottest rooms by finished matches in 7 days. |
| `cu_guest_room_detail(p_room_id uuid) returns jsonb` | anon + authenticated | Public rooms only (else `room_not_found`). Returns `{room:{id,code,name,rules,member_count,max_players}, members:[{user_id,name}], active_match:<full cu_matches row or null>, comments:[{id,body,created_at,author}]}`. **Masked data only** — it reads `cu_matches`, never secrets. |
| `cu_preview_room(p_code text) returns jsonb` | anon + authenticated | Invite preview `{name, member_count, rules}` for a non-closed room, or null. (Used by the quests/invite flow.) |
| `cu_create_tournament(p_room_id uuid, p_name text) returns cu_tournaments` | authenticated | Leader only; ≥3 players (`not_enough_players`); no other open tournament (`tournament_in_progress`); no active match (`match_in_progress`); round-robin pairings over current players with `red`/`black` keys. |
| `cu_cancel_tournament(p_tournament_id uuid) returns void` | authenticated | Leader of the tournament's room only; deletes or closes the tournament (client refetches list). |
| `cu_cancel_match(p_match_id uuid) returns void` | authenticated | Room leader only (`not_leader`); active match → status 'cancelled', reason 'cancelled', finished_at now; room status back to 'lobby' if it was 'playing'. Secrets row may remain (match is dead; seed is NOT revealed for cancelled matches). |
| `cu_record_room_result(p_match_id uuid, p_result text, p_reason text, p_revealed_layout jsonb default null, p_revealed_seed text default null) returns jsonb` | **service_role ONLY** (revoke from public, anon, authenticated) | The finalizer — see §5. Called ONLY by `/api/rooms/move` (service role; `auth.uid()` is null in that context, so it authorizes by match state, not by caller). Returns exactly these jsonb keys: `{"red_play_xp":int,"black_play_xp":int,"host_xp":int,"host_user_id":uuid}` — a per-player breakdown, because the RPC cannot know which player the route's caller is; the route slices it into the caller's `{play_xp, host_xp, daily_xp:0}` toast (daily-participation XP is awarded by the RPC but not broken out). D: implement exactly these keys — `lib/rooms/serverMatch.ts` `finalizeMatch` reads them. |

### 5. `cu_record_room_result` semantics (normative)

Inputs validated: match exists (`match_not_found`), `p_result in
('red','black','draw')`. **Idempotent**: if the match is already
'finished', return the zero breakdown without touching anything.

Otherwise, atomically:
1. Update `cu_matches`: status 'finished', result/reason,
   winner_id (red_id/black_id per result, null on draw),
   `draw_offer_by = null`, finished_at = now(),
   `revealed_layout = coalesce(p_revealed_layout, revealed_layout)`,
   `revealed_seed = coalesce(p_revealed_seed, revealed_seed)`.
2. If `room_id` is not null: room status 'playing' → 'lobby'.
3. **Elo + XP, only when plies ≥ 10** (anti-farm, family rule; plies =
   number of UCI entries in `moves`). XP via `cu_room_xp_ledger`
   (idempotent inserts, caro `cr_award_room_xp` pattern ported as an
   internal, non-granted helper `cu_award_room_xp`):
   win: winner play +15, loser play +5; draw: both play +8;
   host (room leader, room matches only) +5, capped 10/day;
   daily participation +10 once/day for both players.
   Elo on `cu_stats`: pairwise from PRE-match snapshots, start 800,
   K = 40 while games_played < 20 else 24, floor 100, peak tracked;
   games_played/wins/losses/draws updated; one `cu_rating_history` row
   per player. Corr matches DO record Elo/XP the same way.
4. Tournament write-back: if `tournament_id` is set, stamp the pairing
   whose `match_id = p_match_id` with `result = p_result`; when no
   pairing remains resultless, tournament status := 'finished',
   finished_at := now(). (Pairing result vocabulary is the match
   vocabulary: 'red'|'black'|'draw'.)

## 6. API routes (Agent C, already implemented against this spec)

Auth: Bearer access token (family pattern, `app/api/push/_auth.ts`) OR
`@supabase/ssr` session cookie — the routes accept both. All DB access
via the service-role client. Engine: `@/lib/jieqi/core` only.

- `POST /api/rooms/start`
  - `{roomId}` — leader only; next rotation match (first two players of
    sanitized turn_order; rotate afterwards; room → 'playing';
    `match_no` = max existing + 1). Errors: 403 `not_leader`,
    409 `match_in_progress`, 422 `not_enough_players`.
  - `{roomId, rematchOf}` — either player of that finished match; same
    pair, colors swapped; room → 'playing'. 409 if a match is active.
  - `{roomId, tournamentId}` — leader only; first resultless pairing
    without a match gets a match; pairing stamped with `match_id`.
  - `{mode:"corr", opponentId}` — caller is Red; creates a corr match.
  - Success: inserts `cu_match_secrets` + `cu_matches`
    (`public_fen = toPublicFen(state)`, `commitment =
    commitmentForSeed(seed)`, seed = 32 random bytes hex) and returns
    `{match, masked}` where `masked = maskState(state)` (JSON).
- `POST /api/rooms/move` — body `{matchId, from:{x,y}, to:{x,y}}` or
  `{matchId, action}` with `action in
  ('resign','draw_offer','draw_accept','draw_decline')`.
  Verifies caller is the side to move (turn from the replayed true
  state), validates the move ∈ `legalMoves`, applies it, persists
  `true_fen`/`public_fen`/`moves` (+ clears an opponent's pending draw
  offer), finalizes via `cu_record_room_result` when `gameStatus` is
  over / draw-120 / resign / agreed draw (revealing layout + seed).
  Returns `{match, masked, record}` — `record` is the core
  `MoveRecord` (flipped / revealedType / captured are PUBLIC).
  Errors: 401, 403 `not_a_player` / `not_your_turn`, 404, 409
  `match_not_active`, 422 `illegal_move`.
- `POST /api/rooms/state` — body `{matchId}`. Returns `{match, masked}`
  rebuilt server-side (replay) for late joiners / spectators.
  Visibility: room match → room member, or anyone signed-in when the
  room is public; corr match → players only. Finished matches also
  include `revealed: {seed, layout}` (already public on the row).

## 7. What D does NOT need to build

- No move/start/rematch/tournament-next RPCs (§0.1).
- No client UPDATE policy on `cu_matches` (§0.2).
- No `cu_corr_*` tables (§0.3).
- Push-trigger / notification tables: unchanged shared tables; note the
  existing `app/api/push/trigger` route still reads the legacy unprefixed
  `room_matches`/`correspondence_games` names — that route is outside
  this spec (owner to repoint at `cu_matches`).
