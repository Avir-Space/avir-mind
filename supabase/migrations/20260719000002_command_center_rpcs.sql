-- Phase 2.5 — Command Center operational canvas RPCs
--
-- We have NO lat/lng telemetry in this schema; position is a text station code
-- (aircraft_state.current_station, falling back to aircraft.base_station). These
-- RPCs resolve station codes to coordinates via an inline geo lookup, and for
-- in-air aircraft with an active flight leg they interpolate a plausible mid-leg
-- position from origin/destination coordinates and elapsed time.
--
-- security invoker: RLS scopes every read to the caller's org.

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
       or exists (
         select 1 from public.fleet_aircraft fa
         where fa.aircraft_id = a.id and fa.fleet_id = p_fleet_id
       )
  ),
  -- The in-progress leg per aircraft (for mid-air interpolation).
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
    select s.aircraft_id,
      count(*) as active_count,
      (array_agg(s.severity order by
        case s.severity
          when 'critical' then 5 when 'high' then 4 when 'medium' then 3
          when 'low' then 2 when 'info' then 1 else 0 end desc))[1] as max_severity
    from public.signals s
    where s.is_active and s.aircraft_id is not null
    group by s.aircraft_id
  ),
  task_block as (
    select t.aircraft_id,
      count(*) filter (where t.aog) as aog_count,
      count(*) filter (where t.dispatch_blocking) as dispatch_blocking_count,
      (array_agg(t.title order by
        (case when t.aog then 3 when t.dispatch_blocking then 2 else 1 end) desc,
        case t.risk_band when 'high' then 3 when 'medium' then 2 else 1 end desc,
        t.created_at_utc asc))[1] as primary_task_title
    from public.tasks t
    where t.status <> 'done'
    group by t.aircraft_id
  ),
  positions as (
    select
      sa.id as aircraft_id,
      sa.tail_number,
      sa.aircraft_type,
      case
        when coalesce(tb.aog_count, 0) > 0 or sa.next_event_type = 'AOG Recovery' then 'aog'
        else coalesce(nullif(sa.state, 'unknown'), 'on_ground')
      end as state,
      coalesce(sa.current_station, sa.base_station) as station,
      case
        when al.aircraft_id is not null and og.lat is not null and dg.lat is not null
          then round((og.lat + (dg.lat - og.lat) * frac.f)::numeric, 4)
        else g.lat
      end as lat,
      case
        when al.aircraft_id is not null and og.lng is not null and dg.lng is not null
          then round((og.lng + (dg.lng - og.lng) * frac.f)::numeric, 4)
        else g.lng
      end as lng,
      coalesce(sc.active_count, 0) as active_signals_count,
      sc.max_severity,
      tb.primary_task_title
    from scoped_aircraft sa
    left join active_leg al on al.aircraft_id = sa.id
    left join geo g  on g.code  = coalesce(sa.current_station, sa.base_station)
    left join geo og on og.code = al.origin_station
    left join geo dg on dg.code = al.destination_station
    left join lateral (
      select least(greatest(
        extract(epoch from (now() - al.dep)) / nullif(extract(epoch from (al.arr - al.dep)), 0), 0), 1) as f
    ) frac on true
    left join sig_counts sc on sc.aircraft_id = sa.id
    left join task_block tb on tb.aircraft_id = sa.id
  ),
  -- Where each aircraft "counts" for the station rollup: on-ground aircraft at
  -- their current station; in-air aircraft inbound to their leg destination.
  ac_station as (
    select sa.id as aircraft_id,
      case when sa.state = 'in_air'
        then coalesce(al.destination_station, sa.base_station)
        else coalesce(sa.current_station, sa.base_station)
      end as station_code,
      (sa.state = 'in_air') as inbound
    from scoped_aircraft sa
    left join active_leg al on al.aircraft_id = sa.id
  ),
  station_rollups as (
    select acs.station_code,
      count(*) filter (where not acs.inbound) as aircraft_on_ground,
      count(*) filter (where acs.inbound) as aircraft_inbound,
      coalesce(sum(coalesce(sc.active_count, 0)), 0) as active_signals_count,
      coalesce(sum(coalesce(tb.dispatch_blocking_count, 0)), 0) as dispatch_blocking_count
    from ac_station acs
    left join sig_counts sc on sc.aircraft_id = acs.aircraft_id
    left join task_block tb on tb.aircraft_id = acs.aircraft_id
    where acs.station_code is not null
    group by acs.station_code
  ),
  timeline_events as (
    select fs.aircraft_id, sa.tail_number, 'departure'::text as event_type,
      fs.scheduled_departure_utc as event_time_utc,
      jsonb_build_object('kind', 'departure', 'flight_number', fs.flight_number,
        'origin', fs.origin_station, 'destination', fs.destination_station,
        'status', fs.status, 'delay_minutes', fs.delay_minutes) as event_detail_json
    from public.flight_schedules fs
    join scoped_aircraft sa on sa.id = fs.aircraft_id
    where fs.scheduled_departure_utc between now() - interval '2 hours' and v_window_end
    union all
    select fs.aircraft_id, sa.tail_number, 'arrival'::text,
      fs.scheduled_arrival_utc,
      jsonb_build_object('kind', 'arrival', 'flight_number', fs.flight_number,
        'origin', fs.origin_station, 'destination', fs.destination_station,
        'status', fs.status, 'delay_minutes', fs.delay_minutes)
    from public.flight_schedules fs
    join scoped_aircraft sa on sa.id = fs.aircraft_id
    where fs.scheduled_arrival_utc between now() - interval '2 hours' and v_window_end
    union all
    -- Dispatch-relevant signals anchored at the aircraft's next departure.
    select s.aircraft_id, sa.tail_number, 'signal'::text,
      coalesce((select min(fs2.scheduled_departure_utc) from public.flight_schedules fs2
                where fs2.aircraft_id = s.aircraft_id and fs2.scheduled_departure_utc >= now()), now()),
      jsonb_build_object('kind', 'signal', 'signal_id', s.id, 'severity', s.severity, 'title', s.title)
    from public.signals s
    join scoped_aircraft sa on sa.id = s.aircraft_id
    where s.is_active and s.severity in ('critical', 'high')
  )
  select jsonb_build_object(
    'generated_at', now(),
    'time_window_hours', v_hours,
    'aircraft_positions', coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.tail_number) from positions p), '[]'::jsonb),
    'station_rollups', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'station_code', r.station_code,
        'aircraft_on_ground', r.aircraft_on_ground,
        'aircraft_inbound', r.aircraft_inbound,
        'active_signals_count', r.active_signals_count,
        'dispatch_blocking_count', r.dispatch_blocking_count,
        'weather', null
      ) order by r.active_signals_count desc, r.dispatch_blocking_count desc, r.station_code)
      from station_rollups r), '[]'::jsonb),
    'timeline_events', coalesce(
      (select jsonb_agg(to_jsonb(e) order by e.event_time_utc) from timeline_events e), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_command_center_snapshot(uuid, int) to authenticated;


-- Compact aircraft summary for the universal right-side drawer.
create or replace function public.get_aircraft_drawer_summary(p_aircraft_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'aircraft_id', a.id,
    'tail_number', a.tail_number,
    'aircraft_type', a.aircraft_type,
    'base_station', a.base_station,
    'ownership_type', a.ownership_type,
    'state', coalesce(st.state, 'unknown'),
    'current_station', coalesce(st.current_station, a.base_station),
    'state_confidence', st.state_confidence,
    'state_source', st.state_source,
    'next_event_type', st.next_event_type,
    'next_event_at', st.next_event_at,
    'active_signals_count', (
      select count(*) from public.signals s where s.aircraft_id = a.id and s.is_active),
    'active_tasks_count', (
      select count(*) from public.tasks t where t.aircraft_id = a.id and t.status <> 'done'),
    'dispatch_blocking_count', (
      select count(*) from public.tasks t
      where t.aircraft_id = a.id and t.status <> 'done' and t.dispatch_blocking),
    'primary_task', (
      select jsonb_build_object('task_id', t.id, 'title', t.title, 'risk_band', t.risk_band,
        'dispatch_blocking', t.dispatch_blocking, 'aog', t.aog, 'status', t.status)
      from public.tasks t
      where t.aircraft_id = a.id and t.status <> 'done'
      order by (case when t.aog then 3 when t.dispatch_blocking then 2 else 1 end) desc,
               case t.risk_band when 'high' then 3 when 'medium' then 2 else 1 end desc,
               t.created_at_utc asc
      limit 1),
    'top_signals', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'signal_id', s.id, 'severity', s.severity, 'title', s.title) order by s.sev_rank desc), '[]'::jsonb)
      from (
        select s2.id, s2.severity, s2.title,
          case s2.severity
            when 'critical' then 5 when 'high' then 4 when 'medium' then 3
            when 'low' then 2 when 'info' then 1 else 0 end as sev_rank
        from public.signals s2
        where s2.aircraft_id = a.id and s2.is_active
        order by sev_rank desc
        limit 5
      ) s),
    'next_flight', (
      select jsonb_build_object('flight_number', fs.flight_number, 'origin', fs.origin_station,
        'destination', fs.destination_station, 'scheduled_departure_utc', fs.scheduled_departure_utc,
        'scheduled_arrival_utc', fs.scheduled_arrival_utc, 'status', fs.status)
      from public.flight_schedules fs
      where fs.aircraft_id = a.id and fs.scheduled_departure_utc >= now() - interval '2 hours'
      order by fs.scheduled_departure_utc asc
      limit 1)
  )
  into v
  from public.aircraft a
  left join public.aircraft_state st on st.aircraft_id = a.id
  where a.id = p_aircraft_id;

  return v;
end;
$$;

grant execute on function public.get_aircraft_drawer_summary(uuid) to authenticated;
