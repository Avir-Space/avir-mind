-- Bug 4: read-only role + MRO customer visibility.
--
-- (a) Write gate: create_customer_account / create_service_contract only checked
--     is_org_member, so a VIEWER could create customers/contracts via the RPC
--     (the UI merely hides the buttons). Require is_org_editor — viewers are now
--     blocked at the DB layer with a clear error. Reads are unchanged (viewers
--     already SELECT via org membership; get_customer_accounts has no role filter).
--
-- (b) Demonstrability: customers are MRO-tenant data, but the only read-only
--     persona (read_only@avir-test.dev) belongs solely to the operator org, which
--     has no customers — hence "sees 0". Add read_only as a VIEWER of the MRO
--     tenant that actually holds the seeded customers so read-only MRO access can
--     be verified (they must switch to that tenant; the switcher now appears).

-- ── (a) write gate ───────────────────────────────────────────────────────────
create or replace function public.create_customer_account(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_editor(v_org) then raise exception 'editor role required to add customers'; end if;
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, primary_contact_phone, customer_status, credit_limit_usd, payment_terms, default_currency, notes)
  values (v_org, p->>'customer_name', p->>'customer_code', p->>'customer_type', p->>'primary_contact_name', p->>'primary_contact_email', p->>'primary_contact_phone',
    coalesce(p->>'customer_status','active'), (p->>'credit_limit_usd')::numeric, p->>'payment_terms', coalesce(p->>'default_currency','USD'), p->>'notes')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_service_contract(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_editor(v_org) then raise exception 'editor role required to add contracts'; end if;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, auto_renew,
    covered_aircraft_types, covered_scope, excluded_scope, pricing_structure, sla_definitions, warranty_terms, reporting_obligations, annual_value_usd, contract_status)
  values (v_org, (p->>'customer_account_id')::uuid, p->>'contract_number', p->>'contract_name', p->>'contract_type',
    (p->>'effective_from')::date, (p->>'effective_to')::date, coalesce((p->>'auto_renew')::boolean, false),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p->'covered_aircraft_types') x), '{}'),
    p->'covered_scope', p->'excluded_scope', p->'pricing_structure', p->'sla_definitions', p->'warranty_terms', p->'reporting_obligations',
    (p->>'annual_value_usd')::numeric, coalesce(p->>'contract_status','active'))
  returning id into v_id;
  return v_id;
end $$;

-- ── (b) read-only viewer in the MRO tenant that has customers ─────────────────
do $$
declare v_ro uuid; v_mro uuid;
begin
  select id into v_ro from auth.users where email = 'read_only@avir-test.dev';
  select o.id into v_mro from public.orgs o
    where o.primary_business_model = 'mro'
      and exists (select 1 from public.customer_accounts c where c.org_id = o.id)
    order by (select count(*) from public.customer_accounts c where c.org_id = o.id) desc
    limit 1;
  if v_ro is not null and v_mro is not null
     and not exists (select 1 from public.org_members where org_id = v_mro and user_id = v_ro) then
    insert into public.org_members (org_id, user_id, role) values (v_mro, v_ro, 'viewer');
  end if;
end $$;
