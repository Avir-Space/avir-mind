-- AVIR Mind — E2E test personas.
-- Seeds 10 confirmed test users (bypassing email verification) into the existing
-- Laman Operations (operator) + AVIR MRO Demo (mro) tenants, so authenticated
-- Playwright can sign in as real personas. All password: TestPersona!2026.
--
-- GUARD: seeding only runs when the DB setting app.allow_test_personas = 'on'.
-- (SQL migrations cannot read Supabase edge-function secrets, so the intended
-- AVIR_ALLOW_TEST_PERSONAS gate is modeled as a DB GUC. This migration opts in
-- explicitly below because this is the demo/E2E database — a real customer prod
-- DB would leave the GUC unset and this becomes a no-op.)

-- Skip the full org-seed trigger for test personas so they attach to the EXISTING
-- tenants instead of provisioning their own orgs.
create or replace function public.handle_new_user_signup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_mro uuid;
begin
  if new.email like '%@avir-test.dev' then return new; end if;  -- test personas: seeded explicitly
  begin
    v_org := public.seed_avir_demo(new.id);
    if v_org is not null then
      perform public.seed_demo_flight_schedules(v_org, new.id);
      perform public.seed_demo_components(v_org, new.id);
      perform public.seed_demo_inventory(v_org, new.id);
      perform public.seed_demo_crew(v_org, new.id);
      perform public.seed_demo_flight_ops(v_org, new.id);
      perform public.seed_demo_compliance(v_org, new.id);
      perform public.generate_inventory_signals_for_org(v_org);
      perform public.generate_crew_signals_for_org(v_org);
      perform public.generate_operational_signals_for_org(v_org);
      perform public.generate_compliance_signals_for_org(v_org);
      perform public.seed_demo_calibration(v_org, new.id);
      perform public.seed_demo_backtest(v_org, new.id);
      perform public.seed_demo_comms(v_org, new.id);
      v_mro := public.seed_demo_mro(new.id);
      perform public.seed_demo_enterprise(v_org, new.id);
      perform public.seed_demo_index(v_org, v_mro, new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create or replace function public.seed_test_personas()
returns int language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_op uuid; v_mro uuid; p record; v_uid uuid; v_role text; v_org uuid; n int := 0; v_crew text;
begin
  if coalesce(current_setting('app.allow_test_personas', true), 'off') <> 'on' then
    raise notice 'test personas guard off — no-op'; return 0;
  end if;

  -- resolve the demo tenants (owner = laman@avir.space)
  select o.id into v_op from public.orgs o join public.org_members m on m.org_id = o.id join auth.users u on u.id = m.user_id
    where u.email = 'laman@avir.space' and o.primary_business_model = 'operator' order by m.role = 'owner' desc limit 1;
  select o.id into v_mro from public.orgs o join public.org_members m on m.org_id = o.id join auth.users u on u.id = m.user_id
    where u.email = 'laman@avir.space' and o.primary_business_model = 'mro' limit 1;
  if v_op is null then raise notice 'operator tenant not found — no-op'; return 0; end if;

  -- clean any prior personas (cascades identities + memberships + channels + crew)
  delete from auth.users where email like '%@avir-test.dev';

  for p in select * from (values
    ('owner@avir-test.dev','owner','operator',null,null),
    ('dom@avir-test.dev','admin','operator','Director of Maintenance','engineer'),
    ('dispatcher@avir-test.dev','editor','operator','Dispatcher','dispatcher'),
    ('line_maint@avir-test.dev','editor','operator','Line Maintenance Controller','ground_operations'),
    ('dispatch_supervisor@avir-test.dev','admin','operator','Dispatch Supervisor','dispatcher'),
    ('read_only@avir-test.dev','viewer','operator',null,null),
    ('mro_owner@avir-test.dev','owner','mro',null,null),
    ('mro_customer_manager@avir-test.dev','editor','mro','Customer Manager',null),
    ('mro_technician@avir-test.dev','editor','mro','Shop Floor Technician',null),
    ('mro_quality@avir-test.dev','editor','mro','Quality Inspector',null)
  ) as t(email, role, tenant, job_title, crew_role)
  loop
    v_uid := gen_random_uuid();
    v_org := case when p.tenant = 'mro' then v_mro else v_op end;
    if v_org is null then continue; end if;

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', p.email,
      extensions.crypt('TestPersona!2026', extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('job_title', p.job_title), now(), now(), '', '', '', '');

    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, 'email',
      jsonb_build_object('sub', v_uid::text, 'email', p.email, 'email_verified', true, 'phone_verified', false), now(), now(), now());

    insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, p.role) on conflict do nothing;

    -- verified email notification channel
    insert into public.notification_channels (org_id, user_id, channel_type, channel_address, verification_status, verified_at_utc, is_active)
    values (v_org, v_uid, 'email', p.email, 'verified', now(), true) on conflict do nothing;

    -- crew record for operator personas with a crew-mappable job title
    if p.crew_role is not null and p.tenant = 'operator' then
      insert into public.crew_members (org_id, employee_id, first_name, last_name, email, role, home_base_station, employment_status)
      values (v_org, 'TP-' || substr(v_uid::text,1,8), initcap(split_part(p.email,'@',1)), 'Persona', p.email, p.crew_role, 'JFK', 'active')
      on conflict do nothing;
    end if;

    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.seed_test_personas() to service_role;

-- Opt in for this (demo/E2E) database and run the seed.
do $$
begin
  perform set_config('app.allow_test_personas', 'on', false);
  perform public.seed_test_personas();
end $$;
