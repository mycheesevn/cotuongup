-- 003_cu_room_play.sql — Cờ Úp room play: XP ledger, membership RPCs,
-- match RPCs (start / record result / cancel / rematch), tournaments,
-- and guest discovery RPCs.
-- Run in the Dashboard SQL editor AFTER 002. Idempotent.
--
-- Match result vocabulary: 'red' | 'black' | 'draw' (winning SEAT).
-- RED moves first; in cu_start_next_match the head of the rotation
-- takes Red (the room leader is rotation head for the first match, so
-- the host plays Red by ruling).
--
-- SERVER-AUTHORITATIVE MOVES: there is deliberately NO client move RPC
-- and NO client UPDATE policy on cu_matches. A move is POSTed to
-- app/api/rooms/move, which validates it with the engine against the
-- secret true state (cu_match_secrets) using the service role, then
-- writes the new masked public_fen + move. This file's finish path
-- (cu_record_room_result) is also the RPC that route calls when the
-- engine reports the game is over; players/leader may call it directly
-- for resign / agreed-draw endings exactly like the sibling games.

create table if not exists cu_tournaments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cu_rooms(id) on delete cascade,
  name text not null,
  status text not null default 'open' check (status in ('open', 'finished')),
  pairings jsonb not null default '[]',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table cu_tournaments enable row level security;
drop policy if exists "cu_tournaments member read" on cu_tournaments;
create policy "cu_tournaments member read" on cu_tournaments
  for select using (is_cu_room_member(room_id));
drop policy if exists "cu_tournaments public read" on cu_tournaments;
create policy "cu_tournaments public read" on cu_tournaments
  for select to anon, authenticated using (
    exists (select 1 from cu_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
do $$ begin
  alter publication supabase_realtime add table public.cu_tournaments;
exception when duplicate_object then null;
end $$;

-- ---------- 1. Room XP ledger (anti-double-award guard) ----------
create table if not exists cu_room_xp_ledger (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('play','host','comment','daily')),
  ref_id uuid not null,
  day date not null default current_date,
  xp int not null,
  primary key (user_id, kind, ref_id, day)
);
alter table cu_room_xp_ledger enable row level security;
drop policy if exists "cu_room_xp self read" on cu_room_xp_ledger;
create policy "cu_room_xp self read" on cu_room_xp_ledger
  for select to authenticated using (auth.uid() = user_id);

-- Internal award helper: NEVER granted to any client role.
create or replace function public.cu_award_room_xp(
  p_user_id uuid, p_kind text, p_ref_id uuid, p_xp int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_inserted boolean := false;
begin
  insert into cu_room_xp_ledger (user_id, kind, ref_id, day, xp)
  values (p_user_id, p_kind, p_ref_id, current_date, p_xp)
  on conflict do nothing
  returning true into v_inserted;
  if coalesce(v_inserted, false) then
    insert into cu_stats (user_id, xp)
    values (p_user_id, p_xp)
    on conflict (user_id) do update set xp = cu_stats.xp + excluded.xp;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cu_award_room_xp(uuid, text, uuid, int) from public;
revoke all on function public.cu_award_room_xp(uuid, text, uuid, int) from anon;
revoke all on function public.cu_award_room_xp(uuid, text, uuid, int) from authenticated;

-- ---------- 2. Membership RPCs ----------
create or replace function public.cu_join_room(p_code text)
returns cu_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room cu_rooms;
  v_count int;
begin
  select * into v_room from cu_rooms where code = upper(trim(p_code));
  if not found then raise exception 'room_not_found'; end if;
  if exists (select 1 from cu_room_members
             where room_id = v_room.id and user_id = auth.uid()) then
    return v_room;
  end if;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;
  select count(*) into v_count from cu_room_members where room_id = v_room.id;
  if v_count >= v_room.max_players then raise exception 'room_full'; end if;
  insert into cu_room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'player');
  if not (auth.uid() = any (v_room.turn_order)) then
    update cu_rooms
      set turn_order = turn_order || auth.uid()
      where id = v_room.id
      returning * into v_room;
  end if;
  return v_room;
end $$;
revoke all on function public.cu_join_room(text) from public;
revoke all on function public.cu_join_room(text) from anon;
grant execute on function public.cu_join_room(text) to authenticated;

create or replace function public.cu_leave_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if is_cu_room_leader(p_room_id) then
    raise exception 'leader_cannot_leave';
  end if;
  delete from cu_room_members
    where room_id = p_room_id and user_id = auth.uid();
  update cu_rooms
    set turn_order = array_remove(turn_order, auth.uid())
    where id = p_room_id;
end $$;
revoke all on function public.cu_leave_room(uuid) from public;
revoke all on function public.cu_leave_room(uuid) from anon;
grant execute on function public.cu_leave_room(uuid) to authenticated;

create or replace function public.cu_kick_member(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_kick_self'; end if;
  delete from cu_room_members
    where room_id = p_room_id and user_id = p_user_id;
  update cu_rooms
    set turn_order = array_remove(turn_order, p_user_id)
    where id = p_room_id;
end $$;
revoke all on function public.cu_kick_member(uuid, uuid) from public;
revoke all on function public.cu_kick_member(uuid, uuid) from anon;
grant execute on function public.cu_kick_member(uuid, uuid) to authenticated;

create or replace function public.cu_set_member_role(
  p_room_id uuid, p_user_id uuid, p_role text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_room cu_rooms;
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  if p_role not in ('player','spectator') then raise exception 'invalid_role'; end if;
  select * into v_room from cu_rooms where id = p_room_id;
  if p_user_id = v_room.leader_id and p_role = 'spectator' then
    raise exception 'leader_must_play';
  end if;
  update cu_room_members set role = p_role
    where room_id = p_room_id and user_id = p_user_id;
  if p_role = 'spectator' then
    update cu_rooms
      set turn_order = array_remove(turn_order, p_user_id)
      where id = p_room_id;
  elsif not (p_user_id = any (v_room.turn_order)) then
    update cu_rooms
      set turn_order = turn_order || p_user_id
      where id = p_room_id;
  end if;
end $$;
revoke all on function public.cu_set_member_role(uuid, uuid, text) from public;
revoke all on function public.cu_set_member_role(uuid, uuid, text) from anon;
grant execute on function public.cu_set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.cu_set_turn_order(p_room_id uuid, p_order uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_clean uuid[];
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select coalesce(array_agg(m.user_id order by array_position(p_order, m.user_id)), '{}')
    into v_clean
    from cu_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and m.user_id = any (p_order);
  select v_clean || coalesce(array_agg(m.user_id order by m.joined_at), '{}')
    into v_clean
    from cu_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and not (m.user_id = any (v_clean));
  update cu_rooms set turn_order = v_clean where id = p_room_id;
end $$;
revoke all on function public.cu_set_turn_order(uuid, uuid[]) from public;
revoke all on function public.cu_set_turn_order(uuid, uuid[]) from anon;
grant execute on function public.cu_set_turn_order(uuid, uuid[]) to authenticated;

create or replace function public.cu_close_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cu_rooms set status = 'closed' where id = p_room_id;
end $$;
revoke all on function public.cu_close_room(uuid) from public;
revoke all on function public.cu_close_room(uuid) from anon;
grant execute on function public.cu_close_room(uuid) to authenticated;

create or replace function public.cu_update_room_rules(p_room_id uuid, p_rules text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cu_rooms
    set rules = nullif(left(trim(coalesce(p_rules, '')), 500), '')
    where id = p_room_id;
end $$;
revoke all on function public.cu_update_room_rules(uuid, text) from public;
revoke all on function public.cu_update_room_rules(uuid, text) from anon;
grant execute on function public.cu_update_room_rules(uuid, text) to authenticated;

create or replace function public.cu_set_room_public(p_room_id uuid, p_public boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  update cu_rooms set is_public = p_public where id = p_room_id;
end $$;
revoke all on function public.cu_set_room_public(uuid, boolean) from public;
revoke all on function public.cu_set_room_public(uuid, boolean) from anon;
grant execute on function public.cu_set_room_public(uuid, boolean) to authenticated;

-- ---------- 3. Match RPCs ----------
-- Creates the PUBLIC match row only. The server route
-- (app/api/rooms/start) then deals the game: it inserts the
-- cu_match_secrets row and stamps `commitment` on the match via the
-- service role BEFORE any move is accepted. A match whose commitment
-- is still NULL has not been dealt yet.
create or replace function public.cu_start_next_match(p_room_id uuid)
returns cu_matches
language plpgsql security definer set search_path = public as $$
declare
  v_room cu_rooms;
  v_order uuid[];
  v_match cu_matches;
begin
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select * into v_room from cu_rooms where id = p_room_id;
  if v_room.status = 'closed' then raise exception 'room_closed'; end if;
  if exists (select 1 from cu_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  select coalesce(array_agg(m.user_id order by array_position(v_room.turn_order, m.user_id)), '{}')
    into v_order
    from cu_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and m.user_id = any (v_room.turn_order);
  select v_order || coalesce(array_agg(m.user_id order by m.joined_at), '{}')
    into v_order
    from cu_room_members m
    where m.room_id = p_room_id and m.role = 'player'
      and not (m.user_id = any (v_order));
  if coalesce(array_length(v_order, 1), 0) < 2 then
    raise exception 'room_need_two_players';
  end if;
  -- Red moves first: the head of the rotation takes Red.
  insert into cu_matches (room_id, red_id, black_id)
  values (p_room_id, v_order[1], v_order[2])
  returning * into v_match;
  update cu_rooms
    set turn_order = v_order[2:] || v_order[1], status = 'playing'
    where id = p_room_id;
  return v_match;
end $$;
revoke all on function public.cu_start_next_match(uuid) from public;
revoke all on function public.cu_start_next_match(uuid) from anon;
grant execute on function public.cu_start_next_match(uuid) to authenticated;

-- Record a room match result: XP + pairwise Elo (the room counterpart
-- of cu_record_game_result). Idempotent: re-finishing a finished match
-- returns zero XP and changes nothing.
--   XP (only when the match lasted >= 10 plies, anti-farm):
--     winner 15 / draw 8 each / loser 5; host +5 (cap 10/day);
--     daily participation +10 once/day for both players.
--   Elo: pairwise from PRE-match snapshots, K = 40 (<20 games) else
--     24, floor 100, peak tracked — same model as solo play.
create or replace function public.cu_record_room_result(
  p_match_id uuid, p_result text, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match cu_matches;
  v_room cu_rooms;
  v_winner uuid;
  v_loser uuid;
  v_plies int;
  v_play int := 0;
  v_host int := 0;
  v_daily int := 0;
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
  v_host_today int;
  v_pairings jsonb;
  v_new_pairings jsonb;
  v_elem jsonb;
  v_remaining int;
  v_ok boolean;
  v_ids uuid[];
  v_ratings int[];
  v_gamess int[];
  v_scores numeric[];
  v_uid uuid;
  v_rating int;
  v_games int;
  v_score numeric;
  v_opp_rating int;
  v_expected numeric;
  v_k int;
  v_new int;
  v_elo_xp int;
  v_xp_red int := 0;
  v_xp_black int := 0;
  v_i int;
begin
  if p_result not in ('red', 'black', 'draw') then
    raise exception 'invalid result';
  end if;
  select * into v_match from cu_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  select * into v_room from cu_rooms where id = v_match.room_id;
  if auth.uid() <> v_match.red_id and auth.uid() <> v_match.black_id
     and auth.uid() <> v_room.leader_id then
    raise exception 'not_allowed';
  end if;
  if v_match.status <> 'active' then
    return jsonb_build_object('play_xp', 0, 'host_xp', 0, 'daily_xp', 0);
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
        winner_id = v_winner, finished_at = now()
    where id = p_match_id;
  update cu_rooms set status = 'open'
    where id = v_match.room_id and status = 'playing';

  v_plies := case when trim(v_match.moves) = '' then 0
    else array_length(string_to_array(trim(v_match.moves), ' '), 1) end;

  if v_plies >= 10 then
    if p_result = 'draw' then
      v_ok := cu_award_room_xp(v_match.red_id, 'play', p_match_id, 8);
      if v_ok then v_xp_red := v_xp_red + 8; end if;
      v_ok := cu_award_room_xp(v_match.black_id, 'play', p_match_id, 8);
      if v_ok then v_xp_black := v_xp_black + 8; end if;
    else
      v_ok := cu_award_room_xp(v_winner, 'play', p_match_id, 15);
      if v_ok then
        if v_winner = v_match.red_id then v_xp_red := v_xp_red + 15;
        else v_xp_black := v_xp_black + 15; end if;
      end if;
      v_ok := cu_award_room_xp(v_loser, 'play', p_match_id, 5);
      if v_ok then
        if v_loser = v_match.red_id then v_xp_red := v_xp_red + 5;
        else v_xp_black := v_xp_black + 5; end if;
      end if;
    end if;
    select coalesce(sum(xp), 0) into v_host_today from cu_room_xp_ledger
      where user_id = v_room.leader_id and kind = 'host' and day = current_date;
    if v_host_today < 10 then
      v_ok := cu_award_room_xp(v_room.leader_id, 'host', p_match_id, 5);
      if v_ok and auth.uid() = v_room.leader_id then v_host := 5; end if;
    end if;
    v_ok := cu_award_room_xp(v_match.red_id, 'daily', v_nil, 10);
    if v_ok then v_xp_red := v_xp_red + 10; end if;
    if v_ok and auth.uid() = v_match.red_id then v_daily := 10; end if;
    v_ok := cu_award_room_xp(v_match.black_id, 'daily', v_nil, 10);
    if v_ok then v_xp_black := v_xp_black + 10; end if;
    if v_ok and auth.uid() = v_match.black_id then v_daily := 10; end if;

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
      v_new := greatest(100, v_rating + floor(v_k * (v_score - v_expected) + 0.5)::int);
      v_elo_xp := case when v_i = 1 then v_xp_red else v_xp_black end;
      insert into cu_stats (user_id, xp, games_played, wins, losses, draws, rating, peak_rating)
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
        values (v_uid, v_new, v_elo_xp);
    end loop;

    v_play := 0;
    select coalesce(sum(xp), 0) into v_play from cu_room_xp_ledger
      where user_id = auth.uid() and kind = 'play' and ref_id = p_match_id;
  end if;

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
      select count(*) into v_remaining from jsonb_array_elements(v_new_pairings) e
        where e ->> 'result' is null;
      update cu_tournaments
        set pairings = v_new_pairings,
            status = case when v_remaining = 0 then 'finished' else status end,
            finished_at = case when v_remaining = 0 then now() else finished_at end
        where id = v_match.tournament_id;
    end if;
  end if;

  return jsonb_build_object('play_xp', v_play, 'host_xp', v_host, 'daily_xp', v_daily);
end $$;
revoke all on function public.cu_record_room_result(uuid, text, text) from public;
revoke all on function public.cu_record_room_result(uuid, text, text) from anon;
grant execute on function public.cu_record_room_result(uuid, text, text) to authenticated;

-- Sibling-name alias (the family calls this finish_room_match): a thin
-- wrapper so client code ported from PacClone keeps working.
create or replace function public.cu_finish_room_match(
  p_match_id uuid, p_result text, p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public.cu_record_room_result(p_match_id, p_result, p_reason);
end $$;
revoke all on function public.cu_finish_room_match(uuid, text, text) from public;
revoke all on function public.cu_finish_room_match(uuid, text, text) from anon;
grant execute on function public.cu_finish_room_match(uuid, text, text) to authenticated;

create or replace function public.cu_cancel_room_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match cu_matches;
begin
  select * into v_match from cu_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if not is_cu_room_leader(v_match.room_id) then
    raise exception 'not_leader';
  end if;
  update cu_matches
    set status = 'cancelled', reason = 'cancelled', finished_at = now()
    where id = p_match_id and status = 'active';
  update cu_rooms set status = 'open'
    where id = v_match.room_id and status = 'playing';
end $$;
revoke all on function public.cu_cancel_room_match(uuid) from public;
revoke all on function public.cu_cancel_room_match(uuid) from anon;
grant execute on function public.cu_cancel_room_match(uuid) to authenticated;

create or replace function public.cu_rematch(p_room_id uuid)
returns cu_matches
language plpgsql security definer set search_path = public as $$
declare
  v_prev cu_matches;
  v_match cu_matches;
begin
  select * into v_prev from cu_matches
    where room_id = p_room_id and status = 'finished'
    order by finished_at desc nulls last, created_at desc
    limit 1;
  if not found then raise exception 'match_not_found'; end if;
  if auth.uid() <> v_prev.red_id and auth.uid() <> v_prev.black_id then
    raise exception 'not_allowed';
  end if;
  if exists (select 1 from cu_matches
             where room_id = p_room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  -- Same two players, swapped colors. The new match is undealt until
  -- the server start route deals it (fresh secret + commitment).
  insert into cu_matches (room_id, red_id, black_id, mode)
  values (p_room_id, v_prev.black_id, v_prev.red_id, v_prev.mode)
  returning * into v_match;
  update cu_rooms set status = 'playing' where id = p_room_id;
  return v_match;
end $$;
revoke all on function public.cu_rematch(uuid) from public;
revoke all on function public.cu_rematch(uuid) from anon;
grant execute on function public.cu_rematch(uuid) to authenticated;

-- Draw offers: recorded on the match row (draw_offer_by). Offering is
-- free; accepting finishes the match as a draw via the record RPC.
create or replace function public.cu_offer_draw(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_match cu_matches;
begin
  select * into v_match from cu_matches where id = p_match_id;
  if not found then raise exception 'match_not_found'; end if;
  if v_match.status <> 'active' then raise exception 'match_not_active'; end if;
  if auth.uid() <> v_match.red_id and auth.uid() <> v_match.black_id then
    raise exception 'not_allowed';
  end if;
  if v_match.draw_offer_by is not null and v_match.draw_offer_by <> auth.uid() then
    raise exception 'draw_already_offered_by_opponent';
  end if;
  update cu_matches set draw_offer_by = auth.uid() where id = p_match_id;
end $$;
revoke all on function public.cu_offer_draw(uuid) from public;
revoke all on function public.cu_offer_draw(uuid) from anon;
grant execute on function public.cu_offer_draw(uuid) to authenticated;

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
    return public.cu_record_room_result(p_match_id, 'draw', 'draw_agreed');
  end if;
  update cu_matches set draw_offer_by = null where id = p_match_id;
  return jsonb_build_object('play_xp', 0, 'host_xp', 0, 'daily_xp', 0);
end $$;
revoke all on function public.cu_respond_draw(uuid, boolean) from public;
revoke all on function public.cu_respond_draw(uuid, boolean) from anon;
grant execute on function public.cu_respond_draw(uuid, boolean) to authenticated;

-- ---------- 4. Tournament RPCs ----------
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
  if exists (select 1 from cu_tournaments where room_id = p_room_id and status = 'open') then
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
        'red', case when (v_i + v_j) % 2 = 0 then v_players[v_i] else v_players[v_j] end,
        'black', case when (v_i + v_j) % 2 = 0 then v_players[v_j] else v_players[v_i] end,
        'result', null);
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

create or replace function public.cu_tournament_next_match(p_tournament_id uuid)
returns cu_matches
language plpgsql security definer set search_path = public as $$
declare
  v_t cu_tournaments;
  v_new_pairings jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_red uuid;
  v_black uuid;
  v_match cu_matches;
  v_stamped boolean := false;
begin
  select * into v_t from cu_tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
  if not is_cu_room_leader(v_t.room_id) then raise exception 'not_leader'; end if;
  if v_t.status <> 'open' then raise exception 'tournament_finished'; end if;
  if exists (select 1 from cu_matches
             where room_id = v_t.room_id and status = 'active') then
    raise exception 'match_in_progress';
  end if;
  for v_elem in select * from jsonb_array_elements(v_t.pairings) loop
    if not v_stamped and v_elem ->> 'result' is null then
      v_red := (v_elem ->> 'red')::uuid;
      v_black := (v_elem ->> 'black')::uuid;
      insert into cu_matches (room_id, red_id, black_id, tournament_id)
      values (v_t.room_id, v_red, v_black, p_tournament_id)
      returning * into v_match;
      v_elem := v_elem || jsonb_build_object('match_id', v_match.id);
      v_stamped := true;
    end if;
    v_new_pairings := v_new_pairings || v_elem;
  end loop;
  if not v_stamped then raise exception 'tournament_finished'; end if;
  update cu_tournaments set pairings = v_new_pairings where id = p_tournament_id;
  update cu_rooms set status = 'playing' where id = v_t.room_id;
  return v_match;
end $$;
revoke all on function public.cu_tournament_next_match(uuid) from public;
revoke all on function public.cu_tournament_next_match(uuid) from anon;
grant execute on function public.cu_tournament_next_match(uuid) to authenticated;

create or replace function public.cu_cancel_tournament(p_tournament_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_t cu_tournaments;
begin
  select * into v_t from cu_tournaments where id = p_tournament_id;
  if not found then raise exception 'tournament_not_found'; end if;
  if not is_cu_room_leader(v_t.room_id) then raise exception 'not_leader'; end if;
  update cu_tournaments
    set status = 'finished', finished_at = now()
    where id = p_tournament_id and status = 'open';
end $$;
revoke all on function public.cu_cancel_tournament(uuid) from public;
revoke all on function public.cu_cancel_tournament(uuid) from anon;
grant execute on function public.cu_cancel_tournament(uuid) to authenticated;

-- ---------- 5. Discovery & guest RPCs (anon-safe) ----------
create or replace function public.cu_preview_room(p_code text)
returns table (id uuid, name text, leader_name text, member_count bigint, is_public boolean, status text)
language sql security definer stable set search_path = public as $$
  select r.id, r.name,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''), 'Player'),
         (select count(*) from cu_room_members m where m.room_id = r.id),
         r.is_public, r.status
  from cu_rooms r
  left join profiles p on p.id = r.leader_id
  where r.code = upper(trim(p_code)) and r.status <> 'closed';
$$;
revoke all on function public.cu_preview_room(text) from public;
revoke all on function public.cu_preview_room(text) from anon;
grant execute on function public.cu_preview_room(text) to anon, authenticated;

create or replace function public.cu_list_public_rooms()
returns table (id uuid, code text, name text, leader_name text, member_count bigint, status text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id, r.code, r.name,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''), 'Player'),
         (select count(*) from cu_room_members m where m.room_id = r.id),
         r.status, r.created_at
  from cu_rooms r
  left join profiles p on p.id = r.leader_id
  where r.is_public and r.status <> 'closed'
  order by r.created_at desc
  limit 50;
$$;
revoke all on function public.cu_list_public_rooms() from public;
revoke all on function public.cu_list_public_rooms() from anon;
grant execute on function public.cu_list_public_rooms() to anon, authenticated;

create or replace function public.cu_room_leaderboard()
returns table (user_id uuid, display_name text, room_wins bigint, room_games bigint)
language sql security definer stable set search_path = public as $$
  select s.user_id,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                  split_part(u.email, '@', 1), 'Player'),
         s.wins::bigint, s.games_played::bigint
  from cu_stats s
  join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  where s.games_played > 0
  order by s.wins desc, s.rating desc
  limit 50;
$$;
revoke all on function public.cu_room_leaderboard() from public;
revoke all on function public.cu_room_leaderboard() from anon;
grant execute on function public.cu_room_leaderboard() to anon, authenticated;

-- Guest room detail: room + members + latest match (MASKED state only —
-- public_fen / moves / commitment; never anything from cu_match_secrets)
-- + recent comments (cu_room_comments is created in 009; this plpgsql
-- body resolves it at call time, after the full chain has run).
create or replace function public.cu_guest_room_detail(p_room_id uuid)
returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  v_result jsonb;
  v_room cu_rooms;
begin
  select * into v_room from cu_rooms where id = p_room_id;
  if not found or not v_room.is_public or v_room.status = 'closed' then
    return null;
  end if;
  select jsonb_build_object(
    'room', jsonb_build_object(
      'id', v_room.id, 'code', v_room.code, 'name', v_room.name,
      'is_public', v_room.is_public, 'status', v_room.status,
      'leader_id', v_room.leader_id, 'created_at', v_room.created_at),
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
    'match', (
      select jsonb_build_object(
        'id', mt.id, 'red_id', mt.red_id, 'black_id', mt.black_id,
        'status', mt.status, 'public_fen', mt.public_fen,
        'moves', mt.moves, 'commitment', mt.commitment,
        'result', mt.result, 'created_at', mt.created_at)
      from cu_matches mt
      where mt.room_id = p_room_id
      order by mt.created_at desc limit 1),
    'comments', coalesce((
      select jsonb_agg(c order by c_created_at desc)
      from (
        select jsonb_build_object(
          'id', cm.id, 'move_number', cm.move_number,
          'name', coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                           split_part(u.email, '@', 1), 'Player'),
          'body', cm.body,
          'created_at', cm.created_at) as c,
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
