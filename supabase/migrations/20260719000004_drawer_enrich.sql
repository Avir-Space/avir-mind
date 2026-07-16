-- Phase 2.6 — enrich the aircraft drawer payload for the Command Center canvas:
-- last_transition_at (for "hours since last event"), the primary task's assignee,
-- and the next TWO flight legs (the drawer shows "Next scheduled").

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
    'last_transition_at', st.last_transition_at,
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
        'dispatch_blocking', t.dispatch_blocking, 'aog', t.aog, 'status', t.status,
        'assignee_user_id', t.assignee_user_id)
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
    'next_flights', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'flight_number', f.flight_number, 'origin', f.origin_station,
               'destination', f.destination_station, 'scheduled_departure_utc', f.scheduled_departure_utc,
               'scheduled_arrival_utc', f.scheduled_arrival_utc, 'status', f.status,
               'delay_minutes', f.delay_minutes) order by f.scheduled_departure_utc), '[]'::jsonb)
      from (
        select * from public.flight_schedules fs
        where fs.aircraft_id = a.id and fs.scheduled_departure_utc >= now() - interval '2 hours'
        order by fs.scheduled_departure_utc asc
        limit 2
      ) f),
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


-- Station drawer payload: aircraft present, inbound/outbound counts, top signals.
create or replace function public.get_station_drawer_summary(
  p_station_code text,
  p_fleet_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v jsonb;
begin
  with scoped as (
    select a.id, a.tail_number, a.aircraft_type, a.base_station,
           st.state, st.current_station
    from public.aircraft a
    left join public.aircraft_state st on st.aircraft_id = a.id
    where (p_fleet_id is null or exists (
      select 1 from public.fleet_aircraft fa where fa.aircraft_id = a.id and fa.fleet_id = p_fleet_id))
  ),
  here as (
    select * from scoped
    where state <> 'in_air' and coalesce(current_station, base_station) = p_station_code
  ),
  active_leg as (
    select distinct on (fs.aircraft_id) fs.aircraft_id, fs.destination_station
    from public.flight_schedules fs
    where fs.status in ('departed', 'en_route')
       or now() between fs.scheduled_departure_utc and fs.scheduled_arrival_utc
    order by fs.aircraft_id, fs.scheduled_departure_utc desc
  ),
  station_ac_ids as (
    select id from here
    union
    select s.id from scoped s
    join active_leg al on al.aircraft_id = s.id
    where s.state = 'in_air' and al.destination_station = p_station_code
  )
  select jsonb_build_object(
    'station_code', p_station_code,
    'aircraft_on_ground', (select count(*) from here),
    'aircraft_inbound', (
      select count(*) from scoped s join active_leg al on al.aircraft_id = s.id
      where s.state = 'in_air' and al.destination_station = p_station_code),
    'aircraft_outbound_6h', (
      select count(*) from public.flight_schedules fs
      join scoped s on s.id = fs.aircraft_id
      where fs.origin_station = p_station_code
        and fs.scheduled_departure_utc between now() and now() + interval '6 hours'),
    'aircraft_here', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'aircraft_id', h.id, 'tail_number', h.tail_number, 'aircraft_type', h.aircraft_type,
        'state', h.state) order by h.tail_number), '[]'::jsonb) from here h),
    'active_signals_count', (
      select count(*) from public.signals s
      where s.is_active and s.aircraft_id in (select id from station_ac_ids)),
    'top_signals', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'signal_id', x.id, 'severity', x.severity, 'title', x.title,
               'tail_number', x.tail_number) order by x.sev_rank desc), '[]'::jsonb)
      from (
        select s.id, s.severity, s.title, ac.tail_number,
          case s.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3
            when 'low' then 2 when 'info' then 1 else 0 end as sev_rank
        from public.signals s
        join public.aircraft ac on ac.id = s.aircraft_id
        where s.is_active and s.aircraft_id in (select id from station_ac_ids)
        order by sev_rank desc
        limit 3
      ) x)
  )
  into v;

  return v;
end;
$$;

grant execute on function public.get_station_drawer_summary(text, uuid) to authenticated;
