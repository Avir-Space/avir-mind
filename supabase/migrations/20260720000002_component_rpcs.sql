-- Phase 3 — component RPCs: health computation, event recording (with the
-- calibration feedback loop), creation, and read models.

-- ── compute_component_health ────────────────────────────────────────────────
-- Health 0-100 from life used, recent findings, overhaul proximity, and
-- inspection staleness. Caches onto components + appends to health history.
create or replace function public.compute_component_health(p_component_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  c record;
  v_life_used numeric := 0;
  v_overhaul_used numeric := 0;
  v_worst text;
  v_finding_pen numeric := 0;
  v_events_90d int := 0;
  v_days_inspect numeric;
  v_score int;
  v_contrib jsonb;
begin
  select * into c from public.components where id = p_component_id;
  if c is null then return null; end if;

  -- fraction of life consumed (max across cycles/hours limits present)
  v_life_used := greatest(
    case when c.limit_cycles is not null and c.limit_cycles > 0
         then coalesce(c.current_cycles, 0)::numeric / c.limit_cycles else 0 end,
    case when c.limit_flight_hours is not null and c.limit_flight_hours > 0
         then coalesce(c.current_flight_hours, 0) / c.limit_flight_hours else 0 end
  );
  v_life_used := least(greatest(v_life_used, 0), 1);

  v_overhaul_used := greatest(
    case when c.overhaul_interval_cycles is not null and c.overhaul_interval_cycles > 0
         then coalesce(c.cycles_since_overhaul, 0)::numeric / c.overhaul_interval_cycles else 0 end,
    case when c.overhaul_interval_hours is not null and c.overhaul_interval_hours > 0
         then coalesce(c.flight_hours_since_overhaul, 0) / c.overhaul_interval_hours else 0 end
  );
  v_overhaul_used := least(greatest(v_overhaul_used, 0), 1.2);

  -- worst finding in the last 180 days
  select finding_severity into v_worst
  from public.component_events
  where component_id = p_component_id and finding_severity is not null
    and event_date_utc > (now() - interval '180 days')::date
  order by case finding_severity
    when 'critical' then 5 when 'major' then 4 when 'moderate' then 3 when 'minor' then 2 else 1 end desc
  limit 1;
  v_finding_pen := case v_worst
    when 'critical' then 38 when 'major' then 24 when 'moderate' then 12 when 'minor' then 4 else 0 end;

  select count(*) into v_events_90d from public.component_events
  where component_id = p_component_id and event_date_utc > (now() - interval '90 days')::date;

  select extract(epoch from (now() - (max(event_date_utc))::timestamptz)) / 86400 into v_days_inspect
  from public.component_events
  where component_id = p_component_id
    and event_type in ('borescope', 'functional_test', 'oil_analysis', 'vibration_survey');

  v_score := round(
    100
    - v_life_used * 42
    - v_finding_pen
    - greatest(v_overhaul_used - 0.75, 0) * 40       -- bites in the last quarter of the interval
    - case when v_days_inspect is null or v_days_inspect > 365 then 8 else 0 end
  );
  v_score := least(greatest(v_score, 0), 100);

  v_contrib := jsonb_build_object(
    'life_used_pct', round(v_life_used * 100, 1),
    'cycles_remaining_pct', round((1 - v_life_used) * 100, 1),
    'overhaul_used_pct', round(v_overhaul_used * 100, 1),
    'worst_finding_180d', coalesce(v_worst, 'nil'),
    'finding_penalty', v_finding_pen,
    'events_last_90d', v_events_90d,
    'days_since_inspection', case when v_days_inspect is null then null else round(v_days_inspect) end
  );

  update public.components
    set health_score = v_score, health_score_updated_at_utc = now(), updated_at_utc = now()
    where id = p_component_id;

  insert into public.component_health_history (org_id, component_id, health_score, score_contributors)
  values (c.org_id, p_component_id, v_score, v_contrib);

  return v_score;
end;
$$;

grant execute on function public.compute_component_health(uuid) to authenticated;


-- ── create_component ────────────────────────────────────────────────────────
create or replace function public.create_component(
  p_aircraft_id uuid,
  p_component_type text,
  p_part_number text,
  p_serial_number text,
  p_position_code text default null,
  p_manufacturer text default null,
  p_status text default 'on_wing',
  p_attrs jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if p_aircraft_id is not null then
    select org_id into v_org from public.aircraft where id = p_aircraft_id;
  end if;
  if v_org is null then
    select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;
  end if;
  if v_org is null then raise exception 'create_component: org not resolvable'; end if;

  insert into public.components (
    org_id, aircraft_id, component_type, part_number, serial_number, position_code, manufacturer, status,
    installed_at_utc, current_cycles, current_flight_hours, cycles_since_new, flight_hours_since_new,
    cycles_since_overhaul, flight_hours_since_overhaul, limit_cycles, limit_flight_hours,
    overhaul_interval_cycles, overhaul_interval_hours, next_scheduled_event_type,
    next_scheduled_event_due_cycles, next_scheduled_event_due_hours, next_scheduled_event_due_date)
  values (
    v_org, p_aircraft_id, p_component_type, p_part_number, p_serial_number, p_position_code, p_manufacturer,
    coalesce(p_status, 'on_wing'),
    (p_attrs->>'installed_at_utc')::timestamptz,
    coalesce((p_attrs->>'current_cycles')::int, 0),
    coalesce((p_attrs->>'current_flight_hours')::numeric, 0),
    coalesce((p_attrs->>'cycles_since_new')::int, 0),
    coalesce((p_attrs->>'flight_hours_since_new')::numeric, 0),
    coalesce((p_attrs->>'cycles_since_overhaul')::int, 0),
    coalesce((p_attrs->>'flight_hours_since_overhaul')::numeric, 0),
    (p_attrs->>'limit_cycles')::int,
    (p_attrs->>'limit_flight_hours')::numeric,
    (p_attrs->>'overhaul_interval_cycles')::int,
    (p_attrs->>'overhaul_interval_hours')::numeric,
    p_attrs->>'next_scheduled_event_type',
    (p_attrs->>'next_scheduled_event_due_cycles')::int,
    (p_attrs->>'next_scheduled_event_due_hours')::numeric,
    (p_attrs->>'next_scheduled_event_due_date')::date)
  returning id into v_id;

  perform public.compute_component_health(v_id);
  return v_id;
end;
$$;

grant execute on function public.create_component(uuid, text, text, text, text, text, text, jsonb) to authenticated;


-- ── record_component_event ──────────────────────────────────────────────────
-- Inserts the event, rolls the parent counters, recomputes health, and runs the
-- calibration match against open predictions.
create or replace function public.record_component_event(
  p_component_id uuid,
  p_event_type text,
  p_event_date date,
  p_attrs jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  c record;
  v_event_id uuid;
  v_cycles int := (p_attrs->>'cycles_at_event')::int;
  v_hours numeric := (p_attrs->>'flight_hours_at_event')::numeric;
  pred record;
  v_result text;
  v_lo_date date;
  v_hi_date date;
begin
  select * into c from public.components where id = p_component_id;
  if c is null then raise exception 'record_component_event: component not found'; end if;

  insert into public.component_events (
    org_id, component_id, aircraft_id, event_type, event_date_utc, cycles_at_event, flight_hours_at_event,
    finding_severity, finding_description, station, facility, performed_by, documentation_reference,
    cost_usd, linked_task_id, linked_signal_id, source_system, source_reference_id, event_payload)
  values (
    c.org_id, p_component_id, c.aircraft_id, p_event_type, p_event_date, v_cycles, v_hours,
    p_attrs->>'finding_severity', p_attrs->>'finding_description', p_attrs->>'station', p_attrs->>'facility',
    p_attrs->>'performed_by', p_attrs->>'documentation_reference', (p_attrs->>'cost_usd')::numeric,
    (p_attrs->>'linked_task_id')::uuid, (p_attrs->>'linked_signal_id')::uuid,
    coalesce(p_attrs->>'source_system', 'avir'), p_attrs->>'source_reference_id', p_attrs->'event_payload')
  returning id into v_event_id;

  -- Roll parent counters.
  update public.components set
    current_cycles = greatest(coalesce(current_cycles, 0), coalesce(v_cycles, current_cycles, 0)),
    current_flight_hours = greatest(coalesce(current_flight_hours, 0), coalesce(v_hours, current_flight_hours, 0)),
    cycles_since_overhaul = case when p_event_type = 'overhaul' then 0 else cycles_since_overhaul end,
    flight_hours_since_overhaul = case when p_event_type = 'overhaul' then 0 else flight_hours_since_overhaul end,
    status = case when p_event_type = 'removed' then 'off_wing_inventory'
                  when p_event_type = 'installed' then 'on_wing' else status end,
    removed_at_utc = case when p_event_type = 'removed' then p_event_date::timestamptz else removed_at_utc end,
    installed_at_utc = case when p_event_type = 'installed' then p_event_date::timestamptz else installed_at_utc end,
    aircraft_id = case when p_event_type = 'removed' then null else aircraft_id end,
    updated_at_utc = now()
  where id = p_component_id;

  perform public.compute_component_health(p_component_id);

  -- Calibration: match still-open predictions on this component.
  for pred in
    select id, prediction_horizon, predicted_event_type
    from public.signals
    where component_id = p_component_id and signal_class = 'prediction' and accuracy_result = 'pending'
  loop
    -- event-type relevance
    if not (
      coalesce(pred.predicted_event_type, '') ilike '%' || p_event_type || '%'
      or (p_event_type = 'removed' and pred.predicted_event_type ilike any (array['%removal%', '%replacement%']))
      or (p_event_type = 'overhaul' and pred.predicted_event_type ilike '%overhaul%')
      or (p_event_type = 'borescope' and pred.predicted_event_type ilike '%borescope%')
      or (p_event_type = 'repair' and pred.predicted_event_type ilike '%repair%')
    ) then
      continue;
    end if;

    v_lo_date := (pred.prediction_horizon->>'lower_bound_date')::date;
    v_hi_date := (pred.prediction_horizon->>'upper_bound_date')::date;

    if v_lo_date is not null and v_hi_date is not null then
      if p_event_date between v_lo_date and v_hi_date then
        v_result := 'correct';
      elsif p_event_date between (v_lo_date - interval '30 days')::date and (v_hi_date + interval '30 days')::date then
        v_result := 'partial';
      else
        v_result := 'incorrect';
      end if;
    else
      -- no date horizon → treat a matching event type as a partial hit
      v_result := 'partial';
    end if;

    update public.signals
      set accuracy_result = v_result, accuracy_measured_at_utc = now(),
          accuracy_notes = format('Matched %s on %s', p_event_type, p_event_date),
          updated_at_utc = now()
      where id = pred.id;
  end loop;

  return v_event_id;
end;
$$;

grant execute on function public.record_component_event(uuid, text, date, jsonb) to authenticated;


-- ── get_components_for_aircraft ─────────────────────────────────────────────
create or replace function public.get_components_for_aircraft(p_aircraft_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.component_type, x.position_code), '[]'::jsonb) into v
  from (
    select c.id, c.component_type, c.part_number, c.serial_number, c.position_code, c.status,
      c.current_cycles, c.current_flight_hours, c.limit_cycles, c.limit_flight_hours,
      c.health_score, c.next_scheduled_event_type, c.next_scheduled_event_due_date,
      (select count(*) from public.signals s
       where s.component_id = c.id and s.signal_class = 'prediction' and s.is_active) as active_predictions
    from public.components c
    where c.aircraft_id = p_aircraft_id
  ) x;
  return v;
end;
$$;

grant execute on function public.get_components_for_aircraft(uuid) to authenticated;


-- ── get_component_detail ────────────────────────────────────────────────────
create or replace function public.get_component_detail(p_component_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'component', (select to_jsonb(c) from public.components c where c.id = p_component_id),
    'aircraft', (select jsonb_build_object('id', a.id, 'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type)
                 from public.components c join public.aircraft a on a.id = c.aircraft_id where c.id = p_component_id),
    'events', (
      select coalesce(jsonb_agg(to_jsonb(e) order by e.event_date_utc desc, e.created_at_utc desc), '[]'::jsonb)
      from public.component_events e where e.component_id = p_component_id),
    'health_history', (
      select coalesce(jsonb_agg(jsonb_build_object('health_score', h.health_score, 'score_contributors', h.score_contributors, 'computed_at_utc', h.computed_at_utc) order by h.computed_at_utc asc), '[]'::jsonb)
      from public.component_health_history h where h.component_id = p_component_id),
    'predictions', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.generated_at_utc desc), '[]'::jsonb)
      from public.signals s where s.component_id = p_component_id and s.signal_class = 'prediction')
  ) into v;
  return v;
end;
$$;

grant execute on function public.get_component_detail(uuid) to authenticated;
