-- 009_cu_room_chat.sql — In-room private chat, per-move match comments
-- and match reactions for Cờ Úp rooms (family room trio).
-- Run in the Dashboard SQL editor AFTER 008. Idempotent.
--
-- Three distinct streams (family pattern):
--   * cu_room_messages — member-only room chat (players AND
--     spectators), lives for the room, not a match. Direct table
--     access + RLS via is_cu_room_member, no RPC. Client channel:
--     cu-room-chat:<roomId>.
--   * cu_room_comments — PUBLIC per-move comments tied to a match +
--     move number; members write, members + guests of public rooms
--     read. A comment-XP trigger (+2, cap 10/day) rides on inserts.
--   * cu_match_reactions — emoji reactions on a match, member-only.
--
-- IMPORTANT (the family production lesson): the RLS helpers
-- is_cu_room_member / is_cu_room_leader must KEEP execute for
-- authenticated AND anon (granted in 002). This migration does NOT
-- touch helper grants.

-- ============ ROOM CHAT (member-only) ============
create table if not exists cu_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cu_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists cu_room_messages_room_idx
  on cu_room_messages (room_id, created_at);
alter table cu_room_messages enable row level security;
drop policy if exists "cu_messages member read" on cu_room_messages;
create policy "cu_messages member read" on cu_room_messages
  for select using (is_cu_room_member(room_id));
drop policy if exists "cu_messages member write" on cu_room_messages;
create policy "cu_messages member write" on cu_room_messages
  for insert with check (is_cu_room_member(room_id) and auth.uid() = user_id);
do $$ begin
  alter publication supabase_realtime add table public.cu_room_messages;
exception when duplicate_object then null;
end $$;

-- ============ PER-MOVE COMMENTS ============
create table if not exists cu_room_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cu_rooms(id) on delete cascade,
  match_id uuid references cu_matches(id) on delete cascade,
  move_number int not null default 0,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists cu_room_comments_room_idx
  on cu_room_comments (room_id, created_at desc);
alter table cu_room_comments enable row level security;
drop policy if exists "cu_comments member read" on cu_room_comments;
create policy "cu_comments member read" on cu_room_comments
  for select using (is_cu_room_member(room_id));
drop policy if exists "cu_comments member write" on cu_room_comments;
create policy "cu_comments member write" on cu_room_comments
  for insert with check (is_cu_room_member(room_id) and auth.uid() = user_id);
drop policy if exists "cu_comments public read" on cu_room_comments;
create policy "cu_comments public read" on cu_room_comments
  for select to anon, authenticated using (
    exists (select 1 from cu_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
do $$ begin
  alter publication supabase_realtime add table public.cu_room_comments;
exception when duplicate_object then null;
end $$;

-- Comment XP trigger (+2/comment for bodies >= 4 chars, cap 10/day,
-- via the 003 ledger helper; also stamps the daily participation bonus).
create or replace function public.cu_award_comment_xp()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_today int;
begin
  if length(trim(new.body)) >= 4 then
    select coalesce(sum(xp), 0) into v_today from cu_room_xp_ledger
      where user_id = new.user_id and kind = 'comment' and day = current_date;
    if v_today < 10 then
      perform cu_award_room_xp(new.user_id, 'comment', new.id, 2);
    end if;
  end if;
  perform cu_award_room_xp(
    new.user_id, 'daily', '00000000-0000-0000-0000-000000000000', 10);
  return new;
end $$;
revoke all on function public.cu_award_comment_xp() from public;
revoke all on function public.cu_award_comment_xp() from anon;
revoke all on function public.cu_award_comment_xp() from authenticated;
drop trigger if exists cu_comments_xp on cu_room_comments;
create trigger cu_comments_xp
  after insert on cu_room_comments
  for each row execute function public.cu_award_comment_xp();

-- ============ MATCH REACTIONS ============
create table if not exists cu_match_reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references cu_rooms(id) on delete cascade,
  match_id uuid not null references cu_matches(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);
alter table cu_match_reactions enable row level security;
drop policy if exists "cu_reactions member" on cu_match_reactions;
create policy "cu_reactions member" on cu_match_reactions
  for all using (is_cu_room_member(room_id));
drop policy if exists "cu_reactions public read" on cu_match_reactions;
create policy "cu_reactions public read" on cu_match_reactions
  for select to anon, authenticated using (
    exists (select 1 from cu_rooms r
            where r.id = room_id and r.is_public and r.status <> 'closed'));
do $$ begin
  alter publication supabase_realtime add table public.cu_match_reactions;
exception when duplicate_object then null;
end $$;
