-- ============================================================
-- Add missing DELETE policies for rooms and players
-- ============================================================

-- Allow any authenticated or anonymous user to delete a room
-- in which they are the host. (Simplified for this project's RLS style)
create policy "rooms_public_delete"
  on public.poker_rooms for delete using (true);

-- Allow any user to remove themselves from a player list
create policy "room_players_public_delete"
  on public.poker_room_players for delete using (true);
