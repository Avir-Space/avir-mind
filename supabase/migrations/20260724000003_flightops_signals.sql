-- Phase 7 — deterministic Flight Ops cross-module signals.

create or replace function public.generate_operational_signals_for_org(p_org uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_count int := 0; r record;
begin
  delete from public.signals where org_id = p_org and generated_by_model = 'ops-engine' and is_active;

  -- weather_impact: upcoming flight into a station currently IFR/LIFR.
  for r in
    select distinct on (f.destination_station) f.id, f.flight_number, f.destination_station, f.aircraft_id, w.flight_category, w.raw_text
    from public.flights f
    join public.weather_observations w on w.station_code = f.destination_station and w.observation_type = 'metar' and w.flight_category in ('ifr', 'lifr')
    where f.org_id = p_org and f.scheduled_departure_utc between now() and now() + interval '24 hours'
      and w.observation_time_utc = (select max(observation_time_utc) from public.weather_observations w2 where w2.station_code = w.station_code and w2.observation_type = 'metar')
    order by f.destination_station, f.scheduled_departure_utc limit 3
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'weather_impact', case when r.flight_category = 'lifr' then 'critical' else 'high' end,
      left('Weather impact: ' || coalesce(r.flight_number, 'flight') || ' into ' || r.destination_station || ' (' || upper(r.flight_category) || ')', 200),
      'Destination ' || r.destination_station || ' is reporting ' || upper(r.flight_category) || ' conditions for an upcoming arrival — review approach minima, alternates, and fuel.',
      'Confirm the alternate is above minima and add contingency fuel; brief the crew on the approach.',
      'high', 'Latest METAR flight category below VFR for a destination with an upcoming arrival.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'weather', 'reference', r.destination_station, 'summary', upper(r.flight_category) || ' — ' || coalesce(r.raw_text, '')))),
      '[]'::jsonb, 'observation', 'ops-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- delay_pattern: a delay code recurring within the week.
  for r in
    select delay_code, delay_code_category, count(*) c, sum(delay_minutes) mins
    from public.delay_attribution where org_id = p_org and created_at_utc > now() - interval '7 days'
    group by delay_code, delay_code_category having count(*) >= 2 order by count(*) desc limit 2
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'delay_pattern', 'high',
      left('Delay pattern: code ' || r.delay_code || ' (' || r.delay_code_category || ') recurring', 200),
      r.c || ' flights this week were delayed under IATA code ' || r.delay_code || ' (' || r.delay_code_category || '), totalling ' || r.mins || ' minutes — a pattern worth investigating.',
      'Trace the root cause at the common station/handler and address it upstream.',
      'high', 'Same IATA delay code attributed to multiple flights within a rolling week.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'delay_code', 'reference', r.delay_code, 'summary', r.c || ' occurrences / ' || r.mins || ' min'))),
      '[]'::jsonb, 'observation', 'ops-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- fuel_variance: actual burn materially above plan.
  for r in
    select f.id, f.flight_number, f.aircraft_id, f.planned_fuel_kg, f.actual_fuel_kg
    from public.flights f where f.org_id = p_org and f.actual_fuel_kg is not null and f.planned_fuel_kg is not null
      and f.actual_fuel_kg > f.planned_fuel_kg * 1.05 order by (f.actual_fuel_kg - f.planned_fuel_kg) desc limit 1
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'fuel_variance', 'medium',
      left('Fuel burn above plan on ' || coalesce(r.flight_number, 'flight'), 200),
      'Actual fuel (' || r.actual_fuel_kg || 'kg) exceeded the plan (' || r.planned_fuel_kg || 'kg) by ' || round((r.actual_fuel_kg - r.planned_fuel_kg)::numeric) || 'kg — review planning assumptions and aircraft performance.',
      'Check for degraded performance, routing, or weight assumptions in the fuel plan.',
      'medium', 'Actual fuel more than 5% above planned on a completed flight.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'flight', 'reference', r.flight_number, 'summary', '+' || round((r.actual_fuel_kg - r.planned_fuel_kg)::numeric) || 'kg'))),
      '[]'::jsonb, 'observation', 'ops-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- crew_impact_from_delay: a delayed flight whose assigned crew is already duty-heavy.
  for r in
    select distinct on (f.id) f.flight_number, f.aircraft_id, cm.first_name, cm.last_name
    from public.flights f
    join public.assignments asg on asg.flight_schedule_id = f.id
    join public.crew_members cm on cm.id = asg.crew_member_id
    where f.org_id = p_org and f.delay_minutes > 30
      and (select count(*) from public.duty_periods dp where dp.crew_member_id = cm.id and dp.duty_type = 'flight' and dp.start_utc > now() - interval '7 days') >= 4
    limit 1
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'crew_impact_from_delay', 'high',
      left('Delay may push crew duty: ' || r.first_name || ' ' || r.last_name, 200),
      'A delay on ' || coalesce(r.flight_number, 'a flight') || ' compounds ' || r.first_name || ' ' || r.last_name || '''s already-heavy duty week — downstream FTL risk.',
      'Reassess the pairing and pre-position a reserve crew if the delay grows.',
      'high', 'Delayed flight with an assigned crew member near the weekly duty envelope.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'crew', 'reference', r.first_name || ' ' || r.last_name, 'summary', 'delay + dense duty'))),
      '[]'::jsonb, 'observation', 'ops-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
grant execute on function public.generate_operational_signals_for_org(uuid) to authenticated, service_role;

create or replace function public.generate_operational_signals()
returns int language plpgsql security invoker set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;
  if v_org is null then return 0; end if;
  return public.generate_operational_signals_for_org(v_org);
end $$;
grant execute on function public.generate_operational_signals() to authenticated;
