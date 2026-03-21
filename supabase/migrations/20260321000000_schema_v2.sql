-- ============================================================
-- Schema v2: introduce players profile table, rename rooms/room_players,
-- replace game_states with room_states, add match_results,
-- switch player_actions to use player_id (UUID) instead of player_name.
-- ============================================================

-- Drop old tables in dependency order
drop table if exists public.player_actions  cascade;
drop table if exists public.game_states     cascade;
drop table if exists public.poker_room_players cascade;
drop table if exists public.poker_rooms     cascade;

-- Drop old stale-room cleanup job/function
drop function if exists public.cleanup_stale_rooms cascade;

-- ── players: one row per authenticated user ───────────────────────────────────
create table public.players (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  display_name text        not null,
  avatar       text        not null default '',
  balance      bigint      not null default 1000
);

-- ── rooms ─────────────────────────────────────────────────────────────────────
create table public.rooms (
  id             uuid        primary key default gen_random_uuid(),
  type           text        not null check (type in ('blackjack', 'poker', 'bigtwo')),
  max_player     integer     not null default 4,
  room_code      text        not null unique,
  is_public      boolean     not null default true,
  -- operational columns required by application logic
  status         text        not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at     timestamptz not null default now(),
  host_last_seen timestamptz not null default now()
);

-- ── room_players ──────────────────────────────────────────────────────────────
create table public.room_players (
  id            uuid        primary key default gen_random_uuid(),
  room_id       uuid        not null references public.rooms(id) on delete cascade,
  player_id     uuid        not null references public.players(id) on delete cascade,
  is_room_owner boolean     not null default false,
  seat_index    smallint    not null,
  joined_at     timestamptz not null default now(),
  unique (room_id, seat_index),
  unique (room_id, player_id)
);

-- ── room_states (replaces game_states) ───────────────────────────────────────
create table public.room_states (
  id      uuid  primary key default gen_random_uuid(),
  room_id uuid  not null unique references public.rooms(id) on delete cascade,
  state   jsonb not null default '{}'
);

-- ── player_actions ────────────────────────────────────────────────────────────
create table public.player_actions (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.rooms(id) on delete cascade,
  player_id   uuid        not null references public.players(id) on delete cascade,
  action_type text        not null,
  payload     jsonb       not null default '{}',
  processed   boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ── match_results ─────────────────────────────────────────────────────────────
create table public.match_results (
  id        uuid        primary key default gen_random_uuid(),
  room_id   uuid        not null references public.rooms(id) on delete cascade,
  winner_id uuid        not null references public.players(id) on delete cascade,
  issued_at timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index on public.rooms        (room_code);
create index on public.rooms        (status, is_public) where status = 'waiting';
create index on public.room_players (room_id);
create index on public.player_actions (room_id, created_at) where processed = false;

-- ── Realtime ──────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.room_states;
alter publication supabase_realtime add table public.player_actions;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.players        enable row level security;
alter table public.rooms          enable row level security;
alter table public.room_players   enable row level security;
alter table public.room_states    enable row level security;
alter table public.player_actions enable row level security;
alter table public.match_results  enable row level security;

create policy "players_select"        on public.players        for select using (true);
create policy "players_insert"        on public.players        for insert with check (true);
create policy "players_update"        on public.players        for update using (true);

create policy "rooms_select"          on public.rooms          for select using (true);
create policy "rooms_insert"          on public.rooms          for insert with check (true);
create policy "rooms_update"          on public.rooms          for update using (true);
create policy "rooms_delete"          on public.rooms          for delete using (true);

create policy "room_players_select"   on public.room_players   for select using (true);
create policy "room_players_insert"   on public.room_players   for insert with check (true);
create policy "room_players_delete"   on public.room_players   for delete using (true);

create policy "room_states_select"    on public.room_states    for select using (true);
create policy "room_states_insert"    on public.room_states    for insert with check (true);
create policy "room_states_update"    on public.room_states    for update using (true);

create policy "player_actions_select" on public.player_actions for select using (true);
create policy "player_actions_insert" on public.player_actions for insert with check (true);
create policy "player_actions_update" on public.player_actions for update using (true);

create policy "match_results_select"  on public.match_results  for select using (true);
create policy "match_results_insert"  on public.match_results  for insert with check (true);

-- ── Stale-room cleanup (updated table name) ───────────────────────────────────
create or replace function public.cleanup_stale_rooms()
returns void language sql security definer as $$
  delete from public.rooms
  where host_last_seen < now() - interval '2 minutes';
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('cleanup-stale-rooms');
    exception when others then null; end;
    perform cron.schedule(
      'cleanup-stale-rooms', '* * * * *',
      'select public.cleanup_stale_rooms()'
    );
  end if;
end $$;
