// cu-sql-smoke.mjs — grant-faithful smoke test for the Cờ Úp (cu_)
// migration set (001→012; 012 is the C↔D reconciliation — see its header). Runs every migration in order against a REAL
// Postgres (PGlite/WASM) with Supabase stubs whose `profiles` matches
// production's real shape (NO email column), then runs behavioral +
// grant probes, EXECUTING every PL/pgSQL function as authenticated
// (win+loss args, rows asserted), per the family migration protocol.
//
// GRANT-FAITHFUL: no blanket function grants anywhere — privileges come
// ONLY from the migrations themselves + Postgres defaults. Probes run
// under SET ROLE anon / authenticated with a GUC-driven auth.uid()
// stub, and denials assert role-specific error codes (42501 /
// not_leader / match_in_progress), so a probe running as the wrong
// role cannot pass.
//
// Usage: node tools/cu-sql-smoke.mjs
const { PGlite } = await import("@electric-sql/pglite").catch(() =>
  import("/home/hatch/workspace/tools/node_modules/@electric-sql/pglite/dist/index.js")
);
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBFEN = "xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1";
const MOVES20 = Array.from({ length: 20 }, (_, i) => "a" + i).join(" ");
const MOVES20C = Array.from({ length: 20 }, (_, i) => "a" + i).join(",");

const db = new PGlite();
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid
    language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (
    id uuid primary key, username text, full_name text, birth_date date,
    avatar_url text, city text, country text,
    created_at timestamptz not null default now());
  create table public.game_registry (
    slug text primary key, name_vi text not null, name_en text not null,
    tagline_vi text, tagline_en text, site_url text not null,
    stats_source text, icon text, accent text, sort int,
    prefix text not null default '', match_col_a text, match_col_b text,
    active boolean not null default true);
  create publication supabase_realtime;
`);
await db.exec(`
  alter default privileges for role postgres in schema public
    grant select, insert, update, delete on tables to authenticated;
  alter default privileges for role postgres in schema public
    grant select on tables to anon;
`);

const FILES = [
  "001_cu_foundation.sql", "002_cu_rooms.sql", "003_cu_room_play.sql",
  "004_cu_correspondence.sql", "005_cu_puzzles.sql", "006_cu_notifications.sql",
  "007_cu_setups.sql", "008_cu_registry.sql", "009_cu_room_chat.sql",
  "010_cu_room_delete.sql", "011_cu_quests.sql", "012_cu_reconcile.sql",
];
for (const f of FILES) {
  const sql = readFileSync(path.join(root, "supabase/migrations", f), "utf8");
  try {
    await db.exec(sql);
    console.log(`OK   ${f}`);
  } catch (e) {
    console.log(`FAIL ${f}\n  ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
async function asRole(role, uid) {
  await db.exec(`reset role; reset request.jwt.claim.sub;`);
  if (role) await db.exec(`set role ${role};`);
  if (uid) await db.exec(`set request.jwt.claim.sub = '${uid}';`);
}
const q = (sql) => db.query(sql);
async function ok(name, fn) {
  try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.log(`FAIL ${name}\n  ${e.message.split("\n")[0]}`); }
}
function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
async function expectDenied(name, sql) {
  try { await db.query(sql); fail++; console.log(`FAIL ${name}: expected 42501, succeeded`); }
  catch (e) {
    if (/42501|permission denied|row-level security/.test(e.message)) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name}: wrong error: ${e.message.split("\n")[0]}`); }
  }
}
async function expectRaise(name, sql, code) {
  try { await db.query(sql); fail++; console.log(`FAIL ${name}: expected raise ${code}, succeeded`); }
  catch (e) {
    if (e.message.includes(code)) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name}: wrong error: ${e.message.split("\n")[0]}`); }
  }
}

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";
const D = "44444444-4444-4444-4444-444444444444";
await asRole(null, null);
for (const [u, em, fn] of [
  [A, "mai@example.com", "Mai Chi"], [B, "kien@example.com", "Kiên"],
  [C, "c@example.com", "C"], [D, "d@example.com", "D"],
]) {
  await q(`insert into auth.users (id, email) values ('${u}', '${em}')`);
  await q(`insert into profiles (id, username, full_name) values ('${u}', '${fn}', '${fn}')`);
}

// ---------- 1. solo Elo (hand-computed, same model as siblings) ----------
// Win vs L1 (ai 300) from 800: expected=0.94677, delta=floor(40*0.05323+0.5)=2 -> 802. XP=15.
await ok("solo win L1 -> rating 802, xp 15, fen stored", async () => {
  await asRole("authenticated", A);
  const r = await q(`select public.cu_record_game_result('red',1,'win',20,'a0a1','FULLFEN','${PUBFEN}') as xp`);
  eq(r.rows[0].xp, 15, "xp");
  const s = await q(`select rating, peak_rating, xp, games_played, wins, losses, draws from cu_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 802, "rating"); eq(s.rows[0].xp, 15, "stats xp");
  eq(s.rows[0].wins, 1, "wins"); eq(s.rows[0].losses, 0, "losses");
  const g = await q(`select full_fen, public_fen from cu_games where user_id='${A}'`);
  eq(g.rows[0].full_fen, "FULLFEN", "full_fen"); eq(g.rows[0].public_fen, PUBFEN, "public_fen");
  const h = await q(`select count(*)::int c from cu_rating_history where user_id='${A}'`);
  eq(h.rows[0].c, 1, "history rows");
});
await ok("solo loss L12 -> rating stays 802, xp +3", async () => {
  await asRole("authenticated", A);
  const r = await q(`select public.cu_record_game_result('red',12,'loss',30,'a0a1') as xp`);
  eq(r.rows[0].xp, 3, "xp");
  const s = await q(`select rating, xp, losses from cu_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 802, "rating"); eq(s.rows[0].xp, 18, "xp"); eq(s.rows[0].losses, 1, "losses");
});
await ok("solo win L12 -> rating 842", async () => {
  await asRole("authenticated", A);
  await q(`select public.cu_record_game_result('black',12,'win',40,'a0a1')`);
  const s = await q(`select rating, peak_rating, xp from cu_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 842, "rating"); eq(s.rows[0].xp, 88, "xp");
});
await ok("rating floor 100", async () => {
  await asRole(null, null);
  await q(`update cu_stats set rating=105 where user_id='${A}'`);
  await asRole("authenticated", A);
  await q(`select public.cu_record_game_result('red',1,'loss',20,'a0a1')`);
  const s = await q(`select rating from cu_stats where user_id='${A}'`);
  eq(s.rows[0].rating, 100, "floored");
});
await ok("guest record: history row, no stats", async () => {
  await asRole("anon", null);
  const r = await q(`select public.cu_record_game_result('red',1,'win',20,'a0a1') as xp`);
  eq(r.rows[0].xp, 15, "guest xp");
  await asRole(null, null);
  const g = await q(`select count(*)::int c from cu_games where user_id is null`);
  eq(g.rows[0].c, 1, "guest row");
});
await ok("cvc rows excluded from stats", async () => {
  await asRole("authenticated", B);
  await q(`select public.cu_record_game_result('cvc',12,'win',60,'a0a1')`);
  const s = await q(`select count(*)::int c from cu_stats where user_id='${B}'`);
  eq(s.rows[0].c, 0, "no stats");
});
await ok("game events write + stats RPC", async () => {
  await asRole("authenticated", A);
  await q(`select public.record_cu_game_event('start', null, 3, 'red', null)`);
  const s = await q(`select public.cu_game_stats() as j`);
  eq(s.rows[0].j.plays_total, 1, "plays_total");
  await asRole("anon", null);
  await expectDenied("anon denied cu_game_stats (42501)", `select public.cu_game_stats()`);
  await asRole("anon", null);
  await expectDenied("anon denied cu_claim_checkin (42501)", `select * from public.cu_claim_checkin()`);
});

// ---------- 2. check-in + quests ----------
await ok("checkin streak 1 +10 xp, idempotent; welcome; quests", async () => {
  await asRole("authenticated", C);
  const r1 = await q(`select * from public.cu_claim_checkin()`);
  eq(r1.rows[0].streak, 1, "streak"); eq(r1.rows[0].xp_awarded, 10, "xp"); eq(r1.rows[0].already_claimed, false, "fresh");
  const r2 = await q(`select * from public.cu_claim_checkin()`);
  eq(r2.rows[0].already_claimed, true, "idempotent");
  eq((await q(`select public.cu_claim_welcome()`)).rows[0].cu_claim_welcome, true, "welcome");
  eq((await q(`select public.cu_claim_welcome()`)).rows[0].cu_claim_welcome, false, "welcome once");
  eq((await q(`select public.cu_claim_quest('play_1')`)).rows[0].cu_claim_quest, false, "play_1 not done");
  await q(`select public.cu_record_game_result('red',1,'loss',10,'a0')`);
  eq((await q(`select public.cu_claim_quest('play_1')`)).rows[0].cu_claim_quest, true, "play_1");
  eq((await q(`select public.cu_claim_quest('bogus')`)).rows[0].cu_claim_quest, false, "bogus");
  // C xp: checkin 10 + welcome 50 + loss 3 + quest 20 = 83
  const s = await q(`select xp from cu_stats where user_id='${C}'`);
  eq(s.rows[0].xp, 83, "C total xp");
});

// ---------- 3. room flow + secrets lockdown ----------
let roomId, roomCode, matchId;
await ok("create room + join (idempotent)", async () => {
  await asRole("authenticated", A);
  const r = await q(`select * from public.cu_create_room('Phong test', true, 8)`);
  roomId = r.rows[0].id; roomCode = r.rows[0].code;
  eq(roomCode.length, 6, "code len");
  await asRole("authenticated", B);
  const j = await q(`select * from public.cu_join_room('${roomCode}')`);
  eq(j.rows[0].id, roomId, "joined");
  const j2 = await q(`select * from public.cu_join_room('${roomCode}')`);
  eq(j2.rows[0].id, roomId, "idempotent");
});
await ok("match dealt by server route (owner insert): spec shape", async () => {
  // POST /api/rooms/start deals in TS and inserts BOTH rows with the
  // service role; the SQL surface no longer creates matches (012 drops
  // cu_start_next_match & friends — asserted in section 11).
  await asRole(null, null);
  const m = await q(`insert into cu_matches
    (room_id, red_id, black_id, mode, match_no, public_fen, moves, commitment)
    values ('${roomId}', '${A}', '${B}', 'room', 1, '${PUBFEN}', '', 'commit-abc')
    returning *`);
  matchId = m.rows[0].id;
  eq(m.rows[0].red_id, A, "red is leader");
  eq(m.rows[0].black_id, B, "black");
  eq(m.rows[0].mode, "room", "mode room (012 vocab)");
  eq(m.rows[0].commitment, "commit-abc", "dealt commitment set");
  eq(m.rows[0].status, "active", "active");
  if (!m.rows[0].updated_at) throw new Error("updated_at missing");
});
await ok("secrets: service-role insert works (owner)", async () => {
  await asRole(null, null);
  await q(`insert into cu_match_secrets (match_id, true_layout, seed, true_fen)
           values ('${matchId}', '{"layout":"x","pieces":[]}', 'seed-xyz', 'FULL')`);
  const s = await q(`select seed from cu_match_secrets where match_id='${matchId}'`);
  eq(s.rows[0].seed, "seed-xyz", "seed stored");
});
await ok("secrets: authenticated CANNOT read (42501)", async () => {
  await asRole("authenticated", A);
  await expectDenied("auth select secrets denied", `select * from cu_match_secrets`);
});
await ok("secrets: anon CANNOT read (42501)", async () => {
  await asRole("anon", null);
  await expectDenied("anon select secrets denied", `select * from cu_match_secrets`);
});
await ok("secrets: authenticated CANNOT insert (42501)", async () => {
  await asRole("authenticated", B);
  await expectDenied("auth insert secrets denied",
    `insert into cu_match_secrets (match_id, true_layout, seed) values (gen_random_uuid(), '[]', 'x')`);
});
await ok("secrets: not in realtime publication", async () => {
  await asRole(null, null);
  const r = await q(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime' and tablename='cu_match_secrets'`);
  eq(r.rows[0].c, 0, "not published");
  const r2 = await q(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime' and tablename='cu_matches'`);
  eq(r2.rows[0].c, 1, "matches published");
});
await ok("matches: player cannot UPDATE moves directly (server-authoritative)", async () => {
  await asRole("authenticated", A);
  const r = await q(`update cu_matches set moves='hacked' where id='${matchId}' returning id`);
  eq(r.rows.length, 0, "no rows updated (no policy)");
  await asRole(null, null);
  const m = await q(`select moves from cu_matches where id='${matchId}'`);
  eq(m.rows[0].moves, "", "moves untouched");
});

// ---------- 4. room result: pairwise Elo + XP, idempotent ----------
let room2Id, match2Id;
await ok("room2: C (leader/red, 762 after solo loss) beats D (fresh 800)", async () => {
  await asRole("authenticated", C);
  const r = await q(`select * from public.cu_create_room('Phong 2', false, 8)`);
  room2Id = r.rows[0].id;
  const code = r.rows[0].code;
  await asRole("authenticated", D);
  await q(`select * from public.cu_join_room('${code}')`);
  await asRole(null, null);
  const m = await q(`insert into cu_matches
    (room_id, red_id, black_id, mode, match_no, public_fen, moves, commitment)
    values ('${room2Id}', '${C}', '${D}', 'room', 1, '${PUBFEN}', '${MOVES20C}', 'commit-2')
    returning *`);
  match2Id = m.rows[0].id;
  eq(m.rows[0].red_id, C, "red=C"); eq(m.rows[0].black_id, D, "black=D");
  // Finalize as the SERVICE ROLE (the move route is the only caller;
  // spec §4/§5 breakdown keys + reveal stamped).
  await asRole("service_role", null);
  const fin = await q(`select public.cu_record_room_result('${match2Id}','red','checkmate','{"layout":"L","true_fen":"F"}','seed-2') as j`);
  eq(fin.rows[0].j.red_play_xp, 15, "winner (red) play xp");
  eq(fin.rows[0].j.black_play_xp, 5, "loser (black) play xp");
  eq(fin.rows[0].j.host_xp, 5, "host xp");
  eq(fin.rows[0].j.host_user_id, C, "host is room2 leader");
  await asRole(null, null);
  const mm = await q(`select status, revealed_seed, result from cu_matches where id='${match2Id}'`);
  eq(mm.rows[0].status, "finished", "finished");
  eq(mm.rows[0].revealed_seed, "seed-2", "seed revealed at finish");
  const rr = await q(`select status from cu_rooms where id='${room2Id}'`);
  eq(rr.rows[0].status, "lobby", "room back to lobby (012 vocab)");
  await asRole("authenticated", C);
  // Pairwise Elo: C entered at 762 (800 - 38 solo loss vs L1),
  // D fresh at 800. C expected=1/(1+10^(38/400))=0.4457,
  // win delta=floor(40*(1-0.4457)+0.5)=22 -> 784.
  // D expected=0.5543, loss delta=floor(40*(0-0.5543)+0.5)=-22 -> 778.
  const sc = await q(`select rating, xp, wins, games_played from cu_stats where user_id='${C}'`);
  eq(sc.rows[0].rating, 784, "C rating 784");
  eq(sc.rows[0].wins, 1, "C room win counted");
  // C xp: 83 (earlier) + play 15 + host 5 + daily 10 = 113
  eq(sc.rows[0].xp, 113, "C xp 113");
  await asRole("authenticated", D);
  const sd = await q(`select rating, xp, losses from cu_stats where user_id='${D}'`);
  eq(sd.rows[0].rating, 778, "D rating 778");
  eq(sd.rows[0].xp, 15, "D xp 15 (5 play + 10 daily)");
  eq(sd.rows[0].losses, 1, "D loss");
});
await ok("re-finish is idempotent (no double Elo/XP)", async () => {
  await asRole("service_role", null);
  const fin = await q(`select public.cu_record_room_result('${match2Id}','red','checkmate') as j`);
  eq(fin.rows[0].j.red_play_xp, 0, "no xp on re-finish");
  eq(fin.rows[0].j.host_user_id, null, "zero breakdown host null");
  await asRole("authenticated", C);
  const sc = await q(`select rating, xp from cu_stats where user_id='${C}'`);
  eq(sc.rows[0].rating, 784, "rating unchanged"); eq(sc.rows[0].xp, 113, "xp unchanged");
});
await ok("anon denied cu_record_room_result (42501)", async () => {
  await asRole("anon", null);
  await expectDenied("anon room result denied", `select public.cu_record_room_result('${match2Id}','red','x')`);
});
await ok("authenticated denied cu_record_room_result (42501, service-only)", async () => {
  await asRole("authenticated", C);
  await expectDenied("auth room result denied", `select public.cu_record_room_result('${match2Id}','red','x')`);
});
await ok("authenticated denied internal cu_award_room_xp (42501)", async () => {
  await asRole("authenticated", A);
  await expectDenied("internal helper denied", `select public.cu_award_room_xp('${A}','play','${matchId}',5)`);
});
await ok("cu_cancel_match (spec name) cancels an active match", async () => {
  await asRole(null, null);
  const m = await q(`insert into cu_matches
    (room_id, red_id, black_id, mode, match_no, public_fen, moves, commitment)
    values ('${room2Id}', '${D}', '${C}', 'room', 2, '${PUBFEN}', '', 'commit-3')
    returning *`);
  await asRole("authenticated", C);
  await q(`select public.cu_cancel_match('${m.rows[0].id}')`);
  await asRole(null, null);
  const s = await q(`select status, reason from cu_matches where id='${m.rows[0].id}'`);
  eq(s.rows[0].status, "cancelled", "cancelled");
  eq(s.rows[0].reason, "cancelled", "reason cancelled");
});

// ---------- 5. draw offer / accept on room1 match ----------
await ok("draw offer + accept finishes as draw", async () => {
  await asRole(null, null);
  await q(`update cu_matches set moves='${MOVES20}' where id='${matchId}'`);
  await asRole("authenticated", B);
  await q(`select public.cu_offer_draw('${matchId}')`);
  await asRole("authenticated", A);
  const r = await q(`select public.cu_respond_draw('${matchId}', true) as j`);
  await asRole(null, null);
  const m = await q(`select status, result from cu_matches where id='${matchId}'`);
  eq(m.rows[0].status, "finished", "finished");
  eq(m.rows[0].result, "draw", "draw");
});

// ---------- 6. room chat + comments ----------
await ok("room chat: member posts, non-member blocked by RLS", async () => {
  await asRole("authenticated", A);
  await q(`insert into cu_room_messages (room_id, user_id, body) values ('${roomId}', '${A}', 'xin chao')`);
  const mine = await q(`select count(*)::int c from cu_room_messages where room_id='${roomId}'`);
  eq(mine.rows[0].c, 1, "member sees message");
  await asRole("authenticated", C);
  const other = await q(`select count(*)::int c from cu_room_messages where room_id='${roomId}'`);
  eq(other.rows[0].c, 0, "non-member sees nothing");
  await expectDenied("non-member insert blocked", `insert into cu_room_messages (room_id, user_id, body) values ('${roomId}', '${C}', 'spam')`);
});
await ok("comment insert fires XP trigger (ledger row)", async () => {
  await asRole("authenticated", B);
  await q(`insert into cu_room_comments (room_id, match_id, move_number, user_id, body) values ('${roomId}', '${matchId}', 3, '${B}', 'nuoc hay qua')`);
  await asRole(null, null);
  const l = await q(`select count(*)::int c from cu_room_xp_ledger where user_id='${B}' and kind='comment'`);
  eq(l.rows[0].c, 1, "comment ledger row");
});

// ---------- 7. puzzles ----------
await ok("community puzzle: fully_revealed enforced, solve pays XP", async () => {
  await asRole("authenticated", C);
  const p = await q(`insert into cu_puzzles (creator_id, title, fen, fully_revealed, moves_to_mate, solution)
                     values ('${C}', 'Mate in 1', 'FULLFEN', true, 1, 'a0a1') returning id`);
  const pid = p.rows[0].id;
  await expectRaise("covered puzzle rejected (check)", `insert into cu_puzzles (creator_id, fen, fully_revealed, moves_to_mate, solution) values ('${C}', 'X', false, 1, 'a0a1')`, "cu_puzzles_fully_revealed_check");
  await asRole("authenticated", D);
  const xpBefore = (await q(`select xp from cu_stats where user_id='${D}'`)).rows[0].xp;
  const got = await q(`select public.cu_solve_community_puzzle('${pid}') as xp`);
  eq(got.rows[0].xp, 10, "solver xp");
  const again = await q(`select public.cu_solve_community_puzzle('${pid}') as xp`);
  eq(again.rows[0].xp, 0, "re-solve pays 0");
  const cards = await q(`select * from public.cu_community_puzzle_cards('new', 10, 0, false)`);
  eq(cards.rows.length, 1, "one card");
  eq(cards.rows[0].solved_by_me, true, "solved_by_me");
  const like = await q(`select public.cu_toggle_community_like('${pid}') as j`);
  eq(like.rows[0].j.liked, true, "liked");
});
await ok("daily puzzle solve idempotent +15", async () => {
  await asRole("authenticated", D);
  eq((await q(`select public.cu_record_puzzle_solve(current_date) as b`)).rows[0].b, true, "first");
  eq((await q(`select public.cu_record_puzzle_solve(current_date) as b`)).rows[0].b, false, "second");
});

// ---------- 8. correspondence (cu_matches mode='corr', spec §0.3) ----------
await ok("corr: cu_matches row, players read own, stranger none, my_turn parity", async () => {
  await asRole(null, null);
  const g = await q(`insert into cu_matches
    (room_id, red_id, black_id, mode, public_fen, moves, commitment)
    values (null, '${C}', '${D}', 'corr', '${PUBFEN}', '', 'commit-corr')
    returning id`);
  const gid = g.rows[0].id;
  await q(`insert into cu_match_secrets (match_id, true_layout, seed, true_fen)
           values ('${gid}', '{"layout":"x","pieces":[]}', 'corr-seed', 'FULL')`);
  await asRole("authenticated", C);
  const mine = await q(`select * from public.cu_corr_my_turn()`);
  eq(mine.rows.length, 1, "red to move sees game");
  eq(mine.rows[0].game_id, gid, "game id");
  const seenC = await q(`select count(*)::int c from cu_matches where id='${gid}' and mode='corr'`);
  eq(seenC.rows[0].c, 1, "creator reads own corr (012 policy)");
  await asRole("authenticated", D);
  const seen = await q(`select count(*)::int c from cu_matches where id='${gid}'`);
  eq(seen.rows[0].c, 1, "opponent reads");
  const notMine = await q(`select * from public.cu_corr_my_turn()`);
  eq(notMine.rows.length, 0, "black not to move yet");
  await asRole(null, null);
  await q(`update cu_matches set moves='a0a1' where id='${gid}'`);
  await asRole("authenticated", D);
  const nowMine = await q(`select * from public.cu_corr_my_turn()`);
  eq(nowMine.rows.length, 1, "black to move after 1 ply (comma parity)");
  await asRole("authenticated", A);
  const hidden = await q(`select count(*)::int c from cu_matches where id='${gid}'`);
  eq(hidden.rows[0].c, 0, "stranger sees none");
  await expectDenied("corr secret (cu_match_secrets) unreadable", `select * from cu_match_secrets where match_id='${gid}'`);
});

// ---------- 9. setups + registry ----------
await ok("setups self-RLS with placements jsonb", async () => {
  await asRole("authenticated", A);
  await q(`insert into cu_setups (user_id, name, fen, placements) values ('${A}', 'My setup', 'FULLFEN', '[{"x":0,"y":9,"color":"red","trueType":"R","covered":true}]')`);
  const mine = await q(`select placements from cu_setups where user_id='${A}'`);
  eq(mine.rows[0].placements[0].trueType, "R", "placement stored");
  await asRole("authenticated", B);
  const other = await q(`select count(*)::int c from cu_setups where user_id='${A}'`);
  eq(other.rows[0].c, 0, "other user sees none");
});
await ok("registry row: co-up / 97 / cu_ / red-black", async () => {
  await asRole(null, null);
  const r = await q(`select * from game_registry where slug='co-up'`);
  eq(r.rows.length, 1, "row exists");
  eq(r.rows[0].sort, 97, "sort");
  eq(r.rows[0].prefix, "cu_", "prefix");
  eq(r.rows[0].stats_source, "cu_stats", "stats_source");
  eq(r.rows[0].match_col_a, "red_id", "col a");
  eq(r.rows[0].match_col_b, "black_id", "col b");
  eq(r.rows[0].site_url, "https://cotuongup.synerworlds.com", "url");
  eq(r.rows[0].icon, "🃏", "icon");
  eq(r.rows[0].accent, "#701e24", "accent");
});

// ---------- 10. room delete guards ----------
await ok("delete: non-leader -> not_leader", async () => {
  await asRole("authenticated", B);
  await expectRaise("not_leader", `select public.cu_delete_room('${roomId}')`, "not_leader");
});
await ok("delete: active match -> match_in_progress; after cancel -> success", async () => {
  await asRole(null, null);
  const m = await q(`insert into cu_matches
    (room_id, red_id, black_id, mode, match_no, public_fen, moves, commitment)
    values ('${roomId}', '${A}', '${B}', 'room', 2, '${PUBFEN}', '', 'commit-del')
    returning *`);
  await asRole("authenticated", A);
  await expectRaise("match_in_progress", `select public.cu_delete_room('${roomId}')`, "match_in_progress");
  await q(`select public.cu_cancel_room_match('${m.rows[0].id}')`);
  await q(`select public.cu_delete_room('${roomId}')`);
  const r = await q(`select status from cu_rooms where id='${roomId}'`);
  eq(r.rows[0].status, "closed", "closed");
});
await ok("anon denied cu_delete_room (42501)", async () => {
  await asRole("anon", null);
  await expectDenied("anon delete denied", `select public.cu_delete_room('${roomId}')`);
});
await ok("guest discovery: preview + public list + guest detail (masked only)", async () => {
  await asRole("anon", null);
  const p = await q(`select public.cu_preview_room('${roomCode}') as j`);
  eq(p.rows[0].j, null, "closed room hidden from preview (jsonb null)");
  const l = await q(`select * from public.cu_list_public_rooms()`);
  eq(l.rows.length, 0, "closed room not listed");
  const lb = await q(`select * from public.cu_leaderboard(15, 0)`);
  if (lb.rows.length < 1) throw new Error("leaderboard empty");
});

// ---------- 11. 012 reconciliation ----------
await ok("012: footgun RPCs + corr tables dropped, spec record overload only", async () => {
  await asRole(null, null);
  const fns = await q(`select proname, pg_get_function_identity_arguments(oid) as args
    from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('cu_start_next_match','cu_rematch','cu_tournament_next_match',
                      'cu_finish_room_match','cu_record_room_result')`);
  const names = fns.rows.map((r) => r.proname);
  if (names.includes("cu_start_next_match")) throw new Error("start_next_match still exists");
  if (names.includes("cu_rematch")) throw new Error("cu_rematch still exists");
  if (names.includes("cu_tournament_next_match")) throw new Error("tournament_next_match still exists");
  if (names.includes("cu_finish_room_match")) throw new Error("finish_room_match still exists");
  const rec = fns.rows.filter((r) => r.proname === "cu_record_room_result");
  eq(rec.length, 1, "exactly one record_room_result overload");
  if (!rec[0].args.includes("p_revealed_layout")) throw new Error("spec args missing: " + rec[0].args);
  eq((await q(`select to_regclass('public.cu_corr_games') as r`)).rows[0].r, null, "cu_corr_games dropped");
  eq((await q(`select to_regclass('public.cu_corr_secrets') as r`)).rows[0].r, null, "cu_corr_secrets dropped");
  const pub = await q(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime' and tablename='cu_corr_games'`);
  eq(pub.rows[0].c, 0, "corr table out of realtime");
});
await ok("012: discovery shapes (preview jsonb, public list, guest detail, hot rooms)", async () => {
  await asRole("authenticated", A);
  const r = await q(`select * from public.cu_create_room('Phong public', true, 8)`);
  const code = r.rows[0].code; const rid = r.rows[0].id;
  eq(r.rows[0].status, "lobby", "new rooms start in lobby");
  await asRole("anon", null);
  const pv = await q(`select public.cu_preview_room('${code}') as j`);
  eq(pv.rows[0].j.name, "Phong public", "preview name");
  eq(pv.rows[0].j.member_count, 1, "preview member_count");
  eq(pv.rows[0].j.rules, "", "preview rules default");
  const list = await q(`select * from public.cu_list_public_rooms()`);
  const row = list.rows.find((x) => x.id === rid);
  if (!row) throw new Error("public room not listed");
  eq(row.max_players, 8, "list max_players");
  eq(row.has_active_match, false, "list has_active_match");
  const gd = await q(`select public.cu_guest_room_detail('${rid}') as j`);
  eq(gd.rows[0].j.room.name, "Phong public", "guest detail room name");
  eq(gd.rows[0].j.room.member_count, 1, "guest detail member_count");
  eq(gd.rows[0].j.active_match, null, "guest detail active_match null");
  eq(gd.rows[0].j.members.length, 1, "guest detail members");
  const hot = await q(`select * from public.cu_room_leaderboard()`);
  if (!hot.rows.some((x) => x.room_id === rid)) throw new Error("hot rooms missing room");
});
await ok("012: quest status + client-id claim (first_game maps play_1)", async () => {
  await asRole("authenticated", A);
  const st = await q(`select public.cu_quest_status() as j`);
  eq(st.rows[0].j.first_game.done, true, "A has played a game");
  eq(st.rows[0].j.first_game.claimed, false, "A has not claimed");
  eq(st.rows[0].j.first_room.done, true, "A is a room member");
  eq((await q(`select public.cu_claim_quest('first_game') as b`)).rows[0].b, true, "claim first_game");
  eq((await q(`select public.cu_claim_quest('first_game') as b`)).rows[0].b, false, "claim once only");
  const st2 = await q(`select public.cu_quest_status() as j`);
  eq(st2.rows[0].j.first_game.claimed, true, "claimed after claim");
});
await ok("012: games sharing (fetch gated on is_shared, owner-only set)", async () => {
  await asRole("authenticated", A);
  const g = await q(`select id from cu_games where user_id='${A}' order by created_at limit 1`);
  const gid = g.rows[0].id;
  await asRole("anon", null);
  eq((await q(`select public.cu_fetch_shared_game('${gid}') as j`)).rows[0].j, null, "unshared -> null");
  await asRole("authenticated", B);
  eq((await q(`select public.cu_set_game_shared('${gid}', true) as b`)).rows[0].b, false, "non-owner cannot share");
  await asRole("authenticated", A);
  eq((await q(`select public.cu_set_game_shared('${gid}', true) as b`)).rows[0].b, true, "owner shares");
  await asRole("anon", null);
  const shared = await q(`select public.cu_fetch_shared_game('${gid}') as j`);
  eq(shared.rows[0].j.id, gid, "shared row fetchable by anon");
  eq(shared.rows[0].j.is_shared, true, "is_shared stamped");
  await asRole("authenticated", A);
  eq((await q(`select public.cu_set_game_shared('${gid}', false) as b`)).rows[0].b, true, "owner unshares");
  await asRole("anon", null);
  eq((await q(`select public.cu_fetch_shared_game('${gid}') as j`)).rows[0].j, null, "unshared again -> null");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log("SMOKE TEST PASSED");
