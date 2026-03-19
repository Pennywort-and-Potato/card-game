-- ============================================================
-- Update poker_rooms game_mode check to include bigtwo
-- ============================================================

-- 1. Drop the old constraint first so we can update the data
alter table public.poker_rooms
  drop constraint if exists poker_rooms_game_mode_check;

-- 2. Migrate any existing 'tienlen' data to 'bigtwo'
update public.poker_rooms
set game_mode = 'bigtwo'
where game_mode = 'tienlen';

-- 3. Add the new constraint back
alter table public.poker_rooms
  add constraint poker_rooms_game_mode_check
    check (game_mode in ('blackjack', 'poker', 'bigtwo'));
