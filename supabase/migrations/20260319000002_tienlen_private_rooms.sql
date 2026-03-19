-- ============================================================
-- Add tienlen game mode + private room support
-- ============================================================

-- 1. Drop the old game_mode check constraint and replace it to include tienlen
alter table public.poker_rooms
  drop constraint if exists poker_rooms_game_mode_check;

alter table public.poker_rooms
  add constraint poker_rooms_game_mode_check
    check (game_mode in ('blackjack', 'poker', 'tienlen'));

-- 2. Add is_private column (false = public/discoverable, true = invite-only)
alter table public.poker_rooms
  add column if not exists is_private boolean not null default false;

-- 3. Index for the public room discovery query (status=waiting, is_private=false)
create index if not exists poker_rooms_public_waiting_idx
  on public.poker_rooms (game_mode, created_at desc)
  where status = 'waiting' and is_private = false;
