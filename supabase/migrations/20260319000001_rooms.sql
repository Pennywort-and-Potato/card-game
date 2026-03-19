-- ============================================================
-- Multiplayer rooms schema
-- ============================================================

create table if not exists public.poker_rooms (
  id          uuid        primary key default gen_random_uuid(),
  code        char(6)     not null unique,
  game_mode   text        not null check (game_mode in ('blackjack', 'poker')),
  host_name   text        not null default 'Host',
  max_players smallint    not null default 6 check (max_players between 2 and 8),
  status      text        not null default 'waiting'
                            check (status in ('waiting', 'playing', 'finished')),
  created_at  timestamptz not null default now()
);

create table if not exists public.poker_room_players (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.poker_rooms(id) on delete cascade,
  player_name text        not null,
  seat_index  smallint    not null,
  balance     integer     not null default 1000 check (balance >= 0),
  is_host     boolean     not null default false,
  joined_at   timestamptz not null default now(),
  unique (room_id, seat_index),
  unique (room_id, player_name)
);

-- Indexes
create index if not exists poker_rooms_code_idx        on public.poker_rooms (code);
create index if not exists poker_rooms_status_idx      on public.poker_rooms (status);
create index if not exists poker_room_players_room_idx on public.poker_room_players (room_id);

-- Enable Realtime
alter publication supabase_realtime add table public.poker_rooms;
alter publication supabase_realtime add table public.poker_room_players;

-- RLS
alter table public.poker_rooms        enable row level security;
alter table public.poker_room_players enable row level security;

create policy "rooms_public_read"
  on public.poker_rooms for select using (true);

create policy "rooms_public_insert"
  on public.poker_rooms for insert with check (true);

create policy "rooms_public_update"
  on public.poker_rooms for update using (true);

create policy "room_players_public_read"
  on public.poker_room_players for select using (true);

create policy "room_players_public_insert"
  on public.poker_room_players for insert with check (true);
