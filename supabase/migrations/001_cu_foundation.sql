-- 001_cu_foundation.sql — Cờ Úp (Jieqi / Dark Xiangqi) core: stats/XP/Elo,
-- vs-computer game history, daily check-ins, quests, leaderboard,
-- library progress, and site game events.
--
-- Seat naming: Red and Black everywhere (red_id / black_id seat columns;
-- player_color 'red' | 'black' | 'cvc'). RED moves first; the human
-- plays Red vs the computer by default. Solo results are recorded from
-- the HUMAN's point of view ('win' | 'loss' | 'draw'); room results use
-- 'red' | 'black' | 'draw' (see 003).
--
-- FEN: extended Jieqi FEN (see design doc §4.1). A position has TWO
-- forms: the FULL FEN (carries the hidden identities of covered pieces —
-- local/solo games only, never trusted from room clients) and the PUBLIC
-- FEN (covered pieces shown as X/x, no hidden identities). The public
-- FEN of a fresh deal is a constant:
--   xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1
-- Move lists are SPACE-SEPARATED UCI strings in play order, with the
-- flip suffix appended by the app when a move reveals a piece
-- (e.g. 'b9c7=R').
--
-- Run in the Supabase Dashboard SQL editor. Idempotent.

-- ============ STATS (per-game XP + Elo; extends shared profiles) ============
create table if not exists cu_stats (
  user_id uuid primary key references profiles(id) on delete cascade,
  xp int not null default 0,
  rating int not null default 800,
  peak_rating int not null default 800,
  games_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  welcome_claimed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table cu_stats enable row level security;
drop policy if exists "cu_stats self" on cu_stats;
create policy "cu_stats self" on cu_stats
  for all using (auth.uid() = user_id);
drop policy if exists "cu_stats leaderboard" on cu_stats;
create policy "cu_stats leaderboard" on cu_stats
  for select using (true);

-- AI pseudo-rating by level (family AI_RATINGS scale). Internal helper:
-- only called from SECURITY DEFINER bodies, never by clients.
create or replace function public.cu_ai_rating(p_level int)
returns int
language sql immutable set search_path = public as $$
  select case p_level
    when 1 then 300
    when 2 then 500
    when 3 then 700
    when 4 then 900
    when 5 then 1100
    when 6 then 1300
    when 7 then 1500
    when 8 then 1700
    when 9 then 1900
    when 10 then 2100
    when 11 then 2250
    else 2400
  end;
$$;
revoke all on function public.cu_ai_rating(int) from public;
revoke all on function public.cu_ai_rating(int) from anon;
revoke all on function public.cu_ai_rating(int) from authenticated;

-- Leaderboard: server-computed ranks, display names resolved server-side
-- so the shared profiles table is never exposed to anon.
create or replace function public.cu_leaderboard(p_limit int default 15, p_offset int default 0)
returns table (rank bigint, user_id uuid, rating int, xp int,
               games_played int, wins int, display_name text)
language sql security definer stable set search_path = public as $$
  select row_number() over (order by s.rating desc, s.xp desc, s.user_id),
         s.user_id, s.rating, s.xp, s.games_played, s.wins,
         coalesce(nullif(p.full_name, ''), nullif(p.username, ''),
                  split_part(u.email, '@', 1), 'Player')
  from cu_stats s
  join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  order by s.rating desc, s.xp desc, s.user_id
  limit greatest(coalesce(p_limit, 15), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.cu_leaderboard(int, int) from public;
revoke all on function public.cu_leaderboard(int, int) from anon;
grant execute on function public.cu_leaderboard(int, int) to anon, authenticated;

-- ============ DAILY CHECK-IN ============
create table if not exists cu_checkins (
  user_id uuid not null references profiles(id) on delete cascade,
  checkin_date date not null,
  streak int not null default 1,
  primary key (user_id, checkin_date)
);
alter table cu_checkins enable row level security;
drop policy if exists "cu_checkin self" on cu_checkins;
create policy "cu_checkin self" on cu_checkins
  for all using (auth.uid() = user_id);

create or replace function public.cu_claim_checkin()
returns table(streak int, xp_awarded int, already_claimed boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_yesterday date := v_today - 1;
  v_prev_streak int;
  v_new_streak int;
  v_xp int;
begin
  if exists (select 1 from cu_checkins where user_id = auth.uid() and checkin_date = v_today) then
    select cu_checkins.streak into v_new_streak from cu_checkins
      where user_id = auth.uid() and checkin_date = v_today;
    return query select v_new_streak, 0, true;
    return;
  end if;
  select cu_checkins.streak into v_prev_streak from cu_checkins
    where user_id = auth.uid() and checkin_date = v_yesterday;
  v_new_streak := coalesce(v_prev_streak, 0) + 1;
  v_xp := least(10 + 5 * (v_new_streak - 1), 40);
  insert into cu_checkins (user_id, checkin_date, streak)
    values (auth.uid(), v_today, v_new_streak);
  insert into cu_stats (user_id, xp) values (auth.uid(), v_xp)
    on conflict (user_id) do update set xp = cu_stats.xp + excluded.xp;
  return query select v_new_streak, v_xp, false;
end $$;
revoke all on function public.cu_claim_checkin() from public;
revoke all on function public.cu_claim_checkin() from anon;
grant execute on function public.cu_claim_checkin() to authenticated;

-- ============ QUESTS + WELCOME BONUS ============
create table if not exists cu_quests (
  user_id uuid not null references profiles(id) on delete cascade,
  quest_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);
alter table cu_quests enable row level security;
drop policy if exists "cu_quests self" on cu_quests;
create policy "cu_quests self" on cu_quests
  for all using (auth.uid() = user_id);

create or replace function public.cu_claim_welcome()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_already boolean;
begin
  select welcome_claimed into v_already from cu_stats where user_id = auth.uid();
  if v_already then return false; end if;
  insert into cu_stats (user_id, xp, welcome_claimed)
    values (auth.uid(), 50, true)
    on conflict (user_id) do update set
      xp = cu_stats.xp + 50,
      welcome_claimed = true;
  return true;
end $$;
revoke all on function public.cu_claim_welcome() from public;
revoke all on function public.cu_claim_welcome() from anon;
grant execute on function public.cu_claim_welcome() to authenticated;

-- Claim a quest (+20 XP each, one time per quest).
-- quest_id: 'play_1' | 'win_1' | 'join_room'
create or replace function public.cu_claim_quest(p_quest_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_done_ok boolean := false;
begin
  if p_quest_id = 'play_1' then
    select exists (select 1 from cu_games
      where user_id = auth.uid() and player_color <> 'cvc') into v_done_ok;
  elsif p_quest_id = 'win_1' then
    select exists (select 1 from cu_games
      where user_id = auth.uid() and result = 'win'
        and player_color in ('red', 'black')) into v_done_ok;
  elsif p_quest_id = 'join_room' then
    select exists (select 1 from cu_room_members
      where user_id = auth.uid()) into v_done_ok;
  else
    return false;
  end if;
  if not v_done_ok then return false; end if;
  insert into cu_quests (user_id, quest_id) values (auth.uid(), p_quest_id)
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

-- ============ VS-COMPUTER GAME HISTORY ============
-- player_color: 'red' | 'black' (the human's seat) | 'cvc' (computer vs
-- computer rows, recorded from Red's point of view and EXCLUDED from
-- stats/Elo below).
-- full_fen: the FULL extended FEN (hidden identities included) — solo /
-- local games only; room games never store it here (see cu_matches +
-- cu_match_secrets in 002). public_fen: the masked FEN anyone may see.
create table if not exists cu_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  player_color text not null check (player_color in ('red', 'black', 'cvc')),
  ai_level int not null,
  result text not null check (result in ('win', 'loss', 'draw')),
  plies int not null default 0,
  moves text not null default '',
  full_fen text not null default '',
  public_fen text not null
    default 'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1',
  created_at timestamptz not null default now()
);
alter table cu_games enable row level security;
drop policy if exists "cu_games self" on cu_games;
create policy "cu_games self" on cu_games
  for all using (auth.uid() = user_id);

-- ============ RATING HISTORY (sparkline) ============
create table if not exists cu_rating_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  rating int not null,
  xp int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cu_rating_history_user_idx
  on cu_rating_history (user_id, created_at);
alter table cu_rating_history enable row level security;
drop policy if exists "cu_rating_history self read" on cu_rating_history;
create policy "cu_rating_history self read" on cu_rating_history
  for select using (auth.uid() = user_id);
-- No client INSERT policy: rows are written only by the
-- SECURITY DEFINER record RPCs.

-- ============ RECORD RESULT: XP + ELO, SERVER-SIDE ============
-- The ONLY write path for vs-computer results (guests included: a guest's
-- game row is recorded with user_id NULL, stats/Elo skipped).
--   XP: win 10 + 5*level, draw 5, loss 3.
--   Elo: start 800, AI pseudo-ratings 300..2400, expected score
--     1/(1+10^((opp-me)/400)), K = 40 for the first 20 recorded games
--     else 24, floor 100, peak tracked.
--   Delta rounding uses floor(x + 0.5) to match JS Math.round exactly.
-- CvC rows (p_color = 'cvc') record the game row only — no stats, no Elo.
create or replace function public.cu_record_game_result(
  p_color text,
  p_level int,
  p_result text,
  p_plies int,
  p_moves text default '',
  p_full_fen text default '',
  p_public_fen text default 'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1'
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_gain int;
  v_uid uuid := auth.uid();
  v_rating int;
  v_games int;
  v_score numeric;
  v_expected numeric;
  v_k int;
  v_new int;
  v_xp int;
begin
  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'invalid result';
  end if;
  if p_color not in ('red', 'black', 'cvc') then
    raise exception 'invalid color';
  end if;
  v_gain := case p_result
    when 'win' then 10 + 5 * p_level
    when 'draw' then 5
    else 3 end;

  insert into cu_games (
    user_id, player_color, ai_level, result, plies, moves, full_fen, public_fen
  )
  values (
    v_uid, p_color, p_level, p_result, p_plies,
    coalesce(p_moves, ''),
    coalesce(p_full_fen, ''),
    coalesce(nullif(p_public_fen, ''),
      'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1')
  );

  -- Guests and CvC games: history row only, no stats/Elo.
  if v_uid is null or p_color = 'cvc' then
    return v_gain;
  end if;

  select rating, games_played into v_rating, v_games
    from cu_stats where user_id = v_uid;
  v_rating := coalesce(v_rating, 800);
  v_games := coalesce(v_games, 0);
  v_score := case p_result when 'win' then 1 when 'draw' then 0.5 else 0 end;
  v_expected := 1.0 / (1.0 + power(10.0, (public.cu_ai_rating(p_level) - v_rating) / 400.0));
  v_k := case when v_games < 20 then 40 else 24 end;
  v_new := greatest(100, v_rating + floor(v_k * (v_score - v_expected) + 0.5)::int);

  insert into cu_stats (user_id, xp, games_played, wins, losses, draws, rating, peak_rating)
    values (
      v_uid, v_gain, 1,
      case when p_result = 'win' then 1 else 0 end,
      case when p_result = 'loss' then 1 else 0 end,
      case when p_result = 'draw' then 1 else 0 end,
      v_new,
      greatest(800, v_new)
    )
    on conflict (user_id) do update set
      xp = cu_stats.xp + excluded.xp,
      games_played = cu_stats.games_played + 1,
      wins = cu_stats.wins + excluded.wins,
      losses = cu_stats.losses + excluded.losses,
      draws = cu_stats.draws + excluded.draws,
      rating = v_new,
      peak_rating = greatest(cu_stats.peak_rating, v_new)
  returning cu_stats.xp into v_xp;

  insert into cu_rating_history (user_id, rating, xp)
    values (v_uid, v_new, v_xp);

  return v_gain;
end $$;
revoke all on function public.cu_record_game_result(text,int,text,int,text,text,text) from public;
revoke all on function public.cu_record_game_result(text,int,text,int,text,text,text) from anon;
grant execute on function public.cu_record_game_result(text,int,text,int,text,text,text) to anon, authenticated;

-- ============ GAME EVENTS (site statistics, family standard) ============
create table if not exists cu_game_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  event text not null check (event in ('start','finish','abandon')),
  result text check (result in ('win','loss','draw')),
  level int,
  player_color text,
  time_control int,
  created_at timestamptz not null default now()
);
create index if not exists cu_game_events_created_idx on cu_game_events (created_at desc);
create index if not exists cu_game_events_event_idx on cu_game_events (event);
alter table cu_game_events enable row level security;
drop policy if exists "Anyone can record cu game events" on cu_game_events;
create policy "Anyone can record cu game events" on cu_game_events
  for insert to anon, authenticated with check (true);

create or replace function public.cu_game_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_r jsonb;
begin
  select jsonb_build_object(
    'plays_total',   (select count(*) from cu_game_events where event = 'start'),
    'plays_member',  (select count(*) from cu_game_events where event = 'start' and user_id is not null),
    'plays_guest',   (select count(*) from cu_game_events where event = 'start' and user_id is null),
    'finished',      (select count(*) from cu_game_events where event = 'finish'),
    'abandoned',     (select count(*) from cu_game_events where event = 'abandon'),
    'members_total', (select count(*) from profiles),
    'members_today', (select count(*) from profiles where created_at >= date_trunc('day', now())),
    'members_week',  (select count(*) from profiles where created_at >= date_trunc('week', now())),
    'members_month', (select count(*) from profiles where created_at >= date_trunc('month', now())),
    'plays_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('day', created_at)::date as d, count(*) as c
            from cu_game_events where event = 'start' and created_at >= date_trunc('day', now()) - interval '29 days'
            group by 1) t),
    'plays_weekly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('week', created_at)::date as d, count(*) as c
            from cu_game_events where event = 'start' and created_at >= date_trunc('week', now()) - interval '11 weeks'
            group by 1) t),
    'plays_monthly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('month', created_at)::date as d, count(*) as c
            from cu_game_events where event = 'start' and created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) t),
    'plays_yearly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('year', created_at)::date as d, count(*) as c
            from cu_game_events where event = 'start'
            group by 1) t),
    'members_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('day', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('day', now()) - interval '29 days'
            group by 1) t),
    'members_weekly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('week', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('week', now()) - interval '11 weeks'
            group by 1) t),
    'members_monthly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('month', created_at)::date as d, count(*) as c
            from profiles where created_at >= date_trunc('month', now()) - interval '11 months'
            group by 1) t),
    'members_yearly', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'c', c) order by d), '[]'::jsonb)
      from (select date_trunc('year', created_at)::date as d, count(*) as c
            from profiles
            group by 1) t)
  ) into v_r;
  return v_r;
end;
$function$;
revoke all on function public.cu_game_stats() from public;
revoke all on function public.cu_game_stats() from anon;
grant execute on function public.cu_game_stats() to authenticated;

create or replace function public.record_cu_game_event(
  p_event text,
  p_result text default null,
  p_level int default null,
  p_player_color text default null,
  p_time_control int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_event not in ('start', 'finish', 'abandon') then
    raise exception 'invalid event';
  end if;
  insert into cu_game_events (user_id, event, result, level, player_color, time_control)
  values (auth.uid(), p_event, p_result, p_level, p_player_color, p_time_control);
end;
$function$;
revoke all on function public.record_cu_game_event(text, text, int, text, int) from public;
revoke all on function public.record_cu_game_event(text, text, int, text, int) from anon;
grant execute on function public.record_cu_game_event(text, text, int, text, int) to anon, authenticated;

-- ============ LIBRARY PROGRESS (shared table, cu- lesson ids) ============
create table if not exists library_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table library_progress enable row level security;
drop policy if exists "Cu users manage own library progress" on library_progress;
create policy "Cu users manage own library progress"
  on library_progress for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
