-- 0004: membership helper functions used throughout RLS
--
-- Both are SECURITY DEFINER and owned by the migration role (which owns the
-- tables), so they bypass RLS internally. This is what prevents infinite
-- recursion when is_org_member() is referenced inside the org_members policy.
-- search_path is pinned to defeat search-path hijacking.

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = p_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id
  from public.org_members m
  where m.user_id = auth.uid();
$$;

grant execute on function public.is_org_member(uuid) to authenticated, anon;
grant execute on function public.current_user_org_ids() to authenticated, anon;
