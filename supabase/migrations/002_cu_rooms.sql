-- 002_cu_rooms.sql — Cờ Úp rooms: tables, RLS, room-creation RPC,
-- challenges, referrals, room matches (PUBLIC masked state only) and
-- the server-only match secrets table.
-- Run in the Dashboard SQL editor AFTER 001. Idempotent.
--
-- Room status vocabulary: 'open' | 'playing' | 'closed'.
-- Match status vocabulary: 'active' | 'finished' | 'cancelled'.
-- Match result vocabulary: 'red' | 'black' | 'draw' (winning SEAT).
--
-- *** HIDDEN-INFORMATION RULE (design doc §7, the core of this game) ***
-- cu_matches carries ONLY masked state: public_fen (covered pieces as
-- X/x), the move list (UCI + flip suffixes), and the shuffle commitment
-- hash. The TRUE layout + seed live in cu_match_secrets, which has RLS
-- enabled and ZERO policies for anon/authenticated and is NOT in the
-- realtime publication. Only the service-role API routes
-- (app/api/rooms/*) and SECURITY DEFINER functions may touch it.

-- ============ ROOMS ============
create table if not exists cu_rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  leader_id uuid references profiles(id),
  max_players int not null default 8 check (max_players between 2 and 20),
  is_public boolean not null default false,
  status text not null default 'open' check (status in ('open', 'playing', 'closed')),
  turn_order uuid[] not null default '{}',
  rules text,
  created_at timestamptz not null default now()
);
alter table cu_rooms enable row level security;

create table if not exists cu_room_members (
  room_id uuid not null references cu_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player', 'spectator')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table cu_room_members enable row level security;

-- RLS helpers. Evaluated with the CALLER's privileges inside policies, so
-- they MUST keep execute grants for anon + authenticated (revoking them
-- breaks every room read — family lesson from CCT).
create or replace function public.is_cu_room_member(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from cu_room_members where room_id = rid and user_id = auth.uid());
$$;
create or replace function public.is_cu_room_leader(rid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from cu_rooms where id = rid and leader_id = auth.uid());
$$;
revoke all on function public.is_cu_room_member(uuid) from public;
revoke all on function public.is_cu_room_member(uuid) from anon;
grant execute on function public.is_cu_room_member(uuid) to anon, authenticated;
revoke all on function public.is_cu_room_leader(uuid) from public;
revoke all on function public.is_cu_room_leader(uuid) from anon;
grant execute on function public.is_cu_room_leader(uuid) to anon, authenticated;

drop policy if exists "cu_rooms member read" on cu_rooms;
create policy "cu_rooms member read" on cu_rooms
  for select using (
    is_cu_room_member(id) or is_cu_room_leader(id) or is_public
  );
drop policy if exists "cu_rooms leader insert" on cu_rooms;
create policy "cu_rooms leader insert" on cu_rooms
  for insert to authenticated with check (auth.uid() = leader_id);
drop policy if exists "cu_rooms leader update" on cu_rooms;
create policy "cu_rooms leader update" on cu_rooms
  for update using (is_cu_room_leader(id));
drop policy if exists "cu_members read" on cu_room_members;
create policy "cu_members read" on cu_room_members
  for select using (is_cu_room_member(room_id));
drop policy if exists "cu_members self join" on cu_room_members;
create policy "cu_members self join" on cu_room_members
  for insert with check (auth.uid() = user_id);

do $$ begin
  alter publication supabase_realtime add table public.cu_rooms;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.cu_room_members;
exception when duplicate_object then null;
end $$;

-- Room-code generator (family standard alphabet, 6 chars). Internal.
create or replace function public.cu_gen_room_code()
returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_i int;
begin
  for v_i in 1..6 loop
    v_code := v_code || substr(
      v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_code;
end $$;
revoke all on function public.cu_gen_room_code() from public;
revoke all on function public.cu_gen_room_code() from anon;
revoke all on function public.cu_gen_room_code() from authenticated;

-- Create-room RPC (family pattern): atomically insert the room
-- (turn_order = [leader]) + the leader member row; the invite code is
-- generated server-side. Host = Red by ruling (seat assignment happens
-- in cu_start_next_match, 003: rotation head takes Red).
create or replace function public.cu_create_room(
  p_name text,
  p_is_public boolean default false,
  p_max_players int default 8
) returns cu_rooms
language plpgsql security definer set search_path = public as $$
declare
  v_room cu_rooms;
  v_code text;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_max int := coalesce(p_max_players, 8);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v_name is null then v_name := 'Phòng chơi'; end if;
  v_name := left(v_name, 60);
  if v_max < 2 then v_max := 2; end if;
  if v_max > 20 then v_max := 20; end if;
  loop
    v_code := cu_gen_room_code();
    exit when not exists (select 1 from cu_rooms where code = v_code);
  end loop;
  insert into cu_rooms (code, name, leader_id, is_public, max_players, turn_order)
  values (v_code, v_name, auth.uid(), coalesce(p_is_public, false), v_max,
          array[auth.uid()])
  returning * into v_room;
  insert into cu_room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'player');
  return v_room;
end $$;
revoke all on function public.cu_create_room(text, boolean, int) from public;
revoke all on function public.cu_create_room(text, boolean, int) from anon;
grant execute on function public.cu_create_room(text, boolean, int) to authenticated;

-- ============ MATCHES (public, masked state ONLY) ============
-- mode: 'live' (in-room realtime game) | 'corr' (correspondence game
-- hosted in a room — see 004 for the deadline columns).
-- public_fen: masked extended FEN (X/x for covered pieces).
-- moves: space-separated UCI + flip suffixes, in play order.
-- commitment: SHA-256 commitment of (seed + layout), published by the
--   server route at deal time; revealed_layout / revealed_seed are
--   filled by the server when the match ends so anyone can verify the
--   shuffle was honest (design doc §7.2).
-- draw_offer_by: user id of the player with a pending draw offer.
create table if not exists cu_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cu_rooms(id) on delete cascade,
  red_id uuid references profiles(id),
  black_id uuid references profiles(id),
  status text not null default 'active'
    check (status in ('active', 'finished', 'cancelled')),
  mode text not null default 'live' check (mode in ('live', 'corr')),
  public_fen text not null
    default 'xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w - - 0 1',
  moves text not null default '',
  commitment text,
  result text check (result in ('red', 'black', 'draw')),
  reason text,
  winner_id uuid references profiles(id),
  draw_offer_by uuid references profiles(id),
  revealed_layout jsonb,
  revealed_seed text,
  tournament_id uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists cu_matches_room_idx
  on cu_matches (room_id, created_at desc);
alter table cu_matches enable row level security;
drop policy if exists "cu_matches member read" on cu_matches;
create policy "cu_matches member read" on cu_matches
  for select using (is_cu_room_member(room_id));
drop policy if exists "cu_matches public read" on cu_matches;
create policy "cu_matches public read" on cu_matches
  for select to anon, authenticated using (
    exists (select 1 from cu_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
-- NO client INSERT/UPDATE/DELETE policies on cu_matches: moves are
-- server-authoritative. Rows are created by the SECURITY DEFINER RPCs
-- in 003 and mutated only by the service-role move route (which
-- bypasses RLS) after engine validation. Spectators and players read
-- the masked feed via the policies above + realtime.
do $$ begin
  alter publication supabase_realtime add table public.cu_matches;
exception when duplicate_object then null;
end $$;

-- ============ MATCH SECRETS (server-only true state) ============
-- true_layout: jsonb array of the 32 dealt pieces
--   [{id, color, trueType, fakeType, x, y}, ...] as dealt.
-- seed: the server-only shuffle seed (text form of the engine seed).
-- full_fen: the FULL extended FEN at deal time (replay/audit anchor).
-- RLS is ENABLED with NO policies at all: anon and authenticated get
-- nothing (every SELECT/INSERT/UPDATE/DELETE is denied by RLS), and the
-- table is deliberately NOT added to the realtime publication. Table
-- privileges are also revoked from both client roles as belt-and-braces
-- (RLS alone would suffice; both layers are asserted by the smoke test).
create table if not exists cu_match_secrets (
  match_id uuid primary key references cu_matches(id) on delete cascade,
  true_layout jsonb not null,
  seed text not null,
  full_fen text not null default '',
  created_at timestamptz not null default now()
);
alter table cu_match_secrets enable row level security;
-- (Intentionally NO create policy statements for this table.)
revoke all on table public.cu_match_secrets from anon;
revoke all on table public.cu_match_secrets from authenticated;

-- ============ CHALLENGES ============
create table if not exists cu_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references profiles(id) on delete cascade,
  challenged_id uuid not null references profiles(id) on delete cascade,
  room_id uuid references cu_rooms(id) on delete cascade,
  room_code text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists cu_challenges_challenged_idx
  on cu_challenges (challenged_id, created_at desc);
do $$ begin
  alter table cu_challenges
    add constraint cu_challenges_status_check
    check (status in ('pending', 'accepted', 'declined'));
exception when duplicate_object then null;
end $$;
alter table cu_challenges enable row level security;
drop policy if exists "cu_challenges party" on cu_challenges;
drop policy if exists "cu_challenges select party" on cu_challenges;
create policy "cu_challenges select party" on cu_challenges
  for select to authenticated
  using (auth.uid() = challenger_id or auth.uid() = challenged_id);
drop policy if exists "cu_challenges insert" on cu_challenges;
create policy "cu_challenges insert" on cu_challenges
  for insert to authenticated
  with check (auth.uid() = challenger_id and auth.uid() != challenged_id);
drop policy if exists "cu_challenges update" on cu_challenges;
create policy "cu_challenges update" on cu_challenges
  for update to authenticated
  using (auth.uid() = challenged_id)
  with check (auth.uid() = challenged_id);
-- REPLICA IDENTITY FULL is mandatory: the challenge-accept realtime
-- subscription filters UPDATEs on challenger_id (a non-PK column).
alter table cu_challenges replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.cu_challenges;
exception when duplicate_object then null;
end $$;

-- ============ REFERRALS ============
create table if not exists cu_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referee_id uuid not null references profiles(id) on delete cascade unique,
  created_at timestamptz not null default now()
);
alter table cu_referrals enable row level security;
drop policy if exists "cu_referrals party" on cu_referrals;
create policy "cu_referrals party" on cu_referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referee_id);

create or replace function public.cu_claim_referral(p_referrer_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_referrer_id = auth.uid() then return false; end if;
  insert into cu_referrals (referrer_id, referee_id)
    values (p_referrer_id, auth.uid())
  on conflict (referee_id) do nothing;
  if found then
    insert into cu_stats (user_id, xp) values (p_referrer_id, 20)
      on conflict (user_id) do update set xp = cu_stats.xp + 20;
    insert into cu_stats (user_id, xp) values (auth.uid(), 20)
      on conflict (user_id) do update set xp = cu_stats.xp + 20;
    return true;
  end if;
  return false;
end $$;
revoke all on function public.cu_claim_referral(uuid) from public;
revoke all on function public.cu_claim_referral(uuid) from anon;
grant execute on function public.cu_claim_referral(uuid) to authenticated;
