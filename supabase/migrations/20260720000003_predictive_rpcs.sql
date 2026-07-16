-- Phase 3 — predictive-signal generation RPCs (prepare run; client invokes the
-- generate-predictive-signals Edge Function), plus predictive surfacing on the
-- Command Center snapshot.

-- Distinguish predictive runs from observation runs for cost accounting.
alter table public.signal_generation_runs
  add column if not exists run_kind text not null default 'observation'
    check (run_kind in ('observation', 'prediction')),
  add column if not exists component_id uuid references public.components (id) on delete set null;

-- Context hash over an aircraft's components (cheap md5, no extension needed).
create or replace function public.predictive_context_hash(p_aircraft_id uuid)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select md5(coalesce(string_agg(
    c.id::text || ':' || coalesce(c.current_cycles, 0)::text || ':' ||
    coalesce(c.current_flight_hours, 0)::text || ':' || coalesce(c.health_score, -1)::text || ':' ||
    (select count(*) from public.component_events e where e.component_id = c.id)::text,
    '|' order by c.id::text), ''))
  from public.components c
  where c.aircraft_id = p_aircraft_id;
$$;

grant execute on function public.predictive_context_hash(uuid) to authenticated;

-- Shared guard body → returns a prepared run for predictive generation.
create or replace function public.generate_predictive_signals_for_aircraft(
  p_aircraft_id uuid, p_run_type text default 'manual', p_force_regenerate boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid; v_hash text; v_existing uuid; v_run_id uuid;
  v_failures int; v_concurrent int; v_spend numeric;
begin
  select org_id into v_org from public.aircraft where id = p_aircraft_id;
  if v_org is null then raise exception 'aircraft not found or not visible'; end if;

  v_hash := public.predictive_context_hash(p_aircraft_id);

  if not coalesce(p_force_regenerate, false) then
    select id into v_existing from public.signal_generation_runs
    where org_id = v_org and aircraft_id = p_aircraft_id and run_kind = 'prediction'
      and generation_context_hash = v_hash and status = 'completed'
      and completed_at_utc > now() - interval '6 hours'
    order by completed_at_utc desc limit 1;
    if v_existing is not null then
      return jsonb_build_object('run_id', v_existing, 'cached', true, 'status', 'completed');
    end if;
  end if;

  select count(*) into v_failures from public.signal_generation_runs
  where org_id = v_org and run_kind = 'prediction' and status = 'failed' and started_at_utc > now() - interval '5 minutes';
  if v_failures >= 3 then raise exception 'predictive generation paused: circuit breaker'; end if;

  select count(*) into v_concurrent from public.signal_generation_runs
  where org_id = v_org and status = 'started' and started_at_utc > now() - interval '5 minutes';
  if v_concurrent >= 10 then raise exception 'predictive generation paused: too many concurrent'; end if;

  select coalesce(sum(total_cost_usd), 0) into v_spend from public.signal_generation_runs
  where org_id = v_org and started_at_utc > now() - interval '24 hours';
  if v_spend > 50 and not coalesce(p_force_regenerate, false) then
    raise exception 'predictive generation paused: soft cap';
  end if;

  insert into public.signal_generation_runs
    (org_id, aircraft_id, run_type, trigger_reference, generation_context_hash, status, run_kind)
  values (v_org, p_aircraft_id, coalesce(p_run_type, 'manual'), 'predictive', v_hash, 'started', 'prediction')
  returning id into v_run_id;

  return jsonb_build_object('run_id', v_run_id, 'cached', false, 'status', 'started');
end;
$$;

grant execute on function public.generate_predictive_signals_for_aircraft(uuid, text, boolean) to authenticated;

-- Single-component variant (UI "Refresh Predictions" on the component detail).
create or replace function public.generate_predictive_signals_for_component(
  p_component_id uuid, p_run_type text default 'manual', p_force_regenerate boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid; v_ac uuid; v_hash text; v_existing uuid; v_run_id uuid;
  v_failures int; v_concurrent int; v_spend numeric;
begin
  select org_id, aircraft_id into v_org, v_ac from public.components where id = p_component_id;
  if v_org is null then raise exception 'component not found or not visible'; end if;

  v_hash := md5(p_component_id::text || ':' ||
    coalesce((select count(*)::text from public.component_events where component_id = p_component_id), '0') || ':' ||
    coalesce((select health_score::text from public.components where id = p_component_id), '-1'));

  if not coalesce(p_force_regenerate, false) then
    select id into v_existing from public.signal_generation_runs
    where org_id = v_org and component_id = p_component_id and run_kind = 'prediction'
      and generation_context_hash = v_hash and status = 'completed'
      and completed_at_utc > now() - interval '6 hours'
    order by completed_at_utc desc limit 1;
    if v_existing is not null then
      return jsonb_build_object('run_id', v_existing, 'cached', true, 'status', 'completed');
    end if;
  end if;

  select count(*) into v_failures from public.signal_generation_runs
  where org_id = v_org and run_kind = 'prediction' and status = 'failed' and started_at_utc > now() - interval '5 minutes';
  if v_failures >= 3 then raise exception 'predictive generation paused: circuit breaker'; end if;

  select count(*) into v_concurrent from public.signal_generation_runs
  where org_id = v_org and status = 'started' and started_at_utc > now() - interval '5 minutes';
  if v_concurrent >= 10 then raise exception 'predictive generation paused: too many concurrent'; end if;

  insert into public.signal_generation_runs
    (org_id, aircraft_id, component_id, run_type, trigger_reference, generation_context_hash, status, run_kind)
  values (v_org, v_ac, p_component_id, coalesce(p_run_type, 'manual'), 'predictive_component', v_hash, 'started', 'prediction')
  returning id into v_run_id;

  return jsonb_build_object('run_id', v_run_id, 'cached', false, 'status', 'started');
end;
$$;

grant execute on function public.generate_predictive_signals_for_component(uuid, text, boolean) to authenticated;

-- Fleet-wide predictive aggregation (canvas + summaries).
create or replace function public.get_predictive_signals_summary(p_fleet_id uuid default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at_utc desc), '[]'::jsonb) into v
  from (
    select s.id as signal_id, s.aircraft_id, a.tail_number, s.component_id, s.severity, s.title,
      s.predicted_event_type, s.confidence, s.prediction_horizon, s.accuracy_result, s.generated_at_utc,
      c.component_type, c.serial_number
    from public.signals s
    join public.aircraft a on a.id = s.aircraft_id
    left join public.components c on c.id = s.component_id
    where s.is_active and s.signal_class = 'prediction'
      and (p_fleet_id is null or exists (
        select 1 from public.fleet_aircraft fa where fa.aircraft_id = s.aircraft_id and fa.fleet_id = p_fleet_id))
  ) x;
  return v;
end;
$$;

grant execute on function public.get_predictive_signals_summary(uuid) to authenticated;


-- Re-create the Command Center snapshot with predictive range bars + station
-- predictive counts layered onto the Phase 2.5 payload.
create or replace function public.get_command_center_snapshot(
  p_fleet_id uuid default null,
  p_time_window_hours int default 12
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_hours int := greatest(coalesce(p_time_window_hours, 12), 1);
  v_window_end timestamptz := now() + (v_hours || ' hours')::interval;
begin
  with geo(code, lat, lng) as (
    values
      ('JFK', 40.6413, -73.7781), ('LAX', 33.9416, -118.4085), ('ORD', 41.9742, -87.9073),
      ('DFW', 32.8998, -97.0403), ('DEL', 28.5562, 77.1000),   ('BOM', 19.0896, 72.8656),
      ('FRA', 50.0379, 8.5622),   ('ATL', 33.6407, -84.4277),  ('DEN', 39.8561, -104.6737),
      ('SEA', 47.4502, -122.3088),('LHR', 51.4700, -0.4543),   ('MIA', 25.7959, -80.2870),
      ('BLR', 13.1986, 77.7066),  ('DXB', 25.2532, 55.3657),   ('DOH', 25.2731, 51.6081)
  ),
  scoped_aircraft as (
    select a.id, a.tail_number, a.aircraft_type, a.base_station,
           st.state, st.current_station, st.next_event_type
    from public.aircraft a
    left join public.aircraft_state st on st.aircraft_id = a.id
    where p_fleet_id is null
       or exists (select 1 from public.fleet_aircraft fa where fa.aircraft_id = a.id and fa.fleet_id = p_fleet_id)
  ),
  active_leg as (
    select distinct on (fs.aircraft_id)
      fs.aircraft_id, fs.origin_station, fs.destination_station,
      fs.scheduled_departure_utc as dep, fs.scheduled_arrival_utc as arr
    from public.flight_schedules fs
    where fs.status in ('departed', 'en_route')
       or now() between fs.scheduled_departure_utc and fs.scheduled_arrival_utc
    order by fs.aircraft_id, fs.scheduled_departure_utc desc
  ),
  sig_counts as (
    select s.aircraft_id, count(*) as active_count,
      (array_agg(s.severity order by case s.severity
        when 'critical' then 5 when 'high' then 4 when 'medium' then 3
        when 'low' then 2 when 'info' then 1 else 0 end desc))[1] as max_severity
    from public.signals s
    where s.is_active and s.aircraft_id is not null and s.signal_class <> 'prediction'
    group by s.aircraft_id
  ),
  pred_counts as (
    select s.aircraft_id, count(*) as pred_count
    from public.signals s
    where s.is_active and s.aircraft_id is not null and s.signal_class = 'prediction'
    group by s.aircraft_id
  ),
  task_block as (
    select t.aircraft_id,
      count(*) filter (where t.aog) as aog_count,
      count(*) filter (where t.dispatch_blocking) as dispatch_blocking_count,
      (array_agg(t.title order by (case when t.aog then 3 when t.dispatch_blocking then 2 else 1 end) desc,
        case t.risk_band when 'high' then 3 when 'medium' then 2 else 1 end desc, t.created_at_utc asc))[1] as primary_task_title
    from public.tasks t
    where t.status <> 'done'
    group by t.aircraft_id
  ),
  positions as (
    select
      sa.id as aircraft_id, sa.tail_number, sa.aircraft_type,
      case when coalesce(tb.aog_count, 0) > 0 or sa.next_event_type = 'AOG Recovery' then 'aog'
           else coalesce(nullif(sa.state, 'unknown'), 'on_ground') end as state,
      coalesce(sa.current_station, sa.base_station) as station,
      case when al.aircraft_id is not null and og.lat is not null and dg.lat is not null
        then round((og.lat + (dg.lat - og.lat) * frac.f)::numeric, 4) else g.lat end as lat,
      case when al.aircraft_id is not null and og.lng is not null and dg.lng is not null
        then round((og.lng + (dg.lng - og.lng) * frac.f)::numeric, 4) else g.lng end as lng,
      coalesce(sc.active_count, 0) as active_signals_count,
      sc.max_severity, tb.primary_task_title
    from scoped_aircraft sa
    left join active_leg al on al.aircraft_id = sa.id
    left join geo g  on g.code  = coalesce(sa.current_station, sa.base_station)
    left join geo og on og.code = al.origin_station
    left join geo dg on dg.code = al.destination_station
    left join lateral (
      select least(greatest(extract(epoch from (now() - al.dep)) / nullif(extract(epoch from (al.arr - al.dep)), 0), 0), 1) as f
    ) frac on true
    left join sig_counts sc on sc.aircraft_id = sa.id
    left join task_block tb on tb.aircraft_id = sa.id
  ),
  ac_station as (
    select sa.id as aircraft_id,
      case when sa.state = 'in_air' then coalesce(al.destination_station, sa.base_station)
           else coalesce(sa.current_station, sa.base_station) end as station_code,
      (sa.state = 'in_air') as inbound
    from scoped_aircraft sa
    left join active_leg al on al.aircraft_id = sa.id
  ),
  station_rollups as (
    select acs.station_code,
      count(*) filter (where not acs.inbound) as aircraft_on_ground,
      count(*) filter (where acs.inbound) as aircraft_inbound,
      coalesce(sum(coalesce(sc.active_count, 0)), 0) as active_signals_count,
      coalesce(sum(coalesce(tb.dispatch_blocking_count, 0)), 0) as dispatch_blocking_count,
      coalesce(sum(coalesce(pc.pred_count, 0)), 0) as predictive_alerts_count
    from ac_station acs
    left join sig_counts sc on sc.aircraft_id = acs.aircraft_id
    left join task_block tb on tb.aircraft_id = acs.aircraft_id
    left join pred_counts pc on pc.aircraft_id = acs.aircraft_id
    where acs.station_code is not null
    group by acs.station_code
  ),
  timeline_events as (
    select fs.aircraft_id, sa.tail_number, 'departure'::text as event_type,
      fs.scheduled_departure_utc as event_time_utc,
      jsonb_build_object('kind', 'departure', 'flight_number', fs.flight_number,
        'origin', fs.origin_station, 'destination', fs.destination_station,
        'status', fs.status, 'delay_minutes', fs.delay_minutes) as event_detail_json
    from public.flight_schedules fs join scoped_aircraft sa on sa.id = fs.aircraft_id
    where fs.scheduled_departure_utc between now() - interval '2 hours' and v_window_end
    union all
    select fs.aircraft_id, sa.tail_number, 'arrival'::text, fs.scheduled_arrival_utc,
      jsonb_build_object('kind', 'arrival', 'flight_number', fs.flight_number,
        'origin', fs.origin_station, 'destination', fs.destination_station,
        'status', fs.status, 'delay_minutes', fs.delay_minutes)
    from public.flight_schedules fs join scoped_aircraft sa on sa.id = fs.aircraft_id
    where fs.scheduled_arrival_utc between now() - interval '2 hours' and v_window_end
    union all
    select s.aircraft_id, sa.tail_number, 'signal'::text,
      coalesce((select min(fs2.scheduled_departure_utc) from public.flight_schedules fs2
                where fs2.aircraft_id = s.aircraft_id and fs2.scheduled_departure_utc >= now()), now()),
      jsonb_build_object('kind', 'signal', 'signal_id', s.id, 'severity', s.severity, 'title', s.title)
    from public.signals s join scoped_aircraft sa on sa.id = s.aircraft_id
    where s.is_active and s.signal_class <> 'prediction' and s.severity in ('critical', 'high')
  ),
  predictive as (
    select s.id as signal_id, s.aircraft_id, sa.tail_number, s.severity, s.title, s.predicted_event_type,
      s.component_id, s.prediction_horizon,
      (s.prediction_horizon->>'lower_bound_date')::date as lo,
      (s.prediction_horizon->>'upper_bound_date')::date as hi
    from public.signals s join scoped_aircraft sa on sa.id = s.aircraft_id
    where s.is_active and s.signal_class = 'prediction'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'time_window_hours', v_hours,
    'aircraft_positions', coalesce((select jsonb_agg(to_jsonb(p) order by p.tail_number) from positions p), '[]'::jsonb),
    'station_rollups', coalesce((select jsonb_agg(jsonb_build_object(
        'station_code', r.station_code, 'aircraft_on_ground', r.aircraft_on_ground,
        'aircraft_inbound', r.aircraft_inbound, 'active_signals_count', r.active_signals_count,
        'dispatch_blocking_count', r.dispatch_blocking_count,
        'predictive_alerts_count', r.predictive_alerts_count, 'weather', null)
      order by r.active_signals_count desc, r.dispatch_blocking_count desc, r.station_code) from station_rollups r), '[]'::jsonb),
    'timeline_events', coalesce((select jsonb_agg(to_jsonb(e) order by e.event_time_utc) from timeline_events e), '[]'::jsonb),
    'predictive_events', coalesce((select jsonb_agg(jsonb_build_object(
        'aircraft_id', pr.aircraft_id, 'tail_number', pr.tail_number, 'signal_id', pr.signal_id,
        'severity', pr.severity, 'title', pr.title, 'predicted_event_type', pr.predicted_event_type,
        'component_id', pr.component_id, 'lower_date', pr.lo, 'upper_date', pr.hi,
        'prediction_horizon', pr.prediction_horizon)) from predictive pr), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_command_center_snapshot(uuid, int) to authenticated;
