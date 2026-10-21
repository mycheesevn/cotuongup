-- 007_cu_setups.sql — Saved board setups: users arrange a position in
-- the setup editor and reuse it later without re-placing every piece.
-- One row per saved position. Run AFTER 006. Idempotent.
--
-- Cờ Úp setups can contain COVERED pieces: `fen` stores the FULL
-- extended FEN (including the hidden-assignment field), and
-- `placements` stores the structured covered-piece placements as jsonb
-- ([{x, y, color, trueType, fakeType, covered}, ...]) so the editor can
-- restore the exact hidden assignment. Fully-revealed setups simply
-- have no covered entries. Self-RLS, direct client CRUD, no RPC.

create table if not exists cu_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  fen text not null,
  placements jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists cu_setups_user_idx
  on cu_setups (user_id, created_at desc);

alter table cu_setups enable row level security;
drop policy if exists "cu_setups self" on cu_setups;
create policy "cu_setups self" on cu_setups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
