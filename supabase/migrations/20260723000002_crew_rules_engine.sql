-- Phase 6 — FTL rules engine. Deterministic evaluation against the tenant's
-- configured rule_stack (regulator + CBA overlay + fatigue extensions).

create or replace function public.evaluate_duty_period(
  p_crew_member_id uuid,
  p_proposed_start_utc timestamptz,
  p_proposed_end_utc timestamptz,
  p_duty_type text,
  p_augmented boolean default false,
  p_night_operations boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  cm record;
  cfg record;
  rs jsonb;
  cba jsonb;
  v_org uuid;
  v_duty_hours numeric;
  v_prop_flight_min numeric;
  v_h24 numeric; v_h168 numeric; v_h672 numeric; v_h365 numeric;
  v_rest_before numeric;
  v_max24 numeric; v_max168 numeric; v_max672 numeric; v_max365 numeric;
  v_max_duty numeric; v_min_rest numeric;
  v_start_hour int;
  v_wocl boolean;
  v_fatigue int;
  v_evals jsonb := '[]'::jsonb;
  v_warn text[] := '{}';
  v_viol text[] := '{}';
  v_overall text := 'compliant';
  v_rcid uuid;

  procedure_eval jsonb;
begin
  select * into cm from public.crew_members where id = p_crew_member_id;
  if cm is null then raise exception 'crew member not found'; end if;
  v_org := cm.org_id;

  -- Applicable active rule config for this crew role.
  select * into cfg from public.rule_configurations
  where org_id = v_org and is_active
    and effective_from <= current_date and (effective_to is null or effective_to >= current_date)
    and (applicable_roles is null or cm.role = any(applicable_roles))
  order by (applicable_roles is not null) desc, created_at_utc asc
  limit 1;

  rs := coalesce(cfg.rule_stack, '{}'::jsonb);
  cba := coalesce(rs->'cba_overlays', '{}'::jsonb);

  v_max24 := coalesce((case when p_augmented then (rs#>>'{flight_time_limits,24h_max_hours_augmented}')::numeric
                            else (rs#>>'{flight_time_limits,24h_max_hours}')::numeric end), 8)
             + coalesce((cba->>'additional_max_flight_hours_pilot')::numeric, 0);
  v_max168 := coalesce((rs#>>'{flight_time_limits,168h_max_hours}')::numeric, 30);
  v_max672 := coalesce((rs#>>'{flight_time_limits,672h_max_hours}')::numeric, 100);
  v_max365 := coalesce((rs#>>'{flight_time_limits,365d_max_hours}')::numeric, 1000);
  v_max_duty := coalesce((case when p_night_operations then (rs#>>'{duty_time_limits,max_duty_period_night_hours}')::numeric
                               else (rs#>>'{duty_time_limits,max_duty_period_hours}')::numeric end), 14);
  v_min_rest := coalesce((rs#>>'{duty_time_limits,min_rest_between_duties_hours}')::numeric, 10)
                + coalesce((cba->>'additional_min_rest_hours')::numeric, 0);

  v_duty_hours := round(extract(epoch from (p_proposed_end_utc - p_proposed_start_utc)) / 3600.0, 2);
  v_prop_flight_min := case when p_duty_type in ('flight', 'deadhead', 'positioning')
    then round(extract(epoch from (p_proposed_end_utc - p_proposed_start_utc)) / 60.0 * 0.85) else 0 end;

  -- Cumulative flying (existing + proposed) in each rolling window ending at proposed end.
  select coalesce(sum(flight_time_minutes), 0) into v_h24 from public.duty_periods
    where crew_member_id = p_crew_member_id and status <> 'cancelled' and start_utc > p_proposed_end_utc - interval '24 hours';
  select coalesce(sum(flight_time_minutes), 0) into v_h168 from public.duty_periods
    where crew_member_id = p_crew_member_id and status <> 'cancelled' and start_utc > p_proposed_end_utc - interval '168 hours';
  select coalesce(sum(flight_time_minutes), 0) into v_h672 from public.duty_periods
    where crew_member_id = p_crew_member_id and status <> 'cancelled' and start_utc > p_proposed_end_utc - interval '672 hours';
  select coalesce(sum(flight_time_minutes), 0) into v_h365 from public.duty_periods
    where crew_member_id = p_crew_member_id and status <> 'cancelled' and start_utc > p_proposed_end_utc - interval '365 days';
  v_h24 := round((v_h24 + v_prop_flight_min) / 60.0, 2);
  v_h168 := round((v_h168 + v_prop_flight_min) / 60.0, 2);
  v_h672 := round((v_h672 + v_prop_flight_min) / 60.0, 2);
  v_h365 := round((v_h365 + v_prop_flight_min) / 60.0, 2);

  select round(extract(epoch from (p_proposed_start_utc - max(end_utc))) / 3600.0, 2) into v_rest_before
    from public.duty_periods where crew_member_id = p_crew_member_id and status <> 'cancelled' and end_utc <= p_proposed_start_utc;

  v_start_hour := extract(hour from p_proposed_start_utc);
  v_wocl := v_start_hour >= 2 and v_start_hour < 6;

  -- Build rule evaluations. margin = threshold - projected.
  declare
    rules record;
  begin
    for rules in
      select * from (values
        ('Flight time / 24h', v_max24, v_h24),
        ('Flight time / 168h', v_max168, v_h168),
        ('Flight time / 672h', v_max672, v_h672),
        ('Flight time / 365d', v_max365, v_h365),
        ('Duty period length', v_max_duty, v_duty_hours),
        ('Rest before duty', v_min_rest, coalesce(v_rest_before, 999))
      ) as r(name, threshold, projected)
    loop
      declare
        is_rest boolean := rules.name = 'Rest before duty';
        breach boolean := case when is_rest then rules.projected < rules.threshold else rules.projected > rules.threshold end;
        near boolean := case when is_rest then rules.projected < rules.threshold * 1.1
                             else rules.projected > rules.threshold * 0.9 end;
        res text;
      begin
        res := case when breach then 'violation' when near then 'warning' else 'compliant' end;
        if res = 'violation' then v_viol := v_viol || format('%s: %s vs limit %s', rules.name, rules.projected, rules.threshold);
        elsif res = 'warning' then v_warn := v_warn || format('%s approaching limit (%s / %s)', rules.name, rules.projected, rules.threshold);
        end if;
        v_evals := v_evals || jsonb_build_object('rule_name', rules.name, 'threshold', rules.threshold,
          'projected', rules.projected, 'margin', round((case when is_rest then rules.projected - rules.threshold else rules.threshold - rules.projected end)::numeric, 2), 'result', res);
      end;
    end loop;
  end;

  if array_length(v_viol, 1) > 0 then v_overall := 'violation';
  elsif array_length(v_warn, 1) > 0 then v_overall := 'warning'; end if;

  -- Fatigue score 0-100.
  v_fatigue := least(100, greatest(0,
    round(greatest(v_duty_hours - 10, 0) * 6)
    + (case when p_night_operations then 20 else 0 end)
    + (case when v_wocl then 15 else 0 end)
    + (case when coalesce(v_rest_before, 999) < v_min_rest + 2 then 15 else 0 end)
    + round(least(v_h168 / nullif(v_max168, 0), 1.2) * 20)));

  insert into public.rule_check_results (org_id, crew_member_id, rule_config_id, check_type, overall_result, rule_evaluations, warnings, violations, fatigue_score)
  values (v_org, p_crew_member_id, cfg.id, 'pre_publish', v_overall, v_evals, v_warn, v_viol, v_fatigue)
  returning id into v_rcid;

  return jsonb_build_object(
    'result_id', v_rcid, 'rule_config', coalesce(cfg.rule_config_name, 'default'), 'regulator', cfg.regulator,
    'overall_result', v_overall, 'rule_evaluations', v_evals, 'warnings', to_jsonb(v_warn), 'violations', to_jsonb(v_viol),
    'fatigue_score', v_fatigue,
    'cumulative_projections', jsonb_build_object(
      'hours_last_24h_after', v_h24, 'hours_last_168h_after', v_h168, 'hours_last_672h_after', v_h672,
      'hours_last_365d_after', v_h365, 'rest_before_hours', v_rest_before, 'duty_hours', v_duty_hours));
end $$;
grant execute on function public.evaluate_duty_period(uuid, timestamptz, timestamptz, text, boolean, boolean) to authenticated;


create or replace function public.check_crew_currency(p_crew_member_id uuid, p_flight_schedule_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare cm record; v_type text; v_date date; v jsonb; v_assignable boolean;
begin
  select * into cm from public.crew_members where id = p_crew_member_id;
  select a.aircraft_type, fs.scheduled_departure_utc::date into v_type, v_date
  from public.flight_schedules fs join public.aircraft a on a.id = fs.aircraft_id where fs.id = p_flight_schedule_id;

  select jsonb_agg(jsonb_build_object(
    'qualification_code', q.qualification_code, 'qualification_name', q.qualification_name, 'qualification_type', q.qualification_type,
    'held', cq.id is not null,
    'current', (cq.id is not null and cq.status = 'valid' and (cq.expiry_date is null or cq.expiry_date >= v_date)),
    'expiry_date', cq.expiry_date, 'status', cq.status)) into v
  from public.qualifications q
  left join public.crew_qualifications cq on cq.qualification_id = q.id and cq.crew_member_id = p_crew_member_id
  where q.org_id = cm.org_id and (q.applicable_roles is null or cm.role = any(q.applicable_roles))
    and (q.applicable_aircraft_types is null or v_type = any(q.applicable_aircraft_types));

  v := coalesce(v, '[]'::jsonb);
  v_assignable := not exists (
    select 1 from jsonb_array_elements(v) e where (e->>'current')::boolean is not true);

  return jsonb_build_object('aircraft_type', v_type, 'required', v,
    'missing', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v) e where (e->>'held')::boolean is not true),
    'expired', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(v) e where (e->>'held')::boolean and (e->>'current')::boolean is not true),
    'assignable', v_assignable);
end $$;
grant execute on function public.check_crew_currency(uuid, uuid) to authenticated;


create or replace function public.propose_assignment(p_crew_member_id uuid, p_flight_schedule_id uuid, p_role_on_flight text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare fs record; v_duty jsonb; v_cur jsonb; v_night boolean;
begin
  select * into fs from public.flight_schedules where id = p_flight_schedule_id;
  if fs is null then raise exception 'flight not found'; end if;
  v_night := extract(hour from fs.scheduled_departure_utc) >= 22 or extract(hour from fs.scheduled_departure_utc) < 6;
  v_duty := public.evaluate_duty_period(p_crew_member_id, fs.scheduled_departure_utc - interval '1 hour', fs.scheduled_arrival_utc + interval '30 minutes', 'flight', false, v_night);
  v_cur := public.check_crew_currency(p_crew_member_id, p_flight_schedule_id);
  return jsonb_build_object('duty_evaluation', v_duty, 'currency', v_cur,
    'assignable', (v_duty->>'overall_result') <> 'violation' and (v_cur->>'assignable')::boolean);
end $$;
grant execute on function public.propose_assignment(uuid, uuid, text) to authenticated;


create or replace function public.commit_assignment(p_crew_member_id uuid, p_flight_schedule_id uuid, p_role_on_flight text, p_override_warnings boolean default false)
returns uuid language plpgsql security invoker set search_path = public as $$
declare fs record; cm record; prop jsonb; v_overall text; v_cur_ok boolean; v_night boolean; v_admin boolean; v_id uuid; v_org uuid;
begin
  select * into fs from public.flight_schedules where id = p_flight_schedule_id;
  select * into cm from public.crew_members where id = p_crew_member_id;
  v_org := cm.org_id;
  prop := public.propose_assignment(p_crew_member_id, p_flight_schedule_id, p_role_on_flight);
  v_overall := prop#>>'{duty_evaluation,overall_result}';
  v_cur_ok := (prop#>>'{currency,assignable}')::boolean;
  v_admin := public.is_org_admin(v_org);

  if v_overall = 'compliant' and v_cur_ok then
    null; -- ok
  elsif p_override_warnings and v_admin then
    -- Formal exception: record the override.
    insert into public.rule_check_results (org_id, crew_member_id, rule_config_id, check_type, overall_result, warnings, violations, fatigue_score)
    values (v_org, p_crew_member_id, null, 'actual_recorded', v_overall,
      array['OVERRIDE by admin: ' || coalesce((prop#>>'{duty_evaluation,warnings}'), '')],
      array['OVERRIDE by admin: ' || coalesce((prop#>>'{duty_evaluation,violations}'), '')],
      (prop#>>'{duty_evaluation,fatigue_score}')::int);
  else
    raise exception 'assignment blocked: %', case when v_overall = 'violation' then 'FTL violation (requires admin override)'
      when not v_cur_ok then 'crew not current for this aircraft type'
      else 'warnings present (override required)' end;
  end if;

  v_night := extract(hour from fs.scheduled_departure_utc) >= 22 or extract(hour from fs.scheduled_departure_utc) < 6;
  insert into public.assignments (org_id, crew_member_id, flight_schedule_id, role_on_flight, assignment_status, assigned_by_user_id)
  values (v_org, p_crew_member_id, p_flight_schedule_id, p_role_on_flight, 'assigned', auth.uid())
  returning id into v_id;

  insert into public.duty_periods (org_id, crew_member_id, duty_type, start_utc, end_utc, station_from, station_to,
    night_operations, flight_time_minutes, linked_flight_schedule_ids, status)
  values (v_org, p_crew_member_id, 'flight', fs.scheduled_departure_utc - interval '1 hour', fs.scheduled_arrival_utc + interval '30 minutes',
    fs.origin_station, fs.destination_station, v_night,
    round(extract(epoch from (fs.scheduled_arrival_utc - fs.scheduled_departure_utc)) / 60.0 * 0.85), array[p_flight_schedule_id], 'published');

  return v_id;
end $$;
grant execute on function public.commit_assignment(uuid, uuid, text, boolean) to authenticated;
