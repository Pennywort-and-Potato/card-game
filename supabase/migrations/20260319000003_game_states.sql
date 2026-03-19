-- ============================================================
-- Shared game state + player action queue for multiplayer
-- ============================================================

-- game_states: one row per active room, stores full serialised game state
create table if not exists public.game_states (
  room_id    uuid        primary key references public.poker_rooms(id) on delete cascade,
  state      jsonb       not null default '{}',
  updated_at timestamptz not null default now()
);

-- player_actions: players insert their moves here; host processes the queue
create table if not exists public.player_actions (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references public.poker_rooms(id) on delete cascade,
  player_name text        not null,
  action_type text        not null,
  payload     jsonb       not null default '{}',
  processed   boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists player_actions_unprocessed_idx
  on public.player_actions (room_id, created_at)
  where processed = false;

-- Realtime
alter publication supabase_realtime add table public.game_states;
alter publication supabase_realtime add table public.player_actions;

-- RLS
alter table public.game_states   enable row level security;
alter table public.player_actions enable row level security;

create policy "game_states_select" on public.game_states for select using (true);
create policy "game_states_insert" on public.game_states for insert with check (true);
create policy "game_states_update" on public.game_states for update using (true);

create policy "player_actions_select" on public.player_actions for select using (true);
create policy "player_actions_insert" on public.player_actions for insert with check (true);
create policy "player_actions_update" on public.player_actions for update using (true);
