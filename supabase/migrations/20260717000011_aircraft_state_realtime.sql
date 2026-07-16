-- 0111: publish aircraft_state on Realtime so Fleet-board state transitions
-- (e.g. drag Under Maintenance → On Ground) propagate live to other viewers.

alter table public.aircraft_state replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aircraft_state'
  ) then
    alter publication supabase_realtime add table public.aircraft_state;
  end if;
end
$$;
