-- Phase 4 — a shared demo counterparty org so a single-tenant demo can exercise
-- the ownership-transfer flow (transfer to it → caller sees the historical view).
create or replace function public.get_or_create_demo_counterparty()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v uuid;
begin
  select id into v from public.orgs where name = 'AVIR Lease Pool (Demo)' limit 1;
  if v is null then
    insert into public.orgs (name, plan) values ('AVIR Lease Pool (Demo)', 'free') returning id into v;
  end if;
  return v;
end;
$$;

grant execute on function public.get_or_create_demo_counterparty() to authenticated;
