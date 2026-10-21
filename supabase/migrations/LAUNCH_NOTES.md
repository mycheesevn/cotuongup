# Cờ Úp (Jieqi / Dark Xiangqi) — SQL launch notes

Run order: **001 → 012, in numeric order, in the Supabase Dashboard SQL editor**
on the shared family project (the same project that hosts the other games'
tables, `profiles`, and `game_registry`). Every file is idempotent — safe
to re-run if a step is interrupted. Paste each file **verbatim** (standing
rule: never retype SQL). `PASTE_ALL.sql` (in this folder and in
`supabase/`) is the same 12 files concatenated in order, for convenience.

> **ROOMS_SPEC reconciliation — RESOLVED by 012 (Agent F):**
> `~/workspace/cotuongup/ROOMS_SPEC.md` (Agent C's rooms spec) did not
> exist yet when 001–011 were written, and the rooms schema/RPCs diverged
> from it (room status `'open'` vs spec `'lobby'`; match mode `'live'`
> vs spec `'room'`; `cu_matches.room_id` NOT NULL though corr rows have
> no room; missing `match_no`/`updated_at`; secrets column `full_fen` vs
> spec/route `true_fen`; a 3-arg caller-sliced `cu_record_room_result`
> granted to authenticated vs the spec's 5-arg service-role-only
> finalizer; undealt-match RPCs the spec forbids; standalone
> `cu_corr_*` tables the spec forbids; discovery RPCs returning the
> wrong shapes). **012_cu_reconcile.sql** brings everything into line
> with the spec without editing 001–011 — see its header + the 012 row
> below for the full list. `cu_matches` carries public masked state only
> (`public_fen`, `moves`, `commitment`, `red_id`, `black_id`, `status`,
> `result`, `revealed_layout`, `revealed_seed`, `draw_offer_by`);
> `cu_match_secrets` is RLS-locked with ZERO client policies.

## Files

| File | What it does |
|---|---|
| `001_cu_foundation.sql` | Core: `cu_stats` (XP, Elo rating/peak, W/L/D, welcome flag) + public leaderboard policy; `cu_ai_rating()` (internal AI pseudo-ratings 300–2400); `cu_leaderboard()` (server-ranked, anon-safe names); daily check-ins `cu_claim_checkin()` (Asia/Ho_Chi_Minh day boundary, streak, XP 10→40); quests `cu_claim_welcome()` (+50) / `cu_claim_quest()` (+20: play_1, win_1, join_room); vs-computer history `cu_games` (seats **Red/Black end to end**: `player_color` `'red'|'black'|'cvc'`; moves = space-separated UCI strings with flip suffixes; **`full_fen`** = full extended FEN incl. hidden identities — solo/local only; **`public_fen`** = masked FEN, defaults to the fresh-deal constant `xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1`); `cu_rating_history` (sparkline); `cu_record_game_result()` — the single solo write path: **win XP = 10+5×level**, draw 5, loss 3; Elo start 800, K40 (<20 games) → 24, floor 100, peak tracked, `floor(x+0.5)` rounding; guests recorded (NULL user), CvC rows excluded from stats/Elo. Also `cu_game_events` + `cu_game_stats()` / `record_cu_game_event()` (family site-stats pattern) and the shared `library_progress` ensure. |
| `002_cu_rooms.sql` | Rooms core: `cu_rooms` / `cu_room_members`; `is_cu_room_member()` / `is_cu_room_leader()` helpers (kept executable by anon+authenticated — RLS policies evaluate with caller privileges); `cu_create_room(name, public, max)` RPC (server-side code, leader member row, atomic; host is rotation head ⇒ host takes **Red**); `cu_matches` — **PUBLIC masked state only** (see header) with member + public-room read policies and **no client write policies** (server-authoritative moves); **`cu_match_secrets`** (true_layout jsonb + seed + full_fen; **RLS on, ZERO policies, table grants revoked from anon+authenticated, NOT in realtime** — only service role / DEFINER functions touch it); `cu_challenges` (denormalized `room_code`, status check, **replica identity full**); `cu_referrals` + `cu_claim_referral()` (+20/+20). Realtime: rooms, members, matches, challenges (never secrets). |
| `003_cu_room_play.sql` | Room play: `cu_tournaments` (pairings keyed `red`/`black`); XP ledger + internal `cu_award_room_xp()` (never granted to clients); membership RPCs (join/leave/kick/role/turn-order/close/rules/public); match RPCs — `cu_start_next_match` **[all three match-creation RPCs + the old record signature dropped/replaced by 012 — see the 012 row]** (rotation head = Red; creates the PUBLIC match row only — the server start route then deals: inserts the secret + stamps `commitment`), **`cu_record_room_result`** (canonical room-result RPC: XP win 15 / draw 8 / loss 5, ≥10 plies anti-farm; host +5 cap 10/day; daily +10; **pairwise Elo** both players from pre-match snapshots; tournament write-back; idempotent) + `cu_finish_room_match` alias (sibling name), `cu_cancel_room_match`, `cu_rematch` (swapped seats, undealt until server deals), draw offers (`cu_offer_draw` / `cu_respond_draw` via `draw_offer_by`); tournament RPCs (create/next/cancel); guest discovery RPCs (`cu_preview_room`, `cu_list_public_rooms`, `cu_room_leaderboard`, `cu_guest_room_detail` — masked fields only) — all anon-safe. |
| `004_cu_correspondence.sql` | **[Standalone `cu_corr_games`/`cu_corr_secrets` DROPPED by 012 (spec §0.3); the `cu_matches` deadline columns added here stay.]** Async play: `cu_matches` gains `move_deadline` + `turn_deadline_hours` (mode='corr'); standalone `cu_corr_games` (**Red/Black** seats, public_fen/moves/commitment/revealed_*; players READ own games + creator INSERT only — **no client UPDATE**: moves go through the server-authoritative route like live matches); `cu_corr_secrets` with the same zero-policy lockdown as `cu_match_secrets`; `cu_corr_my_turn()` (side-to-move derived from ply parity, Red on even plies); realtime on `cu_corr_games`. |
| `005_cu_puzzles.sql` | Daily puzzles: `cu_puzzle_solves` + `cu_record_puzzle_solve()` (+15 XP, idempotent). Community puzzles: `cu_puzzles` / `cu_community_puzzle_solves` / `cu_community_puzzle_likes` (public read; owner insert/update/delete) + RPCs `cu_community_puzzle_cards` / `cu_community_puzzle_card` (anon-safe, `new`/`popular`/`weekly`/`mine` sorts), `cu_solve_community_puzzle` (solver +10 cap 5/day, creator +5 per distinct solver cap 50, self-solve 0), `cu_toggle_community_like`, internal `cu_maybe_feature_puzzle` (8 likes or 20 solves → featured + creator +50). **Fully-revealed only (user ruling 10):** `fen` stores the full extended FEN and `fully_revealed` carries a `check (fully_revealed = true)` backstop — covered-piece puzzles are rejected by the schema. `solution` = space-separated set of acceptable winning UCI moves; `moves_to_mate` 1–7. |
| `006_cu_notifications.sql` | **Comment-only no-op (plus a NOTICE marker).** Verified: push/inbox use the SHARED unprefixed tables created by the Xiangqi original on this project — `public.push_subscriptions` + `public.notifications` (+ `unread_notification_count()`) — so Cờ Úp creates NO per-game copies (Caro/Checkers did, because they were not PacClone ports). The file documents the Cờ Úp conventions: kinds (`challenge`, `room_turn`, `corr_turn`, …), canonical-host URLs, 🃏 push titles. |
| `007_cu_setups.sql` | Saved setups: `cu_setups` (name + full `fen` + **`placements` jsonb** holding the covered-piece placements incl. hidden trueType assignments, self-RLS, direct client CRUD). |
| `008_cu_registry.sql` | Hub `game_registry` row: slug `co-up`, name_en `Dark Xiangqi (Co Up)`, 🃏, accent `#701e24`, `https://cotuongup.synerworlds.com`, stats `cu_stats`, prefix `cu_`, seat columns `red_id`/`black_id`, **sort 97** (current family max is Caro 96, Checkers 95 — verified 2026-10-21). Lights the game up on the hub with zero hub changes. (Slug `co-up` = hub/blog category convention per design doc §9; the subdomain stays `cotuongup.`.) |
| `009_cu_room_chat.sql` | In-room private chat: `cu_room_messages` (members — players AND spectators — read/post via `is_cu_room_member` policies; realtime; channel `cu-room-chat:<roomId>`). Per-move comments: `cu_room_comments` (member read/write + public-room guest read; **comment-XP trigger** +2 cap 10/day via the 003 ledger) and `cu_match_reactions` (member-only + public-room guest read). |
| `010_cu_room_delete.sql` | Owner room deletion: `cu_delete_room()` — soft-close (`status='closed'`) with server-side guards: non-leader → `not_leader`, active match → `match_in_progress`. Authenticated-only. |
| `011_cu_quests.sql` | **Comment-only no-op (plus a NOTICE marker).** Quests/check-ins are per-game tables in the foundation file in every sibling (Caro/Checkers 001) and here too (001: `cu_quests`, `cu_checkins` + claim RPCs); there is no shared cross-game quests table to glue into. The file documents that and reserves the slot in the run order. |
| `012_cu_reconcile.sql` | **C↔D reconciliation (Agent F) — run LAST.** Rooms vocab: `cu_rooms.status` `'open'`→`'lobby'` (+ `leader_id`/`rules` NOT NULL per spec §1.1); `cu_matches`: `room_id` nullable (corr), mode `'live'`→`'room'`, adds `match_no` + `updated_at`, `commitment` NOT NULL, spec `reason` check, `tournament_id` FK, corr-player read policy; `cu_match_secrets` gains `true_fen` (+`updated_at`; `full_fen` kept as deprecated alias). **Drops the undealt-match footguns** `cu_start_next_match` / `cu_rematch` / `cu_tournament_next_match` / `cu_finish_room_match` (spec §0.1 — all match creation goes through `POST /api/rooms/start`). **`cu_record_room_result` replaced with the exact spec §4/§5 signature** `(p_match_id, p_result, p_reason, p_revealed_layout default null, p_revealed_seed default null) returns jsonb {red_play_xp, black_play_xp, host_xp, host_user_id}`, **service_role ONLY**, comma-ply counting, room reset to `'lobby'`; `cu_respond_draw` now uses the spec reason `'draw-agreed'`. Adds spec-named `cu_cancel_match` (`cu_cancel_room_match` delegates). Discovery RPCs replaced with spec shapes: `cu_preview_room` → jsonb `{name, member_count, rules, is_public, status}`; `cu_list_public_rooms` → `(id, code, name, member_count, max_players, has_active_match)`; `cu_room_leaderboard` → hottest **rooms** `(room_id, name, code, matches_7d, member_count)` (the 003 body returned a player leaderboard); `cu_guest_room_detail` → `active_match` full masked row + comment `author`. Tournament pairings carry `match_id: null` from creation. Quests: `cu_claim_quest` accepts the client ids `first_game`/`first_puzzle`/`first_room` + new `cu_quest_status()` jsonb. `cu_community_puzzle_cards` learns `p_sort='featured'`. **Drops `cu_corr_games`/`cu_corr_secrets`** (spec §0.3; corr = `cu_matches mode='corr'`, 004 deadline columns stay) and repoints `cu_corr_my_turn()` at `cu_matches`. **Games sharing:** `cu_games.is_shared` + `cu_fetch_shared_game(p_id)` (row only when shared, anon-safe) + `cu_set_game_shared(p_id, p_shared)` (owner-only). |

## Conventions baked in

- **Seats are Red and Black everywhere** (schema, code, UI): `red_id` / `black_id` on every match table (rooms, tournaments, correspondence); **Red moves first**; the room host/rotation head takes Red; rematch swaps seats. Solo results are stored from the human's point of view (`win`/`loss`/`draw` in `cu_games`); room results from the seat's (`red`/`black`/`draw` in `cu_matches` / `cu_corr_games`).
- **Hidden information (the game's core rule):** true piece identities exist ONLY in `cu_match_secrets` / `cu_corr_secrets` (RLS on, zero client policies, revoked table grants, excluded from realtime) and, after a match ends, in `cu_matches.revealed_layout` / `revealed_seed` published by the server for shuffle verification against the deal-time `commitment` hash. Every realtime/REST payload a client can read is masked (`public_fen` with X/x). Clients have NO write path on match state — moves are validated by the engine in `app/api/rooms/move` with the service role.
- **Grant posture:** every `SECURITY DEFINER` function revokes from `public` **and** `anon`, then grants only to the roles that need it (internal helpers revoked from everyone including `authenticated`; the two RLS helpers keep anon+authenticated because policy evaluation needs them). All PL/pgSQL variables are `v_`-prefixed; no variable is named after a column its function touches. RLS on every table; anon reads only explicitly public data (leaderboard, public rooms, puzzles, discovery RPCs).
- **Display names:** `full_name` → `username` → email prefix from `auth.users` (the shared `profiles` table has **no** email column).

## After the SQL (launch pack)

1. **Vercel env** for project `cotuongup`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `SUPABASE_SERVICE_ROLE_KEY` (**required by the server-authoritative room routes** — they read/write `cu_match_secrets` with it), `VAPID_PRIVATE_KEY`, the 3 `LIVEKIT_*` values, plus the Cloudflare TURN pair. ⚠️ Known issue: the TURN token var is currently misnamed `LOUDFLARE_TURN_API_TOKEN` (missing the leading C) — rename it to `CLOUDFLARE_TURN_API_TOKEN` in the Vercel dashboard (value untouched) or voice chat falls back to STUN-only. Framework preset `nextjs`; `vercel.json` disables git auto-deploy (manual batched deploys, family regime).
2. **Domains:** `cotuongup.synerworlds.com` attached at Cloudflare/Vercel (canonical); `coup.synerworlds.com` redirects to it.
3. **Supabase Dashboard → Authentication → URL Configuration:** add `https://cotuongup.synerworlds.com/**` to redirect URLs (shared-SSO cookie domain `.synerworlds.com` is already the family setup).
4. **Play-tests (two accounts):** SSO sign-in, solo game + XP/Elo landing, room match end-to-end (**verify no realtime/REST payload ever contains a covered piece's true identity** — inspect the `cu_matches` feed and confirm the seed/layout only appear in `revealed_*` after the match ends), draw offer/accept, rematch seat swap, room chat + voice (incl. spectator listener), room delete guards, challenge accept auto-entering the room, correspondence move + deadline, daily + community puzzle solve (covered-piece puzzle must be rejected), push subscribe (shared table).

## Verification

`tools/cu-sql-smoke.mjs` (in this repo) — grant-faithful PGlite harness
(production-shape `profiles` without email, GUC-driven `auth.uid()`,
Supabase default table privileges, **no** blanket function grants;
denials assert role-specific codes). Run: `node tools/cu-sql-smoke.mjs`.
Current: **52/52 probes pass** over the full 001→012 chain, incl.
hand-computed Elo sequences (solo 800→802→842, floor clamp at 100;
room pairwise C 762→784 / D 800→778 with exact XP totals 113/15 —
now finalized as **service_role** through the spec-signature
`cu_record_room_result`, asserting `{red_play_xp:15, black_play_xp:5,
host_xp:5, host_user_id}` + reveal stamping + room back to `'lobby'`),
idempotent re-finish, guest + CvC exclusions, draw offer/accept,
`cu_cancel_match`, room chat RLS (member ok / non-member 42501 +
RLS-violation on insert), comment-XP trigger, correspondence on the
`cu_matches mode='corr'` path (RLS + comma-parity `cu_corr_my_turn`),
community-puzzle fully-revealed check + XP, setups self-RLS, registry
row values, room delete (`not_leader` / `match_in_progress` / success /
anon 42501), the 012 reconciliation probes (footgun RPCs + `cu_corr_*`
tables absent, spec discovery shapes, quest status/client-id claims,
games sharing: unshared → null, non-owner set → false, shared → row),
and the **secrets lockdown**: `cu_match_secrets` SELECT and INSERT
denied (42501) for BOTH anon and authenticated, absent from the
realtime publication, and direct client UPDATE of `cu_matches.moves`
affects zero rows. PASTE_ALL.sql (001→012) regenerated in both copies
(md5-identical).
