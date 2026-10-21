-- 008_cu_registry.sql — SynerWorlds hub registration for Cờ Úp.
-- One registry row lights the game up across the whole hub (home,
-- profiles, rooms, friends-playing, activity, LFG, family statistics):
-- the hub's aggregators loop registry rows (hub migration 004) using
-- prefix 'cu_', stats source 'cu_stats', and the room-match seat
-- columns red_id (first to move) / black_id.
--
-- Slug: 'co-up' — the hub/blog category convention for this game
-- (design doc §9: blog category `co-up`; hub slugs are short game ids:
-- xiangqi, chess, cct, coganh, checkers, caro, …). NOTE the slug is
-- NOT the subdomain: the canonical site is cotuongup.synerworlds.com.
-- Sort: 97 — the current family maximum is Caro at 96 (Checkers 95),
-- verified against the sibling registry migrations on 2026-10-21, so
-- Cờ Úp takes the next value and lists last (newest game).
-- Run in the Dashboard SQL editor AFTER 007 (on the shared project).

insert into public.game_registry
  (slug, name_vi, name_en, tagline_vi, tagline_en, site_url, stats_source,
   icon, accent, sort, prefix, match_col_a, match_col_b)
values
  ('co-up', 'Cờ Úp', 'Dark Xiangqi (Co Up)',
   'Cờ Úp — cờ tướng úp đầy kịch tính: lật quân mới biết quân gì',
   'Dark Xiangqi — hidden pieces, revealed on their first move',
   'https://cotuongup.synerworlds.com', 'cu_stats', '🃏', '#701e24', 97,
   'cu_', 'red_id', 'black_id')
on conflict (slug) do update set
  name_vi = excluded.name_vi, name_en = excluded.name_en,
  tagline_vi = excluded.tagline_vi, tagline_en = excluded.tagline_en,
  site_url = excluded.site_url, stats_source = excluded.stats_source,
  icon = excluded.icon, accent = excluded.accent, sort = excluded.sort,
  prefix = excluded.prefix,
  match_col_a = excluded.match_col_a, match_col_b = excluded.match_col_b,
  active = true;
