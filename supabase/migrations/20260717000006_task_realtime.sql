-- 0106: enable Supabase Realtime on the task stream.
-- tasks (INSERT/UPDATE/DELETE), task_events (INSERT), task_acknowledgements (INSERT).
-- REPLICA IDENTITY FULL so UPDATE/DELETE events carry the full row (needed for
-- client-side org filtering and to know which row changed).

alter table public.tasks replica identity full;
alter table public.task_acknowledgements replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_events'
  ) then
    alter publication supabase_realtime add table public.task_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_acknowledgements'
  ) then
    alter publication supabase_realtime add table public.task_acknowledgements;
  end if;
end
$$;
