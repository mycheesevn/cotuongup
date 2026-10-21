-- 012_cu_reconcile.sql — Cờ Úp C↔D reconciliation (Agent F).
-- Run in the Dashboard SQL editor AFTER 011. Idempotent where practical.
--
-- Agent C's ROOMS_SPEC.md is normative for rooms; migrations 002–004 were
-- written before it landed and diverged from it (and from the client TS,
-- which was written against the spec). This file brings the schema and
-- the RPC surface into line WITHOUT editing 001–011:
--
--   A. cu_rooms: status vocabulary 'open' -> 'lobby' (spec §1.1 + the
--      client `Room` type); leader_id / rules become NOT NULL with the
--      spec defaults.
--   B. cu_matches: room_id becomes NULLABLE (correspondence rows have no
--      room, spec §0.3/§1.3); mode vocabulary 'live' -> 'room' (spec +
--      every client query); adds the missing match_no + updated_at
--      columns the TS row types require; commitment becomes NOT NULL
--      (matches are only ever created dealt, by the server start route);
--      reason gains the spec check; tournament_id gains its FK; spec
--      indexes added.
--   C. cu_match_secrets: adds true_fen (the column the server route
--      actually reads/writes — 002 called it full_fen) + updated_at.
--      full_fen is kept, backfilled into true_fen, as a deprecated alias.
--   D. Footgun RPCs dropped: cu_start_next_match / cu_rematch /
--      cu_tournament_next_match created UNDEALT match rows (no secret);
--      per spec §0.1 all match creation goes through POST /api/rooms/start
--      and no client calls them. cu_finish_room_match (alias of the old
--      record signature) goes with them.
--   E. cu_record_room_result replaced with the exact spec §4/§5
--      signature + semantics: (p_match_id, p_result, p_reason,
--      p_revealed_layout default null, p_revealed_seed default null)
--      returns jsonb {red_play_xp, black_play_xp, host_xp, host_user_id},
--      EXECUTE granted to service_role ONLY (the move route is the only
--      caller; auth.uid() is null there, so it authorizes by match
--      state). Ply counting now splits the comma-joined UCI list (spec
--      §0.4; the old body split on spaces). Room reset is 'playing' ->
--      'lobby'. cu_respond_draw now passes the spec reason 'draw-agreed'
--      (was 'draw_agreed').
--   F. cu_cancel_match(p_match_id) created under the spec name;
--      cu_cancel_room_match is kept as a delegating wrapper.
--   G. Discovery RPCs replaced with the spec shapes:
--      cu_preview_room -> jsonb {name, member_count, rules, is_public,
--      status} or null; cu_list_public_rooms -> (id, code, name,
--      member_count, max_players, has_active_match);
--      cu_room_leaderboard -> hottest ROOMS (room_id, name, code,
--      matches_7d, member_count) — the old body returned a PLAYER
--      leaderboard, which is not what the client renders;
--      cu_guest_room_detail -> {room{…,rules,member_count,max_players},
--      members[{user_id,name,role}], active_match (FULL masked row),
--      comments[{id,body,created_at,author}]}, raising room_not_found
--      for non-public rooms (the old body returned a 'match' key, no
--      rules/counts, and comment 'name' instead of 'author').
--   H. cu_create_tournament pairings now carry 'match_id': null from
--      the start (spec §1.8).
--   I. Quests: cu_claim_quest now also accepts the client quest ids
--      'first_game' | 'first_puzzle' | 'first_room' (normalized onto
--      the stored ids play_1 / first_puzzle / join_room; the legacy
--      spellings keep working), and cu_quest_status() returns the
--      {done, claimed} jsonb the QuestCard renders. (The client
--      previously called the Xiangqi-era quest_status / claim_quest
--      RPCs, which never existed for cu_.)
--   J. cu_community_puzzle_cards learns p_sort='featured' (the client's
--      featured shelf previously fell through to newest-first).
--   K. Correspondence: cu_corr_games / cu_corr_secrets DROPPED (spec
--      §0.3 — corr is cu_matches mode='corr'; the tables were unused by
--      every client). The 004 deadline columns on cu_matches
--      (move_deadline, turn_deadline_hours) STAY. cu_corr_my_turn() is
--      repointed at cu_matches with comma-ply parity.
--   L. Games sharing (Agent E's documented gap): cu_games.is_shared +
--      cu_fetch_shared_game(p_id) (row only when shared; anon-safe) +
--      cu_set_game_shared(p_id, p_shared) (owner-only).

-- ============ A. cu_rooms vocabulary + nullability (spec §1.1) ============
update cu_rooms set status = 'lobby' where status = 'open';
alter table cu_rooms alter column status set default 'lobby';
alter table cu_rooms drop constraint if exists cu_rooms_status_check;
alter table cu_rooms
  add constraint cu_rooms_status_check
  check (status in ('lobby', 'playing', 'closed'));
update cu_rooms set rules = '' where rules is null;
alter table cu_rooms alter column rules set default '';
alter table cu_rooms alter column rules set not null;
alter table cu_rooms alter column leader_id set not null;

-- ============ B. cu_matches (spec §1.3) ============
-- Correspondence rows have room_id NULL.
alter table cu_matches alter column room_id drop not null;
-- Mode vocabulary: 'live' -> 'room'.
update cu_matches set mode = 'room' where mode = 'live';
alter table cu_matches alter column mode set default 'room';
alter table cu_matches drop constraint if exists cu_matches_mode_check;
alter table cu_matches
  add constraint cu_matches_mode_check check (mode in ('room', 'corr'));
-- Columns the TS row types require but 002 never created.
alter table cu_matches add column if not exists match_no int;
alter table cu_matches
  add column if not exists updated_at timestamptz not null default now();
-- Matches are only created dealt (server start route): any legacy
-- undealt row (commitment NULL, from the dropped RPC flow) is cancelled,
-- then commitment becomes NOT NULL per spec.
update cu_matches
  set status = 'cancelled', reason = 'cancelled', finished_at = now()
  where commitment is null and status = 'active';
update cu_matches set commitment = '' where commitment is null;
alter table cu_matches alter column commitment set not null;
-- Reason vocabulary (spec §1.3).
alter table cu_matches drop constraint if exists cu_matches_reason_check;
alter table cu_matches
  add constraint cu_matches_reason_check
  check (reason is null or reason in
    ('checkmate', 'stalemate', 'draw-120', 'resign', 'draw-agreed',
     'cancelled'));
-- tournament_id FK (cu_tournaments only exists from 003, so 002 could
-- not declare it).
update cu_matches set tournament_id = null
  where tournament_id is not null
    and tournament_id not in (select id from cu_tournaments);
do $$ begin
  alter table cu_matches
    add constraint cu_matches_tournament_id_fkey
    foreign key (tournament_id) references cu_tournaments(id)
    on delete set null;
exception when duplicate_object then null;
end $$;
create index if not exists cu_matches_red_status_idx
  on cu_matches (red_id, status);
create index if not exists cu_matches_black_status_idx
  on cu_matches (black_id, status);
create index if not exists cu_matches_corr_idx
  on cu_matches (mode, updated_at desc) where mode = 'corr';

-- Corr players must be able to READ their own matches (002's policies
-- only covered room members / public rooms; a corr row has no room).
drop policy if exists "cu_matches corr player read" on cu_matches;
create policy "cu_matches corr player read" on cu_matches
  for select using (
    mode = 'corr' and (auth.uid() = red_id or auth.uid() = black_id));

-- ============ C. cu_match_secrets (spec §1.4) ============
alter table cu_match_secrets
  add column if not exists true_fen text not null default '';
update cu_match_secrets set true_fen = full_fen
  where true_fen = '' and full_fen <> '';
alter table cu_match_secrets
  add column if not exists updated_at timestamptz not null default now();
comment on column cu_match_secrets.full_fen is
  'DEPRECATED (012): pre-spec name of true_fen; kept for back-compat.';

-- ============ D. Drop undealt-match footguns (spec §0.1) ============
drop function if exists public.cu_start_next_match(uuid);
drop function if exists public.cu_rematch(uuid);
drop function if exists public.cu_tournament_next_match(uuid);
drop function if exists public.cu_finish_room_match(uuid, text, text);

-- ============ E. cu_record_room_result — exact spec §4/§5 ============
-- The old 3-arg overload (granted to authenticated, caller-sliced
-- {play_xp, host_xp, daily_xp} return, space-split ply count) is dropped
-- and replaced by the spec signature below.
drop function if exists public.cu_record_room_result(uuid, text, text);

create or replace function public.cu_record_room_result(
  p_match_id uuid,
  p_result text,
  p_reason text,
  p_revealed_layout jsonb default null,
  p_revealed_seed text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match cu_matches;
  v_room cu_rooms;
  v_winner uuid;
  v_loser uuid;
  v_plies int;
  v_ok boolean;
  v_host_today int;
  v_red_play int := 0;
  v_black_play int := 0;
  v_host_xp int := 0;
  v_host_id uuid := null;
  v_red_total int := 0;
  v_black_total int := 0;
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
  v_pairings jsonb;
  v_new_pairings jsonb;
  v_elem jsonb;
  v_remaining int;
  v_ids uuid[];
  v_ratings int[];
  v_gamess int[];
  v_scores numeric[];
  v_i int;
  v_uid uuid;
  v_rating int;
  v_games int;
  v_score numeric;
  v_opp_rating int;
  v_expected numeric;
  v_k int;
  v_new int;
begin
  if p_result not in ('red', 'black', 'draw') then
    raise exception 'invalid result';
  end if;
  select * into v_match from cu_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  -- Idempotent: an already-finished match returns the zero breakdown.
  if v_match.status = 'finished' then
    return jsonb_build_object(
      'red_play_xp', 0, 'black_play_xp', 0,
      'host_xp', 0, 'host_user_id', null);
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object(
      'red_play_xp', 0, 'black_play_xp', 0,
      'host_xp', 0, 'host_user_id', null);
  end if;
  if v_match.room_id is not null then
    select * into v_room from cu_rooms where id = v_match.room_id;
    if found then v_host_id := v_room.leader_id; end if;
  end if;
  v_winner := case p_result
    when 'red' then v_match.red_id
    when 'black' then v_match.black_id
    else null end;
  v_loser := case p_result
    when 'red' then v_match.black_id
    when 'black' then v_match.red_id
    else null end;

  update cu_matches
    set status = 'finished', result = p_result, reason = p_reason,
        winner_id = v_winner, draw_offer_by = null,
        finished_at = now(), updated_at = now(),
        revealed_layout = coalesce(p_revealed_layout, revealed_layout),
        revealed_seed = coalesce(p_revealed_seed, revealed_seed)
    where id = p_match_id;
  if v_match.room_id is not null then
    update cu_rooms set status = 'lobby'
      where id = v_match.room_id and status = 'playing';
  end if;

  -- Plies: comma-joined UCI per spec §0.4 (space-split tolerated for
  -- any pre-spec row).
  v_plies := case
    when coalesce(trim(v_match.moves), '') = '' then 0
    when position(',' in v_match.moves) > 0
      then array_length(string_to_array(v_match.moves, ','), 1)
    else array_length(string_to_array(trim(v_match.moves), ' '), 1)
  end;

  if v_plies >= 10 then
    if p_result = 'draw' then
      v_ok := cu_award_room_xp(v_match.red_id, 'play', p_match_id, 8);
      if v_ok then v_red_play := 8; end if;
      v_ok := cu_award_room_xp(v_match.black_id, 'play', p_match_id, 8);
      if v_ok then v_black_play := 8; end if;
    else
      v_ok := cu_award_room_xp(v_winner, 'play', p_match_id, 15);
      if v_ok then
        if v_winner = v_match.red_id then v_red_play := 15;
        else v_black_play := 15; end if;
      end if;
      v_ok := cu_award_room_xp(v_loser, 'play', p_match_id, 5);
      if v_ok then
        if v_loser = v_match.red_id then v_red_play := 5;
        else v_black_play := 5; end if;
      end if;
    end if;
    v_red_total := v_red_play;
    v_black_total := v_black_play;
    -- Host bonus (room matches only), +5 capped at 10/day.
    if v_host_id is not null then
      select coalesce(sum(xp), 0) into v_host_today
        from cu_room_xp_ledger
        where user_id = v_host_id and kind = 'host' and day = current_date;
      if v_host_today < 10 then
        v_ok := cu_award_room_xp(v_host_id, 'host', p_match_id, 5);
        if v_ok then v_host_xp := 5; end if;
      end if;
    end if;
    -- Daily participation +10 once/day for both players.
    v_ok := cu_award_room_xp(v_match.red_id, 'daily', v_nil, 10);
    if v_ok then v_red_total := v_red_total + 10; end if;
    v_ok := cu_award_room_xp(v_match.black_id, 'daily', v_nil, 10);
    if v_ok then v_black_total := v_black_total + 10; end if;

    -- Pairwise Elo from PRE-match snapshots (family model).
    v_ids := array[v_match.red_id, v_match.black_id];
    select coalesce(array_agg(coalesce(st.rating, 800) order by u.ord), '{}')
      into v_ratings
      from unnest(v_ids) with ordinality as u(pid, ord)
      left join cu_stats st on st.user_id = u.pid;
    select coalesce(array_agg(coalesce(st.games_played, 0) order by u.ord), '{}')
      into v_gamess
      from unnest(v_ids) with ordinality as u(pid, ord)
      left join cu_stats st on st.user_id = u.pid;
    v_scores := case p_result
      when 'red' then array[1.0, 0.0]
      when 'black' then array[0.0, 1.0]
      else array[0.5, 0.5] end;
    for v_i in 1..2 loop
      v_uid := v_ids[v_i];
      v_rating := v_ratings[v_i];
      v_games := v_gamess[v_i];
      v_score := v_scores[v_i];
      v_opp_rating := v_ratings[3 - v_i];
      v_expected := 1.0 / (1.0 + power(10.0, (v_opp_rating - v_rating) / 400.0));
      v_k := case when v_games < 20 then 40 else 24 end;
      v_new := greatest(100,
        v_rating + floor(v_k * (v_score - v_expected) + 0.5)::int);
      insert into cu_stats
        (user_id, xp, games_played, wins, losses, draws, rating, peak_rating)
        values (v_uid, 0, 1,
          case when v_score = 1 then 1 else 0 end,
          case when v_score = 0 then 1 else 0 end,
          case when v_score = 0.5 then 1 else 0 end,
          v_new, greatest(800, v_new))
        on conflict (user_id) do update set
          games_played = cu_stats.games_played + 1,
          wins = cu_stats.wins + excluded.wins,
          losses = cu_stats.losses + excluded.losses,
          draws = cu_stats.draws + excluded.draws,
          rating = v_new,
          peak_rating = greatest(cu_stats.peak_rating, v_new);
      insert into cu_rating_history (user_id, rating, xp)
        values (v_uid, v_new,
          case when v_i = 1 then v_red_total else v_black_total end);
    end loop;
  end if;

  -- Tournament write-back (spec §5.4).
  if v_match.tournament_id is not null then
    select pairings into v_pairings from cu_tournaments
      where id = v_match.tournament_id;
    if v_pairings is not null then
      v_new_pairings := '[]'::jsonb;
      for v_elem in select * from jsonb_array_elements(v_pairings) loop
        if v_elem ->> 'match_id' = p_match_id::text then
          v_elem := v_elem || jsonb_build_object('result', p_result);
        end if;
        v_new_pairings := v_new_pairings || v_elem;
      end loop;
      select count(*) into v_remaining
        from jsonb_array_elements(v_new_pairings) e
        where e ->> 'result' is null;
      update cu_tournaments
        set pairings = v_new_pairings,
            status = case when v_remaining = 0 then 'finished' else status end,
            finished_at = case when v_remaining = 0 then now()
                               else finished_at end
        where id = v_match.tournament_id;
    end if;
  end if;

  return jsonb_build_object(
    'red_play_xp', v_red_play,
    'black_play_xp', v_black_play,
    'host_xp', v_host_xp,
    'host_user_id', v_host_id);
end $$;
revoke all on function public.cu_record_room_result(uuid, text, text, jsonb, text)
  from public;
revoke all on function public.cu_record_room_result(uuid, text, text, jsonb, text)
  from anon;
revoke all on function public.cu_record_room_result(uuid, text, text, jsonb, text)
  from authenticated;
grant execute on function public.cu_record_room_result(uuid, text, text, jsonb, text)
  to service_role;

-- Draw-accept now finalizes with the spec reason spelling 'draw-agreed'
-- (the old body passed 'draw_agreed', which the new reason check and
-- the client both reject). Body otherwise identical to 003.
create or replace function public.cu_respond_draw(p_match_id uuid, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_match cu_matches;
begin
  select * into v_match from cu_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.status <> 'active' then raise exception 'match_not_active'; end if;
  if auth.uid() <> v_match.red_id and auth.uid() <> v_match.black_id then
    raise exception 'not_allowed';
  end if;
  if v_match.draw_offer_by is null or v_match.draw_offer_by = auth.uid() then
    raise exception 'no_draw_offer';
  end if;
  if p_accept then
    return public.cu_record_room_result(p_match_id, 'draw', 'draw-agreed');
  end if;
  update cu_matches set draw_offer_by = null, updated_at = now()
    where id = p_match_id;
  return jsonb_build_object(
    'red_play_xp', 0, 'black_play_xp', 0,
    'host_xp', 0, 'host_user_id', null);
end $$;
revoke all on function public.cu_respond_draw(uuid, boolean) from public;
revoke all on function public.cu_respond_draw(uuid, boolean) from anon;
grant execute on function public.cu_respond_draw(uuid, boolean) to authenticated;

-- ============ F. cu_cancel_match (spec name) ============
create or replace function public.cu_cancel_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match cu_matches;
begin
  select * into v_match from cu_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.room_id is not null
     and not is_cu_room_leader(v_match.room_id) then
    raise exception 'not_leader';
  end if;
  if v_match.room_id is null
     and auth.uid() <> v_match.red_id
     and auth.uid() <> v_match.black_id then
    raise exception 'not_leader';
  end if;
  update cu_matches
    set status = 'cancelled', reason = 'cancelled',
        finished_at = now(), updated_at = now()
    where id = p_match_id and status = 'active';
  if v_match.room_id is not null then
    update cu_rooms set status = 'lobby'
      where id = v_match.room_id and status = 'playing';
  end if;
end $$;
revoke all on function public.cu_cancel_match(uuid) from public;
revoke all on function public.cu_cancel_match(uuid) from anon;
grant execute on function public.cu_cancel_match(uuid) to authenticated;

-- Kept name delegates (003 body superseded; room reset is 'lobby' now).
create or replace function public.cu_cancel_room_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.cu_cancel_match(p_match_id);
end $$;
revoke all on function public.cu_cancel_room_match(uuid) from public;
revoke all on function public.cu_cancel_room_match(uuid) from anon;
grant execute on function public.cu_cancel_room_match(uuid) to authenticated;

-- ============ G. Discovery RPCs — spec shapes ============
-- cu_preview_room: return TYPE changes (table -> jsonb), so drop first.
drop function if exists public.cu_preview_room(text);
create or replace function public.cu_preview_room(p_code text)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_room cu_rooms;
  v_count bigint;
begin
  select * into v_room from cu_rooms
    where code = upper(trim(p_code)) and status <> 'closed';
  if not found then return null; end if;
  select count(*) into v_count from cu_room_members
    where room_id = v_room.id;
  return jsonb_build_object(
    'name', v_room.name,
    'member_count', v_count,
    'rules', coalesce(v_room.rules, ''),
    'is_public', v_room.is_public,
    'status', v_room.status);
end $$;
revoke all on function public.cu_preview_room(text) from public;
revoke all on function public.cu_preview_room(text) from anon;
grant execute on function public.cu_preview_room(text) to anon, authenticated;

drop function if exists public.cu_list_public_rooms();
create or replace function public.cu_list_public_rooms()
returns table (id uuid, code text, name text, member_count int,
               max_players int, has_active_match boolean)
language sql security definer stable set search_path = public as $$
  select r.id, r.code, r.name,
         (select count(*)::int from cu_room_members m
           where m.room_id = r.id),
         r.max_players,
         exists (select 1 from cu_matches mt
           where mt.room_id = r.id and mt.status = 'active')
  from cu_rooms r
  where r.is_public and r.status <> 'closed'
  order by r.created_at desc
  limit 50;
$$;
revoke all on function public.cu_list_public_rooms() from public;
revoke all on function public.cu_list_public_rooms() from anon;
grant execute on function public.cu_list_public_rooms() to anon, authenticated;

drop function if exists public.cu_room_leaderboard();
create or replace function public.cu_room_leaderboard()
returns table (room_id uuid, name text, code text,
               matches_7d int, member_count int)
language sql security definer stable set search_path = public as $$
  select r.id, r.name, r.code,
         (select count(*)::int from cu_matches mt
           where mt.room_id = r.id and mt.status = 'finished'
             and mt.finished_at > now() - interval '7 days'),
         (select count(*)::int from cu_room_members m
           where m.room_id = r.id)
  from cu_rooms r
  where r.status <> 'closed'
  order by 4 desc, 5 desc, r.created_at desc
  limit 50;
$$;
revoke all on function public.cu_room_leaderboard() from public;
revoke all on function public.cu_room_leaderboard() from anon;
grant execute on function public.cu_room_leaderboard() to anon, authenticated;

-- Guest detail: spec keys (active_match = the FULL masked cu_matches
-- row; comments carry 'author'). Public rooms only.
create or replace function public.cu_guest_room_detail(p_room_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_room cu_rooms;
  v_result jsonb;
begin
  select * into v_room from cu_rooms where id = p_room_id;
  if not found or not v_room.is_public or v_room.status = 'closed' then
    raise exception 'room_not_found';
  end if;
  select jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'name', v_room.name,
      'rules', coalesce(v_room.rules, ''),
      'member_count', (select count(*) from cu_room_members m
                        where m.room_id = p_room_id),
      'max_players', v_room.max_players,
      'leader_id', v_room.leader_id,
      'is_public', v_room.is_public,
      'status', v_room.status,
      'created_at', v_room.created_at),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'name', coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                         split_part(u.email, '@', 1), 'Player'),
        'role', m.role) order by m.joined_at)
      from cu_room_members m
      join profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
      where m.room_id = p_room_id), '[]'::jsonb),
    'active_match', (
      select to_jsonb(mt) from cu_matches mt
      where mt.room_id = p_room_id and mt.status = 'active'
      order by mt.created_at desc limit 1),
    'comments', coalesce((
      select jsonb_agg(c order by c_created_at desc)
      from (
        select jsonb_build_object(
          'id', cm.id, 'body', cm.body,
          'created_at', cm.created_at,
          'author', coalesce(nullif(p.full_name, ''),
                             nullif(p.username, ''),
                             split_part(u.email, '@', 1), 'Player')) as c,
          cm.created_at as c_created_at
        from cu_room_comments cm join profiles p on p.id = cm.user_id
        left join auth.users u on u.id = p.id
        where cm.room_id = p_room_id
        order by cm.created_at desc limit 20) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.cu_guest_room_detail(uuid) from public;
revoke all on function public.cu_guest_room_detail(uuid) from anon;
grant execute on function public.cu_guest_room_detail(uuid) to anon, authenticated;

-- ============ H. Tournament pairings carry match_id (spec §1.8) ============
create or replace function public.cu_create_tournament(p_room_id uuid, p_name text)
returns cu_tournaments
language plpgsql security definer set search_path = public as $$
declare
  v_players uuid[];
  v_pairings jsonb := '[]'::jsonb;
  v_t cu_tournaments;
  v_i int; v_j int; v_n int;
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if exists (select 1 from cu_tournaments
             where room_id = p_room_id and status = 'open') then
    raise exception 'tournament_in_progress';
  end if;
  if exists (select 1 from cu_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  select array_agg(m.user_id) into v_players
    from cu_room_members m where m.room_id = p_room_id and m.role = 'player';
  v_n := coalesce(array_length(v_players, 1), 0);
  if v_n < 3 then raise exception 'not_enough_players'; end if;
  for v_i in 1..v_n loop
    for v_j in v_i + 1..v_n loop
      v_pairings := v_pairings || jsonb_build_object(
        'red', case when (v_i + v_j) % 2 = 0
                      then v_players[v_i] else v_players[v_j] end,
        'black', case when (v_i + v_j) % 2 = 0
                      then v_players[v_j] else v_players[v_i] end,
        'result', null,
        'match_id', null);
    end loop;
  end loop;
  insert into cu_tournaments (room_id, name, pairings)
    values (p_room_id, left(nullif(trim(p_name), ''), 60), v_pairings)
    returning * into v_t;
  return v_t;
end $$;
revoke all on function public.cu_create_tournament(uuid, text) from public;
revoke all on function public.cu_create_tournament(uuid, text) from anon;
grant execute on function public.cu_create_tournament(uuid, text) to authenticated;

-- ============ I. Quests: client ids + status RPC ============
create or replace function public.cu_claim_quest(p_quest_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_done_ok boolean := false;
  v_canonical text;
begin
  -- Normalize the client ids onto the stored ids; legacy spellings and
  -- 'win_1' keep working.
  v_canonical := case p_quest_id
    when 'first_game' then 'play_1'
    when 'play_1' then 'play_1'
    when 'win_1' then 'win_1'
    when 'first_puzzle' then 'first_puzzle'
    when 'first_room' then 'join_room'
    when 'join_room' then 'join_room'
    else null end;
  if v_canonical is null then return false; end if;
  if v_canonical = 'play_1' then
    select exists (select 1 from cu_games
      where user_id = auth.uid() and player_color <> 'cvc') into v_done_ok;
  elsif v_canonical = 'win_1' then
    select exists (select 1 from cu_games
      where user_id = auth.uid() and result = 'win'
        and player_color in ('red', 'black')) into v_done_ok;
  elsif v_canonical = 'first_puzzle' then
    select exists (select 1 from cu_puzzle_solves
      where user_id = auth.uid() and solved) into v_done_ok;
  elsif v_canonical = 'join_room' then
    select exists (select 1 from cu_room_members
      where user_id = auth.uid()) into v_done_ok;
  end if;
  if not v_done_ok then return false; end if;
  insert into cu_quests (user_id, quest_id) values (auth.uid(), v_canonical)
    on conflict do nothing;
  if found then
    insert into cu_stats (user_id, xp) values (auth.uid(), 20)
      on conflict (user_id) do update set xp = cu_stats.xp + 20;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cu_claim_quest(text) from public;
revoke all on function public.cu_claim_quest(text) from anon;
grant execute on function public.cu_claim_quest(text) to authenticated;

create or replace function public.cu_quest_status()
returns jsonb language plpgsql security definer stable
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_game_done boolean;
  v_puzzle_done boolean;
  v_room_done boolean;
  v_game_claimed boolean;
  v_puzzle_claimed boolean;
  v_room_claimed boolean;
begin
  if v_uid is null then
    return jsonb_build_object(
      'first_game', jsonb_build_object('done', false, 'claimed', false),
      'first_puzzle', jsonb_build_object('done', false, 'claimed', false),
      'first_room', jsonb_build_object('done', false, 'claimed', false));
  end if;
  select exists (select 1 from cu_quests
    where user_id = v_uid and quest_id in ('play_1', 'first_game'))
    into v_game_claimed;
  select exists (select 1 from cu_quests
    where user_id = v_uid and quest_id = 'first_puzzle')
    into v_puzzle_claimed;
  select exists (select 1 from cu_quests
    where user_id = v_uid and quest_id in ('join_room', 'first_room'))
    into v_room_claimed;
  select exists (select 1 from cu_games
    where user_id = v_uid and player_color <> 'cvc') into v_game_done;
  select exists (select 1 from cu_puzzle_solves
    where user_id = v_uid and solved) into v_puzzle_done;
  select exists (select 1 from cu_room_members
    where user_id = v_uid) into v_room_done;
  return jsonb_build_object(
    'first_game', jsonb_build_object(
      'done', v_game_done or v_game_claimed, 'claimed', v_game_claimed),
    'first_puzzle', jsonb_build_object(
      'done', v_puzzle_done or v_puzzle_claimed,
      'claimed', v_puzzle_claimed),
    'first_room', jsonb_build_object(
      'done', v_room_done or v_room_claimed, 'claimed', v_room_claimed));
end $$;
revoke all on function public.cu_quest_status() from public;
revoke all on function public.cu_quest_status() from anon;
grant execute on function public.cu_quest_status() to authenticated;

-- ============ J. Community cards: 'featured' sort ============
create or replace function public.cu_community_puzzle_cards(
  p_sort text default 'new', p_limit int default 10, p_offset int default 0,
  p_mine boolean default false
)
returns table (
  id uuid, title text, fen text, fully_revealed boolean, moves_to_mate smallint, solution text,
  solves int, likes int, is_featured boolean, creator_id uuid,
  creator_name text, liked_by_me boolean, solved_by_me boolean,
  created_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  return query
  select cp.id, cp.title, cp.fen, cp.fully_revealed, cp.moves_to_mate, cp.solution,
         cp.solves, cp.likes, cp.is_featured, cp.creator_id,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                  split_part(u.email, '@', 1), 'Player'),
         exists (select 1 from cu_community_puzzle_likes l
                 where l.puzzle_id = cp.id and l.user_id = v_uid),
         exists (select 1 from cu_community_puzzle_solves s
                 where s.puzzle_id = cp.id and s.user_id = v_uid),
         cp.created_at
  from cu_puzzles cp
  join profiles p on p.id = cp.creator_id
  left join auth.users u on u.id = cp.creator_id
  where (not p_mine or cp.creator_id = v_uid)
    and (p_sort <> 'weekly' or cp.created_at > now() - interval '7 days')
    and (p_sort <> 'featured' or cp.is_featured)
  order by
    case when p_sort = 'new' or p_sort = 'mine' then cp.created_at end desc,
    case when p_sort in ('popular', 'weekly', 'featured')
      then cp.likes + cp.solves end desc,
    cp.created_at desc
  limit greatest(coalesce(p_limit, 10), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.cu_community_puzzle_cards(text, int, int, boolean)
  from public;
revoke all on function public.cu_community_puzzle_cards(text, int, int, boolean)
  from anon;
grant execute on function public.cu_community_puzzle_cards(text, int, int, boolean)
  to anon, authenticated;

-- ============ K. Correspondence is cu_matches mode='corr' (spec §0.3) ====
do $$ begin
  alter publication supabase_realtime drop table public.cu_corr_games;
exception when undefined_object then null;
end $$;
drop table if exists public.cu_corr_secrets;
drop table if exists public.cu_corr_games;

drop function if exists public.cu_corr_my_turn();
create or replace function public.cu_corr_my_turn()
returns table (game_id uuid, opponent_id uuid,
               move_deadline timestamptz, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select g.id,
         case when g.red_id = auth.uid() then g.black_id else g.red_id end,
         g.move_deadline, g.updated_at
  from cu_matches g
  where g.mode = 'corr' and g.status = 'active'
    and (g.red_id = auth.uid() or g.black_id = auth.uid())
    and (
      (case when coalesce(trim(g.moves), '') = '' then 0
            else array_length(string_to_array(g.moves, ','), 1) end % 2 = 0
       and g.red_id = auth.uid())
      or
      (case when coalesce(trim(g.moves), '') = '' then 0
            else array_length(string_to_array(g.moves, ','), 1) end % 2 = 1
       and g.black_id = auth.uid())
    )
  order by g.move_deadline asc nulls last, g.updated_at desc;
$$;
revoke all on function public.cu_corr_my_turn() from public;
revoke all on function public.cu_corr_my_turn() from anon;
grant execute on function public.cu_corr_my_turn() to authenticated;

-- ============ L. Games sharing (Agent E gap) ============
alter table cu_games
  add column if not exists is_shared boolean not null default false;

create or replace function public.cu_fetch_shared_game(p_id uuid)
returns jsonb language sql security definer stable
set search_path = public as $$
  select to_jsonb(g) from cu_games g
  where g.id = p_id and g.is_shared;
$$;
revoke all on function public.cu_fetch_shared_game(uuid) from public;
revoke all on function public.cu_fetch_shared_game(uuid) from anon;
grant execute on function public.cu_fetch_shared_game(uuid)
  to anon, authenticated;

create or replace function public.cu_set_game_shared(
  p_id uuid, p_shared boolean
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update cu_games set is_shared = coalesce(p_shared, false)
    where id = p_id and user_id = auth.uid();
  return found;
end $$;
revoke all on function public.cu_set_game_shared(uuid, boolean) from public;
revoke all on function public.cu_set_game_shared(uuid, boolean) from anon;
grant execute on function public.cu_set_game_shared(uuid, boolean)
  to authenticated;
