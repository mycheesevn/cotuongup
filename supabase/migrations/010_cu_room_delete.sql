-- 010_cu_room_delete.sql
-- Owner-only room deletion (family pattern, room-delete).
--
-- Delete = permanent soft close (cu_rooms.status := 'closed'), never
-- hard DELETE. cu_room_members, cu_matches, cu_room_comments and
-- cu_room_messages all reference cu_rooms(id) on delete cascade, so a
-- hard DELETE would destroy finished-match history — NOT wanted.
--
-- The 'closed' state is the family's visibility gate:
-- cu_list_public_rooms, cu_room_leaderboard, cu_guest_room_detail and
-- cu_join_room all exclude closed rooms; closing makes the room vanish
-- everywhere: the in-game list, the hub, join-by-code, deep links and
-- guests.
--
-- Guards (server-side, never UI-only):
--   * owner-only: non-owner members and non-members are denied
--     (not_leader)
--   * active-match block: deleting while any cu_matches row is
--     status='active' is refused (match_in_progress); the UI maps it
--     to a visible message telling the leader to finish or cancel the
--     match first. (The pre-existing cu_close_room in 003 has NO such
--     guard — this RPC is the guarded delete path.)
--
-- IMPORTANT (the family production lesson): this migration does NOT
-- touch the is_cu_room_member / is_cu_room_leader helper grants — the
-- helpers must keep EXECUTE for authenticated AND anon (granted in 002).
--
-- There is no reopen path in the app, so closing here is effectively
-- irreversible by design.
--
-- NOTE: run AFTER 001–009 in the Dashboard SQL editor.

create or replace function public.cu_delete_room(p_room_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_active int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not is_cu_room_leader(p_room_id) then raise exception 'not_leader'; end if;
  select count(*) into v_active
  from cu_matches
  where room_id = p_room_id and status = 'active';
  if v_active > 0 then raise exception 'match_in_progress'; end if;
  update cu_rooms set status = 'closed' where id = p_room_id;
end $$;

revoke all on function public.cu_delete_room(uuid) from public;
revoke all on function public.cu_delete_room(uuid) from anon;
grant execute on function public.cu_delete_room(uuid) to authenticated;
