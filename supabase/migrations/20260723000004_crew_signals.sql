-- Phase 6 — deterministic crew signals + Command Center crew overlay.

create or replace function public.generate_crew_signals_for_org(p_org uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_count int := 0; r record; v_ac uuid;
begin
  delete from public.signals where org_id = p_org and generated_by_model = 'crew-engine' and is_active;

  -- qualification_expiring_soon
  for r in
    select cm.first_name, cm.last_name, q.qualification_name, q.qualification_code, cq.expiry_date,
      (cq.expiry_date - current_date) as dte, q.applicable_aircraft_types
    from public.crew_qualifications cq
    join public.crew_members cm on cm.id = cq.crew_member_id
    join public.qualifications q on q.id = cq.qualification_id
    where cq.org_id = p_org and cq.expiry_date between current_date and current_date + 30
    order by cq.expiry_date asc limit 3
  loop
    v_ac := (select a.id from public.aircraft a where a.org_id = p_org and (r.applicable_aircraft_types is null or a.aircraft_type = any(r.applicable_aircraft_types)) limit 1);
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence,
      confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, v_ac, 'qualification_expiring_soon', case when r.dte < 14 then 'high' else 'medium' end,
      left(r.qualification_name || ' expiring for ' || r.first_name || ' ' || r.last_name, 200),
      r.first_name || ' ' || r.last_name || '''s ' || r.qualification_name || ' (' || r.qualification_code || ') expires ' || r.expiry_date || ' — ' || r.dte || ' days.',
      'Schedule recurrent training before the expiry to avoid a currency gap on the roster.',
      'high', 'Deterministic currency check against crew_qualifications expiry dates.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'crew', 'reference', r.first_name || ' ' || r.last_name, 'summary', r.qualification_code || ' exp ' || r.expiry_date))),
      '[]'::jsonb, 'observation', 'crew-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- crew_currency_gap: assigned to an upcoming flight without a current required qual
  for r in
    select distinct on (asg.crew_member_id, fs.id) cm.first_name, cm.last_name, fs.aircraft_id, a.aircraft_type, q.qualification_name, fs.flight_number
    from public.assignments asg
    join public.flight_schedules fs on fs.id = asg.flight_schedule_id
    join public.aircraft a on a.id = fs.aircraft_id
    join public.crew_members cm on cm.id = asg.crew_member_id
    join public.qualifications q on q.org_id = p_org and (q.applicable_roles is null or cm.role = any(q.applicable_roles))
      and (q.applicable_aircraft_types is null or a.aircraft_type = any(q.applicable_aircraft_types))
    left join public.crew_qualifications cq on cq.crew_member_id = asg.crew_member_id and cq.qualification_id = q.id
      and cq.status = 'valid' and (cq.expiry_date is null or cq.expiry_date >= fs.scheduled_departure_utc::date)
    where asg.org_id = p_org and fs.scheduled_departure_utc > now() and cq.id is null
    limit 2
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence,
      confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'crew_currency_gap', 'high',
      left('Crew currency gap on ' || coalesce(r.flight_number, 'flight') || ' — ' || r.qualification_name, 200),
      r.first_name || ' ' || r.last_name || ' is assigned to an upcoming ' || r.aircraft_type || ' flight but is not current on ' || r.qualification_name || '.',
      'Reassign a current crew member or fast-track the recurrent before departure.',
      'high', 'Deterministic cross-module check: assignment + missing/expired required qualification.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'crew', 'reference', r.first_name || ' ' || r.last_name, 'summary', 'missing ' || r.qualification_name))),
      '[]'::jsonb, 'observation', 'crew-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- crew_fatigue_risk: >=4 flight duties in the last 7 days
  for r in
    select cm.first_name, cm.last_name, count(*) c
    from public.duty_periods dp join public.crew_members cm on cm.id = dp.crew_member_id
    where dp.org_id = p_org and dp.duty_type = 'flight' and dp.start_utc > now() - interval '7 days'
    group by cm.first_name, cm.last_name having count(*) >= 4 order by count(*) desc limit 2
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence,
      confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'crew_fatigue_risk', 'high',
      left('Elevated fatigue risk: ' || r.first_name || ' ' || r.last_name, 200),
      r.first_name || ' ' || r.last_name || ' has flown ' || r.c || ' duties in the last 7 days — cumulative fatigue risk is elevated.',
      'Build in a recovery day before the next early or night assignment.',
      'high', 'Deterministic fatigue heuristic: dense flight-duty pattern over a rolling week.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'crew', 'reference', r.first_name || ' ' || r.last_name, 'summary', r.c || ' duties / 7d'))),
      '[]'::jsonb, 'observation', 'crew-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- crew_rest_violation: consecutive duties with < 10h between them
  for r in
    select cm.first_name, cm.last_name, x.gap_h
    from (select crew_member_id, round((extract(epoch from (start_utc - lag(end_utc) over (partition by crew_member_id order by start_utc))) / 3600.0)::numeric, 1) as gap_h
          from public.duty_periods where org_id = p_org and status <> 'cancelled') x
    join public.crew_members cm on cm.id = x.crew_member_id
    where x.gap_h is not null and x.gap_h < 10 order by x.gap_h asc limit 2
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence,
      confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'crew_rest_violation', 'critical',
      left('Minimum rest concern: ' || r.first_name || ' ' || r.last_name, 200),
      r.first_name || ' ' || r.last_name || ' has only ' || r.gap_h || 'h between two duties — below the 10h minimum rest floor.',
      'Adjust the pairing to restore the minimum rest period before publishing.',
      'high', 'Deterministic rest check: gap between consecutive duties below the regulatory minimum.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'crew', 'reference', r.first_name || ' ' || r.last_name, 'summary', r.gap_h || 'h rest'))),
      '[]'::jsonb, 'observation', 'crew-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
grant execute on function public.generate_crew_signals_for_org(uuid) to authenticated, service_role;

create or replace function public.generate_crew_signals()
returns int language plpgsql security invoker set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;
  if v_org is null then return 0; end if;
  return public.generate_crew_signals_for_org(v_org);
end $$;
grant execute on function public.generate_crew_signals() to authenticated;

-- Crew overlay for the Command Center canvas (keyed by aircraft + station).
create or replace function public.get_crew_overlay(p_fleet_id uuid default null)
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'aircraft', (
      select coalesce(jsonb_agg(jsonb_build_object('aircraft_id', a.id, 'crew_status', st.status)), '[]'::jsonb)
      from public.aircraft a
      join lateral (
        select case
          when not exists (select 1 from public.flight_schedules fs where fs.aircraft_id = a.id and fs.scheduled_departure_utc between now() and now() + interval '24 hours') then 'none'
          when exists (
            select 1 from public.flight_schedules fs
            where fs.aircraft_id = a.id and fs.scheduled_departure_utc between now() and now() + interval '24 hours'
              and not exists (select 1 from public.assignments asg where asg.flight_schedule_id = fs.id and asg.assignment_status in ('assigned', 'confirmed'))
          ) then 'unassigned'
          when exists (
            select 1 from public.assignments asg
            join public.rule_check_results rc on rc.crew_member_id = asg.crew_member_id and rc.overall_result = 'violation' and rc.evaluated_at_utc > now() - interval '3 days'
            join public.flight_schedules fs on fs.id = asg.flight_schedule_id and fs.aircraft_id = a.id
            where fs.scheduled_departure_utc between now() and now() + interval '24 hours'
          ) then 'violation'
          else 'assigned' end as status
      ) st on true
      where p_fleet_id is null or exists (select 1 from public.fleet_aircraft fa where fa.aircraft_id = a.id and fa.fleet_id = p_fleet_id)),
    'stations', (
      select coalesce(jsonb_agg(jsonb_build_object('station_code', s.home_base_station, 'crew_available', s.c)), '[]'::jsonb)
      from (select home_base_station, count(*) c from public.crew_members where employment_status = 'active' and home_base_station is not null group by home_base_station) s)
  );
$$;
grant execute on function public.get_crew_overlay(uuid) to authenticated;
