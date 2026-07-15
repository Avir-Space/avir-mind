-- AVIR Mind — Phase 0 schema
-- 0001: extensions + shared utility trigger function
--
-- gen_random_uuid() is built into Postgres 17 core, but pgcrypto is kept for
-- portability across environments.

create extension if not exists pgcrypto;

-- Generic updated_at maintainer. Attached to every table that carries updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
