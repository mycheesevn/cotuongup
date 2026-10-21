-- 011_cu_quests.sql — Quests / check-in glue for Cờ Úp.
-- Run in the Dashboard SQL editor AFTER 010. Idempotent.
--
-- NO-OP BY DESIGN — read before wondering where the tables are.
--
-- In the sibling games (Caro 001, Checkers 001) the quest and check-in
-- state lives in per-game tables created by the FOUNDATION migration,
-- and Cờ Úp follows exactly that pattern in 001_cu_foundation.sql:
--   * cu_checkins + cu_claim_checkin()  (daily check-in, streak, XP)
--   * cu_quests + cu_claim_welcome() / cu_claim_quest()
--     (welcome +50 XP; quests play_1 / win_1 / join_room at +20 XP)
-- There is NO shared cross-game quests table in the family database
-- for this file to glue into (verified against the Caro/Checkers
-- migration sets and the Xiangqi original on 2026-10-21), and inventing
-- one here would fork the quest state the app already reads from 001.
--
-- So this file intentionally creates nothing; it exists so the
-- numbered run order 001→011 stays complete and future quest work has
-- a named home. Any NEW cu_ quest definitions belong in an amendment
-- to 001's cu_claim_quest() (same quest_id allow-list pattern), not in
-- new tables.
do $$ begin
  raise notice '011_cu_quests: quests/checkins live in 001 (cu_quests, cu_checkins); nothing to create.';
end $$;
