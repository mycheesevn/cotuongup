-- 004_cu_correspondence.sql — Correspondence (async) Cờ Úp: slow games
-- where each side moves whenever they are online.
-- Run in the Dashboard SQL editor AFTER 003. Idempotent.
--
-- Design (BUILD_CONTRACT / design doc §7): correspondence games are
-- cu_matches rows with mode='corr' hosted in a room; this file adds the
-- per-move deadline columns to cu_matches, plus a standalone
-- cu_corr_games table for room-less async games (family pattern).
-- BOTH surfaces are server-authoritative: like live matches, a corr
-- move is POSTed to app/api/rooms/move, validated by the engine
-- against the secret state, and written by the service role. There are
-- NO client INSERT/UPDATE policies that can change moves or state —
-- players may only READ their own games; the one client write allowed
-- is creating a challenge row (red = creator) whose deal (secret +
-- commitment) is completed by the server route before play starts.
-- True layouts for corr games live in cu_match_secrets (room matches)
-- or cu_corr_secrets (standalone games), both RLS-locked with no
-- client policies.

-- Deadline support on room matches (mode='corr'): the player to move
-- must move before move_deadline or the server route may claim a
-- timeout win. turn_deadline_hours is the per-move budget chosen at
-- creation (family default 72h).
alter table cu_matches
  add column if not exists move_deadline timestamptz;
alter table cu_matches
  add column if not exists turn_deadline_hours int not null default 72
  check (turn_deadline_hours between 1 and 336);
create index if not exists cu_matches_corr_deadline_idx
  on cu_matches (move_deadline) where mode = 'corr' and status = 'active';

-- ============ STANDALONE CORRESPONDENCE GAMES ============
create table if not exists cu_corr_games (
  id uuid primary key default gen_random_uuid(),
  red_id uuid not null references profiles(id) on delete cascade,
  black_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled')),
  public_fen text not null
    default 'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1',
  moves text not null default '',
  commitment text,
  result text check (result in ('red', 'black', 'draw')),
  winner_id uuid references profiles(id),
  draw_offer_by uuid references profiles(id),
  revealed_layout jsonb,
  revealed_seed text,
  turn_deadline_hours int not null default 72
    check (turn_deadline_hours between 1 and 336),
  move_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists cu_corr_games_players_idx
  on cu_corr_games (red_id, black_id, created_at desc);
alter table cu_corr_games enable row level security;

drop policy if exists "cu_corr_games player read" on cu_corr_games;
create policy "cu_corr_games player read" on cu_corr_games
  for select using (auth.uid() = red_id or auth.uid() = black_id);
drop policy if exists "cu_corr_games creator insert" on cu_corr_games;
create policy "cu_corr_games creator insert" on cu_corr_games
  for insert with check (auth.uid() = red_id and status = 'active');
-- No UPDATE/DELETE policies: all state changes go through the
-- service-role move route after engine validation.

do $$ begin
  alter publication supabase_realtime add table public.cu_corr_games;
exception when duplicate_object then null;
end $$;

-- True state for standalone corr games: same lockdown as
-- cu_match_secrets (RLS on, ZERO client policies, table privileges
-- revoked, NOT in the realtime publication).
create table if not exists cu_corr_secrets (
  game_id uuid primary key references cu_corr_games(id) on delete cascade,
  true_layout jsonb not null,
  seed text not null,
  full_fen text not null default '',
  created_at timestamptz not null default now()
);
alter table cu_corr_secrets enable row level security;
-- (Intentionally NO create policy statements for this table.)
revoke all on table public.cu_corr_secrets from anon;
revoke all on table public.cu_corr_secrets from authenticated;

-- Games where it is MY move (for the "your turn" list + push fan-out).
-- Side to move is derived from the ply count: Red moves on even plies.
create or replace function public.cu_corr_my_turn()
returns table (game_id uuid, opponent_id uuid, move_deadline timestamptz, updated_at timestamptz)
language sql security definer stable set search_path = public as $$
  select g.id,
         case when g.red_id = auth.uid() then g.black_id else g.red_id end,
         g.move_deadline, g.updated_at
  from cu_corr_games g
  where g.status = 'active'
    and (g.red_id = auth.uid() or g.black_id = auth.uid())
    and (
      (case when trim(g.moves) = '' then 0
            else array_length(string_to_array(trim(g.moves), ' '), 1) end % 2 = 0
       and g.red_id = auth.uid())
      or
      (case when trim(g.moves) = '' then 0
            else array_length(string_to_array(trim(g.moves), ' '), 1) end % 2 = 1
       and g.black_id = auth.uid())
    )
  order by g.move_deadline asc nulls last;
$$;
revoke all on function public.cu_corr_my_turn() from public;
revoke all on function public.cu_corr_my_turn() from anon;
grant execute on function public.cu_corr_my_turn() to authenticated;
