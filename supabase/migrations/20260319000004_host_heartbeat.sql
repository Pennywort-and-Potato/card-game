-- ============================================================
-- Host heartbeat + automatic stale-room cleanup
-- ============================================================

-- Track when the host last pinged
alter table public.poker_rooms
  add column if not exists host_last_seen timestamptz not null default now();

-- Cleanup function: delete any room whose host hasn't pinged in 2 minutes
create or replace function public.cleanup_stale_rooms()
returns void
language sql
security definer
as $$
  delete from public.poker_rooms
  where host_last_seen < now() - interval '2 minutes';
$$;

-- Schedule via pg_cron if the extension is enabled.
-- Enable it in Supabase Dashboard → Database → Extensions → pg_cron, then
-- run:  select cron.schedule('cleanup-stale-rooms', '* * * * *',
--         'select public.cleanup_stale_rooms()');
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('cleanup-stale-rooms');
    exception when others then null;
    end;
    perform cron.schedule(
      'cleanup-stale-rooms',
      '* * * * *',
      'select public.cleanup_stale_rooms()'
    );
  end if;
end $$;
