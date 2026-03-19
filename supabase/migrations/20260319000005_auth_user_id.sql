-- Host identity on the room
ALTER TABLE public.poker_rooms
  ADD COLUMN IF NOT EXISTS host_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Player identity on each seat
ALTER TABLE public.poker_room_players
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- One active waiting room per authenticated host (enforced at DB level)
CREATE UNIQUE INDEX IF NOT EXISTS one_waiting_room_per_host
  ON public.poker_rooms (host_user_id)
  WHERE status = 'waiting' AND host_user_id IS NOT NULL;
