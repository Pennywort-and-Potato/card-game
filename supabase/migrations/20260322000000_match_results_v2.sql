-- ============================================================
-- match_results v2: extend for proper game dashboard support.
-- • Make room_id nullable + ON DELETE SET NULL (results survive room deletion)
-- • Add game_type column (filter by blackjack / poker / bigtwo)
-- • Add finish_order jsonb — [{id, name}] ordered 1st→last
-- ============================================================

-- Drop old FK constraint so we can re-add with SET NULL
alter table public.match_results
  drop constraint if exists match_results_room_id_fkey;

-- Make room_id nullable
alter table public.match_results
  alter column room_id drop not null;

-- Re-add FK with SET NULL on room deletion
alter table public.match_results
  add constraint match_results_room_id_fkey
  foreign key (room_id) references public.rooms(id) on delete set null;

-- New columns
alter table public.match_results
  add column if not exists game_type    text  not null default 'bigtwo',
  add column if not exists finish_order jsonb not null default '[]';

-- Indexes for dashboard queries
create index if not exists match_results_issued_at_idx  on public.match_results (issued_at desc);
create index if not exists match_results_game_type_idx  on public.match_results (game_type, issued_at desc);
