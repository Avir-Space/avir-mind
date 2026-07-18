-- Bug A: mro_owner / read_only saw 0 customers & contracts.
--
-- get_customer_accounts / get_service_contracts (SECURITY INVOKER) org-scope via
-- _caller_org(), which returns coalesce(active-org-preference, fallback). The
-- fallback ordered by (role='owner') desc, created_at — so a multi-org VIEWER
-- (read_only, a viewer in both Laman Operations and AVIR MRO Demo) resolved to
-- the earliest-created org (operator, 0 customers) instead of the MRO tenant that
-- holds the seeded customers. mro_owner already resolved correctly at the RPC
-- layer; an explicit preference makes it deterministic against stale session state.
--
-- Fix: (1) pin the active-org preference for the MRO-context personas + the
-- read-only viewer to the MRO tenant that has customers; (2) make the fallback
-- prefer the highest-privilege org so future multi-org members don't silently
-- land in an empty org.

-- (1) Deterministic active org for MRO-context personas ───────────────────────
do $$
declare v_mro uuid;
begin
  select o.id into v_mro from public.orgs o
    where o.primary_business_model = 'mro'
      and exists (select 1 from public.customer_accounts c where c.org_id = o.id)
    order by (select count(*) from public.customer_accounts c where c.org_id = o.id) desc
    limit 1;
  if v_mro is null then return; end if;

  insert into public.user_org_preferences (user_id, active_org_id)
  select u.id, v_mro
  from auth.users u
  where u.email in ('mro_owner@avir-test.dev', 'mro_customer_manager@avir-test.dev',
                    'mro_technician@avir-test.dev', 'mro_quality@avir-test.dev',
                    'read_only@avir-test.dev')
    and exists (select 1 from public.org_members m where m.org_id = v_mro and m.user_id = u.id)
  on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at_utc = now();
end $$;

-- (2) Robust fallback: highest privilege first, then earliest joined. ─────────
create or replace function public._caller_org()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    -- honor a valid active-org preference (still a member of it)
    (select p.active_org_id from public.user_org_preferences p
       join public.org_members m on m.org_id = p.active_org_id and m.user_id = auth.uid()
       where p.user_id = auth.uid()),
    -- else the org where the caller holds the most privilege, then earliest joined
    (select org_id from public.org_members where user_id = auth.uid()
       order by case role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end,
                created_at
       limit 1));
$$;
grant execute on function public._caller_org() to authenticated;
