-- ============================================================
-- Blackjack game schema
-- ============================================================

-- Round results: one row per completed round
create table if not exists public.round_results (
  id             uuid        primary key default gen_random_uuid(),
  player_name    text        not null default 'Anonymous',
  result         text        not null
                               check (result in ('player-win', 'dealer-win', 'push', 'blackjack')),
  bet            integer     not null check (bet > 0),
  balance_after  integer     not null check (balance_after >= 0),
  created_at     timestamptz not null default now()
);

-- Index: leaderboard queries sort by balance_after desc
create index if not exists round_results_balance_after_idx
  on public.round_results (balance_after desc);

-- Index: per-player history lookups
create index if not exists round_results_player_name_idx
  on public.round_results (player_name);

-- ============================================================
-- Row-Level Security
-- ============================================================

alter table public.round_results enable row level security;

-- Anyone can read (public leaderboard)
create policy "allow_public_read"
  on public.round_results
  for select
  using (true);

-- Anyone can insert their own round (anonymous play)
create policy "allow_public_insert"
  on public.round_results
  for insert
  with check (true);

-- ============================================================
-- Leaderboard view: best balance achieved per player
-- ============================================================

create or replace view public.leaderboard
  with (security_invoker = true)
as
  select
    player_name,
    max(balance_after)  as high_score,
    count(*)::integer   as rounds_played
  from public.round_results
  group by player_name
  order by high_score desc;
