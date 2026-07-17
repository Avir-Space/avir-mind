-- Phase 6 — seed crew, qualifications, duty history, rule configs, assignments.
-- Deliberately seeds patterns that fire each crew signal (expiring qual, currency
-- gap, fatigue cluster, sub-minimum rest). Idempotent per org.

create or replace function public.seed_demo_crew(p_org_id uuid, p_user_id uuid)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count int := 0; i int; k int;
  v_role text; v_base text; v_juris text; v_type_code text; v_cm uuid;
  v_gap_cm uuid; v_gap_flight uuid;
  v_ds timestamptz; v_de timestamptz;
  v_fn text[] := array['James','Maria','Wei','Priya','Omar','Sofia','Liam','Chen','Aisha','Nikolai','Elena','David','Fatima','Marco','Yuki','Hassan','Grace','Tobias','Ana','Ravi','Клара','Noah','Ines','Kwame','Lena','Diego','Mei','Samir','Olivia','Bjorn','Zara','Felix','Nadia','Ivan','Rosa','Kai','Amara','Luca','Petra','Sven'];
  v_ln text[] := array['Weber','Santos','Zhang','Patel','Farouk','Rossi','Murphy','Lin','Khan','Volkov','Petrova','Klein','Aziz','Bianchi','Tanaka','Reyes','Okoro','Bauer','Costa','Nair','Schmidt','Cohen','Duarte','Mensah','Larsen','Torres','Wang','Haddad','Byrne','Nilsson','Ali','Braun','Ivanova','Petrov','Garcia','Yamamoto','Diallo','Ferrari','Novak','Berg'];
begin
  if exists (select 1 from public.crew_members where org_id = p_org_id) then return 0; end if;

  -- Qualification catalog.
  insert into public.qualifications (org_id, qualification_code, qualification_name, qualification_type, applicable_roles, applicable_aircraft_types, validity_duration_days, issuing_authority) values
    (p_org_id, 'A320_TYPE', 'A320 Family Type Rating', 'type_rating', array['captain','first_officer'], array['A320neo','A321'], 365, 'EASA'),
    (p_org_id, 'B737_TYPE', 'B737 Type Rating', 'type_rating', array['captain','first_officer'], array['B737-800','B737 MAX 8'], 365, 'FAA'),
    (p_org_id, 'BIZJET_TYPE', 'Business Jet Type Rating', 'type_rating', array['captain','first_officer'], array['G650','Falcon 7X','Global 7500'], 365, 'FAA'),
    (p_org_id, 'REGIONAL_TYPE', 'Regional Jet Type Rating', 'type_rating', array['captain','first_officer'], array['E175','CRJ-900'], 365, 'FAA'),
    (p_org_id, 'IFR', 'Instrument Rating', 'endorsement', array['captain','first_officer'], null, 365, 'Internal Training'),
    (p_org_id, 'MEDICAL_CLASS1', 'Class 1 Medical', 'medical', array['captain','first_officer'], null, 365, 'AME'),
    (p_org_id, 'LINE_CHECK', 'Line Check', 'line_check', array['captain','first_officer'], null, 365, 'Internal Training'),
    (p_org_id, 'CRM', 'Crew Resource Management', 'recurrent_training', array['captain','first_officer','cabin_crew','loadmaster','engineer'], null, 1095, 'Internal Training'),
    (p_org_id, 'DANGEROUS_GOODS', 'Dangerous Goods Cat A', 'recurrent_training', array['cabin_crew','loadmaster'], null, 730, 'Internal Training'),
    (p_org_id, 'CABIN_SAFETY', 'Cabin Safety & Emergency', 'recurrent_training', array['cabin_crew'], null, 365, 'Internal Training'),
    (p_org_id, 'ENGINE_RUN', 'Engine Run-Up Authorization', 'endorsement', array['engineer'], null, 365, 'Internal Training');

  -- 3 rule configurations.
  insert into public.rule_configurations (org_id, rule_config_name, regulator, cba_overlay_name, applicable_roles, effective_from, rule_stack) values
    (p_org_id, 'US Part 117 Domestic', 'faa_part_117', null, array['captain','first_officer'], current_date - 365,
     '{"flight_time_limits":{"24h_max_hours":8,"24h_max_hours_augmented":13,"168h_max_hours":30,"672h_max_hours":100,"365d_max_hours":1000},"duty_time_limits":{"max_duty_period_hours":14,"max_duty_period_night_hours":12,"min_rest_between_duties_hours":10,"min_rest_after_duty_hours":10,"wocl_extension_hours":2},"cba_overlays":{"additional_max_flight_hours_pilot":0,"additional_min_rest_hours":0},"fatigue_extensions":{"wocl_window_start":"0200","wocl_window_end":"0600","consecutive_early_starts_max":3,"circadian_disruption_recovery_days":2}}'::jsonb),
    (p_org_id, 'EASA FTL Charter', 'easa_ftl', null, null, current_date - 365,
     '{"flight_time_limits":{"24h_max_hours":9,"24h_max_hours_augmented":13,"168h_max_hours":32,"672h_max_hours":100,"365d_max_hours":1000},"duty_time_limits":{"max_duty_period_hours":13,"max_duty_period_night_hours":11,"min_rest_between_duties_hours":11,"min_rest_after_duty_hours":12,"wocl_extension_hours":1},"cba_overlays":{},"fatigue_extensions":{"wocl_window_start":"0200","wocl_window_end":"0559","consecutive_early_starts_max":2,"circadian_disruption_recovery_days":2}}'::jsonb),
    (p_org_id, 'Pilot Union CBA Overlay', 'faa_part_117', 'ALPA Local 42', array['captain','first_officer'], current_date - 200,
     '{"flight_time_limits":{"24h_max_hours":8,"24h_max_hours_augmented":12,"168h_max_hours":28,"672h_max_hours":95,"365d_max_hours":950},"duty_time_limits":{"max_duty_period_hours":13,"max_duty_period_night_hours":11,"min_rest_between_duties_hours":12,"min_rest_after_duty_hours":12,"wocl_extension_hours":0},"cba_overlays":{"additional_max_flight_hours_pilot":-2,"additional_min_rest_hours":2,"commutable_pairing_rules":{"min_commute_buffer_hours":4}},"fatigue_extensions":{"consecutive_early_starts_max":2,"circadian_disruption_recovery_days":3}}'::jsonb);

  -- 40 crew members.
  for i in 1..40 loop
    v_role := case when i <= 10 then 'captain' when i <= 20 then 'first_officer' when i <= 34 then 'cabin_crew'
      when i in (35, 36) then 'loadmaster' when i in (37, 38) then 'engineer' when i = 39 then 'dispatcher' else 'ground_operations' end;
    v_base := (array['FRA','JFK','LAX','ORD','DFW','LHR','DXB'])[1 + (i % 7)];
    v_juris := case v_base when 'FRA' then 'easa_ftl' when 'LHR' then 'uk_caa_ftl' when 'DXB' then 'other' else 'faa_part_117' end;
    v_type_code := (array['A320_TYPE','B737_TYPE','BIZJET_TYPE','REGIONAL_TYPE'])[1 + (i % 4)];

    insert into public.crew_members (org_id, employee_id, first_name, last_name, email, role, home_base_station, hire_date, primary_jurisdiction, seniority_number, employment_status)
    values (p_org_id, 'EMP-' || lpad(i::text, 4, '0'), v_fn[i], v_ln[i], lower(v_fn[i]) || '.' || lower(v_ln[i]) || '@avir.example',
      v_role, v_base, (current_date - ((400 + i * 30) || ' days')::interval)::date, v_juris, i, 'active')
    returning id into v_cm;
    v_count := v_count + 1;
    if i = 3 then v_gap_cm := v_cm; end if;

    -- Qualifications per role.
    if v_role in ('captain', 'first_officer') then
      -- type rating (expired for the gap captain i=3)
      insert into public.crew_qualifications (org_id, crew_member_id, qualification_id, issued_date, expiry_date, status, issuing_reference)
      select p_org_id, v_cm, q.id, (current_date - interval '200 days')::date,
        case when i = 3 then (current_date - interval '15 days')::date else (current_date + ((260 + i * 3) || ' days')::interval)::date end,
        case when i = 3 then 'expired' else 'valid' end, 'CERT-' || i || '-T'
      from public.qualifications q where q.org_id = p_org_id and q.qualification_code = v_type_code;
      -- IFR + MEDICAL + LINE_CHECK + CRM; make some expire within 30 days
      insert into public.crew_qualifications (org_id, crew_member_id, qualification_id, issued_date, expiry_date, status, issuing_reference)
      select p_org_id, v_cm, q.id, (current_date - interval '180 days')::date,
        case when i % 8 = 0 and q.qualification_code = 'MEDICAL_CLASS1' then (current_date + ((5 + i % 20) || ' days')::interval)::date
             else (current_date + ((240 + i * 2) || ' days')::interval)::date end, 'valid', 'CERT-' || i
      from public.qualifications q where q.org_id = p_org_id and q.qualification_code in ('IFR', 'MEDICAL_CLASS1', 'LINE_CHECK', 'CRM');
    elsif v_role = 'cabin_crew' then
      insert into public.crew_qualifications (org_id, crew_member_id, qualification_id, issued_date, expiry_date, status, issuing_reference)
      select p_org_id, v_cm, q.id, (current_date - interval '150 days')::date,
        case when i % 8 = 0 and q.qualification_code = 'CABIN_SAFETY' then (current_date + ((6 + i % 18) || ' days')::interval)::date
             else (current_date + ((200 + i * 2) || ' days')::interval)::date end, 'valid', 'CERT-' || i
      from public.qualifications q where q.org_id = p_org_id and q.qualification_code in ('CABIN_SAFETY', 'DANGEROUS_GOODS', 'CRM');
    elsif v_role = 'engineer' then
      insert into public.crew_qualifications (org_id, crew_member_id, qualification_id, issued_date, expiry_date, status, issuing_reference)
      select p_org_id, v_cm, q.id, (current_date - interval '150 days')::date, (current_date + '200 days'::interval)::date, 'valid', 'CERT-' || i
      from public.qualifications q where q.org_id = p_org_id and q.qualification_code in ('ENGINE_RUN', 'CRM');
    else
      insert into public.crew_qualifications (org_id, crew_member_id, qualification_id, issued_date, expiry_date, status, issuing_reference)
      select p_org_id, v_cm, q.id, (current_date - interval '150 days')::date, (current_date + '400 days'::interval)::date, 'valid', 'CERT-' || i
      from public.qualifications q where q.org_id = p_org_id and q.qualification_code = 'CRM';
    end if;

    -- Duty history over the last 60 days (flight crew).
    if v_role in ('captain', 'first_officer', 'cabin_crew') then
      for k in 1..8 loop
        v_ds := now() - (((k * 7) + (i % 5)) || ' days')::interval + ((6 + (i % 6)) || ' hours')::interval;
        v_de := v_ds + interval '8 hours';
        insert into public.duty_periods (org_id, crew_member_id, duty_type, start_utc, end_utc, station_from, station_to, flight_time_minutes, night_operations, status)
        values (p_org_id, v_cm, 'flight', v_ds, v_de, v_base, (array['JFK','LHR','DXB','FRA','ORD'])[1 + (k % 5)], 420, k % 3 = 0, 'actual');
      end loop;
      -- Fatigue cluster: 5 flights in the last 7 days.
      if i % 9 = 0 then
        for k in 0..4 loop
          v_ds := now() - ((k) || ' days')::interval - interval '2 hours';
          insert into public.duty_periods (org_id, crew_member_id, duty_type, start_utc, end_utc, station_from, station_to, flight_time_minutes, night_operations, status)
          values (p_org_id, v_cm, 'flight', v_ds, v_ds + interval '9 hours', v_base, 'JFK', 480, k = 1, 'actual');
        end loop;
      end if;
      -- Sub-minimum rest: two duties 6 hours apart, ~12 days ago.
      if i % 11 = 0 then
        v_ds := now() - interval '12 days';
        insert into public.duty_periods (org_id, crew_member_id, duty_type, start_utc, end_utc, station_from, station_to, flight_time_minutes, status)
        values (p_org_id, v_cm, 'flight', v_ds, v_ds + interval '10 hours', v_base, 'LHR', 500, 'actual'),
               (p_org_id, v_cm, 'flight', v_ds + interval '16 hours', v_ds + interval '24 hours', 'LHR', v_base, 420, 'actual');
      end if;
    end if;
  end loop;

  -- Assign crew to upcoming flights; force a currency gap on an A320neo flight.
  select fs.id into v_gap_flight from public.flight_schedules fs join public.aircraft a on a.id = fs.aircraft_id
    where fs.org_id = p_org_id and a.aircraft_type = any(array['A320neo','A321']) and fs.scheduled_departure_utc > now()
    order by fs.scheduled_departure_utc limit 1;
  if v_gap_flight is not null and v_gap_cm is not null then
    insert into public.assignments (org_id, crew_member_id, flight_schedule_id, role_on_flight, assignment_status, assigned_by_user_id)
    values (p_org_id, v_gap_cm, v_gap_flight, 'pic', 'assigned', p_user_id);
  end if;

  -- Fill a handful of other upcoming flights with current pilots + cabin.
  for i in (
    select fs.id from public.flight_schedules fs where fs.org_id = p_org_id and fs.scheduled_departure_utc > now()
      and (v_gap_flight is null or fs.id <> v_gap_flight) order by fs.scheduled_departure_utc limit 8
  ) loop
    insert into public.assignments (org_id, crew_member_id, flight_schedule_id, role_on_flight, assignment_status, assigned_by_user_id)
    select p_org_id, cm.id, i, 'pic', 'assigned', p_user_id from public.crew_members cm
    where cm.org_id = p_org_id and cm.role = 'captain' and cm.id <> coalesce(v_gap_cm, cm.id) order by random() limit 1;
    insert into public.assignments (org_id, crew_member_id, flight_schedule_id, role_on_flight, assignment_status, assigned_by_user_id)
    select p_org_id, cm.id, i, 'sic', 'assigned', p_user_id from public.crew_members cm
    where cm.org_id = p_org_id and cm.role = 'first_officer' order by random() limit 1;
  end loop;

  return v_count;
end $$;
grant execute on function public.seed_demo_crew(uuid, uuid) to authenticated, anon, service_role;

-- Wire into signup + backfill.
create or replace function public.handle_new_user_signup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  begin
    v_org := public.seed_avir_demo(new.id);
    if v_org is not null then
      perform public.seed_demo_flight_schedules(v_org, new.id);
      perform public.seed_demo_components(v_org, new.id);
      perform public.seed_demo_inventory(v_org, new.id);
      perform public.generate_inventory_signals_for_org(v_org);
      perform public.seed_demo_crew(v_org, new.id);
      perform public.generate_crew_signals_for_org(v_org);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select o.id as org_id, (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id from public.orgs o loop
    perform public.seed_demo_crew(r.org_id, r.user_id);
    perform public.generate_crew_signals_for_org(r.org_id);
  end loop;
end $$;
