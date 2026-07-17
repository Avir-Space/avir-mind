-- Phase 6 — crew read models.

create or replace function public.get_crew_stats()
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'active_total', (select count(*) from public.crew_members where employment_status = 'active'),
    'by_role', (select coalesce(jsonb_object_agg(role, c), '{}'::jsonb) from (select role, count(*) c from public.crew_members where employment_status = 'active' group by role) r),
    'currency_issues', (select count(distinct crew_member_id) from public.crew_qualifications where status <> 'valid' or (expiry_date is not null and expiry_date < current_date)),
    'expiring_30d', (select count(*) from public.crew_qualifications where expiry_date is not null and expiry_date between current_date and current_date + 30),
    'fatigue_risk', (select count(distinct crew_member_id) from public.rule_check_results where fatigue_score >= 60 and evaluated_at_utc > now() - interval '7 days'),
    'rest_violations_week', (select count(*) from public.rule_check_results where overall_result = 'violation' and evaluated_at_utc > now() - interval '7 days')
  );
$$;
grant execute on function public.get_crew_stats() to authenticated;

create or replace function public.get_crew_directory()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_name, x.first_name), '[]'::jsonb)
  from (
    select cm.id, cm.employee_id, cm.first_name, cm.last_name, cm.role, cm.home_base_station,
      cm.primary_jurisdiction, cm.seniority_number, cm.employment_status,
      (select count(*) from public.crew_qualifications cq where cq.crew_member_id = cm.id) as qual_count,
      (select count(*) from public.crew_qualifications cq where cq.crew_member_id = cm.id and (cq.status <> 'valid' or (cq.expiry_date is not null and cq.expiry_date < current_date))) as currency_issues,
      (select count(*) from public.crew_qualifications cq where cq.crew_member_id = cm.id and cq.expiry_date between current_date and current_date + 30) as expiring_soon,
      (select min(dp.start_utc) from public.duty_periods dp where dp.crew_member_id = cm.id and dp.start_utc > now() and dp.status <> 'cancelled') as next_duty
    from public.crew_members cm
  ) x;
$$;
grant execute on function public.get_crew_directory() to authenticated;

create or replace function public.get_crew_detail(p_crew_member_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'member', (select to_jsonb(cm) from public.crew_members cm where cm.id = p_crew_member_id),
    'qualifications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', cq.id, 'qualification_code', q.qualification_code, 'qualification_name', q.qualification_name,
        'qualification_type', q.qualification_type, 'applicable_aircraft_types', q.applicable_aircraft_types,
        'issued_date', cq.issued_date, 'expiry_date', cq.expiry_date, 'status', cq.status,
        'last_currency_event_date', cq.last_currency_event_date, 'currency_details', cq.currency_details,
        'days_to_expiry', case when cq.expiry_date is null then null else (cq.expiry_date - current_date) end)
        order by cq.expiry_date asc nulls last), '[]'::jsonb)
      from public.crew_qualifications cq join public.qualifications q on q.id = cq.qualification_id where cq.crew_member_id = p_crew_member_id),
    'duty_history', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.start_utc desc), '[]'::jsonb)
      from (select id, duty_type, start_utc, end_utc, station_from, station_to, flight_time_minutes, night_operations, status
            from public.duty_periods where crew_member_id = p_crew_member_id and start_utc <= now() order by start_utc desc limit 40) d),
    'upcoming', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.start_utc asc), '[]'::jsonb)
      from (select id, duty_type, start_utc, end_utc, station_from, station_to, status
            from public.duty_periods where crew_member_id = p_crew_member_id and start_utc > now() and status <> 'cancelled' order by start_utc asc limit 20) d),
    'compliance', (
      select coalesce(jsonb_agg(jsonb_build_object('overall_result', r.overall_result, 'warnings', r.warnings, 'violations', r.violations,
        'fatigue_score', r.fatigue_score, 'evaluated_at_utc', r.evaluated_at_utc) order by r.evaluated_at_utc desc), '[]'::jsonb)
      from (select * from public.rule_check_results where crew_member_id = p_crew_member_id order by evaluated_at_utc desc limit 20) r)
  ) into v;
  return v;
end $$;
grant execute on function public.get_crew_detail(uuid) to authenticated;

create or replace function public.get_crew_roster(p_start_date date, p_end_date date, p_role text[] default null, p_home_base text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'start_date', p_start_date, 'end_date', p_end_date,
    'crew', (select coalesce(jsonb_agg(jsonb_build_object('id', cm.id, 'first_name', cm.first_name, 'last_name', cm.last_name,
        'role', cm.role, 'home_base_station', cm.home_base_station, 'employee_id', cm.employee_id) order by cm.role, cm.last_name), '[]'::jsonb)
      from public.crew_members cm
      where cm.employment_status = 'active'
        and (p_role is null or cm.role = any(p_role)) and (p_home_base is null or cm.home_base_station = p_home_base)),
    'duties', (select coalesce(jsonb_agg(jsonb_build_object('crew_member_id', d.crew_member_id, 'duty_type', d.duty_type,
        'start_utc', d.start_utc, 'end_utc', d.end_utc, 'day', d.start_utc::date, 'station_from', d.station_from, 'station_to', d.station_to, 'status', d.status)), '[]'::jsonb)
      from public.duty_periods d join public.crew_members cm on cm.id = d.crew_member_id
      where d.status <> 'cancelled' and d.start_utc::date between p_start_date and p_end_date
        and (p_role is null or cm.role = any(p_role)) and (p_home_base is null or cm.home_base_station = p_home_base))
  ) into v;
  return v;
end $$;
grant execute on function public.get_crew_roster(date, date, text[], text) to authenticated;

create or replace function public.get_expiring_qualifications(p_days int default 30)
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.expiry_date asc), '[]'::jsonb)
  from (
    select cq.id, cm.id as crew_member_id, cm.first_name, cm.last_name, cm.role, q.qualification_code, q.qualification_name,
      cq.expiry_date, cq.status, (cq.expiry_date - current_date) as days_to_expiry
    from public.crew_qualifications cq
    join public.crew_members cm on cm.id = cq.crew_member_id
    join public.qualifications q on q.id = cq.qualification_id
    where cq.expiry_date is not null and cq.expiry_date <= current_date + p_days
  ) x;
$$;
grant execute on function public.get_expiring_qualifications(int) to authenticated;

create or replace function public.get_fatigue_forecast(p_crew_member_id uuid, p_forecast_days int default 14)
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'crew_member_id', p_crew_member_id,
    'forecast', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day, 'fatigue_score', d.score, 'elevated', d.score >= 60) order by d.day), '[]'::jsonb)
      from (
        select gs::date as day,
          least(100, greatest(0,
            round((select coalesce(sum(flight_time_minutes), 0) from public.duty_periods dp
                   where dp.crew_member_id = p_crew_member_id and dp.status <> 'cancelled'
                     and dp.start_utc > gs - interval '168 hours' and dp.start_utc <= gs) / 60.0 / 30.0 * 45)
            + (case when exists (select 1 from public.duty_periods dp where dp.crew_member_id = p_crew_member_id and dp.night_operations and dp.start_utc::date = gs::date) then 20 else 0 end)
            + (case when exists (select 1 from public.duty_periods dp where dp.crew_member_id = p_crew_member_id and dp.start_utc::date = gs::date and dp.status <> 'cancelled') then 12 else 0 end)
          )) as score
        from generate_series(current_date, current_date + p_forecast_days, interval '1 day') gs
      ) d)
  );
$$;
grant execute on function public.get_fatigue_forecast(uuid, int) to authenticated;

create or replace function public.get_rule_configurations()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(rc) order by rc.created_at_utc), '[]'::jsonb) from public.rule_configurations rc;
$$;
grant execute on function public.get_rule_configurations() to authenticated;

-- Admin-gated rule config update.
create or replace function public.update_rule_configuration(p_id uuid, p_rule_stack jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.rule_configurations where id = p_id;
  if not public.is_org_admin(v_org) then raise exception 'only tenant admins may edit rule configurations'; end if;
  update public.rule_configurations set rule_stack = p_rule_stack, updated_at_utc = now() where id = p_id;
end $$;
grant execute on function public.update_rule_configuration(uuid, jsonb) to authenticated;
