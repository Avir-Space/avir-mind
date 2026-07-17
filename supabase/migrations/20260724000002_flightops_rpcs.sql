-- Phase 7 — Flight Ops RPCs.

create or replace function public.create_dispatch_release(p_flight_id uuid, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid; v_num text;
begin
  select org_id into v_org from public.flights where id = p_flight_id;
  v_num := coalesce(p_attrs->>'release_number', 'REL-' || to_char(now(), 'YYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 4));
  insert into public.dispatch_releases (org_id, flight_id, release_number, dispatcher_user_id, released_at_utc, valid_until_utc,
    status, planned_route_detail, fuel_plan, weather_summary, notam_summary, mel_items, weight_and_balance, performance_data)
  values (v_org, p_flight_id, v_num, auth.uid(), now(), now() + interval '6 hours',
    coalesce(p_attrs->>'status', 'pending_captain'), p_attrs->'planned_route_detail', p_attrs->'fuel_plan',
    p_attrs->'weather_summary', p_attrs->'notam_summary', p_attrs->'mel_items', p_attrs->'weight_and_balance', p_attrs->'performance_data')
  returning id into v_id;
  insert into public.flight_events (org_id, flight_id, event_type, event_time_utc, reported_by_user_id, source_system, event_payload)
  values (v_org, p_flight_id, 'release_issued', now(), auth.uid(), 'avir', jsonb_build_object('release_number', v_num));
  update public.flights set status = case when status in ('planned', 'scheduled') then 'dispatched' else status end, updated_at_utc = now() where id = p_flight_id;
  return v_id;
end $$;
grant execute on function public.create_dispatch_release(uuid, jsonb) to authenticated;

create or replace function public.update_dispatch_release_status(p_release_id uuid, p_status text, p_notes text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.dispatch_releases set status = p_status,
    captain_signature_utc = case when p_status = 'captain_accepted' then now() else captain_signature_utc end,
    captain_notes = coalesce(p_notes, captain_notes)
  where id = p_release_id;
end $$;
grant execute on function public.update_dispatch_release_status(uuid, text, text) to authenticated;

create or replace function public.record_flight_event(p_flight_id uuid, p_event_type text, p_event_time timestamptz, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.flights where id = p_flight_id;
  insert into public.flight_events (org_id, flight_id, event_type, event_time_utc, reported_by_user_id, source_system, source_reference_id, event_payload)
  values (v_org, p_flight_id, p_event_type, p_event_time, auth.uid(), coalesce(p_attrs->>'source_system', 'manual'), p_attrs->>'source_reference_id', p_attrs->'event_payload')
  returning id into v_id;

  update public.flights set
    status = case p_event_type
      when 'boarding_started' then 'boarding' when 'pushback' then 'taxiing' when 'takeoff' then 'airborne'
      when 'landing' then 'arrived' when 'cancellation' then 'cancelled' when 'diversion_executed' then 'diverted'
      when 'delay_recorded' then 'delayed' else status end,
    actual_out_utc = case when p_event_type = 'pushback' then p_event_time else actual_out_utc end,
    actual_off_utc = case when p_event_type = 'takeoff' then p_event_time else actual_off_utc end,
    actual_on_utc = case when p_event_type = 'landing' then p_event_time else actual_on_utc end,
    actual_in_utc = case when p_event_type in ('taxi_in', 'doors_open', 'deplaning_completed') then p_event_time else actual_in_utc end,
    diversion_station = case when p_event_type = 'diversion_executed' then coalesce(p_attrs->>'diversion_station', diversion_station) else diversion_station end,
    actual_block_time_minutes = case when p_event_type in ('taxi_in', 'doors_open') and actual_out_utc is not null
      then round(extract(epoch from (p_event_time - actual_out_utc)) / 60) else actual_block_time_minutes end,
    updated_at_utc = now()
  where id = p_flight_id;
  return v_id;
end $$;
grant execute on function public.record_flight_event(uuid, text, timestamptz, jsonb) to authenticated;

create or replace function public.attribute_delay(p_flight_id uuid, p_delay_code text, p_category text, p_minutes int, p_reason text default null, p_responsibility text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid; v_total int;
begin
  select org_id into v_org from public.flights where id = p_flight_id;
  insert into public.delay_attribution (org_id, flight_id, delay_code, delay_code_category, delay_minutes, delay_reason, responsibility_org)
  values (v_org, p_flight_id, p_delay_code, p_category, p_minutes, p_reason, p_responsibility) returning id into v_id;
  select coalesce(sum(delay_minutes), 0) into v_total from public.delay_attribution where flight_id = p_flight_id;
  update public.flights set delay_minutes = v_total,
    delay_codes = (select array_agg(distinct dc) from (select unnest(coalesce(delay_codes, '{}')) dc union select p_delay_code) u),
    status = case when status not in ('cancelled', 'diverted', 'arrived') then 'delayed' else status end, updated_at_utc = now()
  where id = p_flight_id;
  return v_id;
end $$;
grant execute on function public.attribute_delay(uuid, text, text, int, text, text) to authenticated;

create or replace function public.compute_flight_performance(p_flight_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare f record; v_dep_delay int; v_arr_delay int;
begin
  select * into f from public.flights where id = p_flight_id;
  v_dep_delay := case when f.actual_out_utc is not null then round(extract(epoch from (f.actual_out_utc - f.scheduled_departure_utc)) / 60) else null end;
  v_arr_delay := case when f.actual_in_utc is not null then round(extract(epoch from (f.actual_in_utc - f.scheduled_arrival_utc)) / 60) else null end;
  return jsonb_build_object(
    'on_time', case when v_arr_delay is null then null else v_arr_delay <= 15 end,
    'departure_delay_min', v_dep_delay, 'arrival_delay_min', v_arr_delay,
    'block_time_variance_min', case when f.actual_block_time_minutes is not null and f.planned_block_time_minutes is not null then f.actual_block_time_minutes - f.planned_block_time_minutes else null end,
    'fuel_variance_kg', case when f.actual_fuel_kg is not null and f.planned_fuel_kg is not null then f.actual_fuel_kg - f.planned_fuel_kg else null end,
    'attributed_delay_min', f.delay_minutes, 'delay_codes', to_jsonb(f.delay_codes));
end $$;
grant execute on function public.compute_flight_performance(uuid) to authenticated;

create or replace function public.get_weather_briefing(p_flight_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare f record;
begin
  select * into f from public.flights where id = p_flight_id;
  return jsonb_build_object(
    'origin', public._station_wx(f.origin_station), 'destination', public._station_wx(f.destination_station),
    'alternates', (select coalesce(jsonb_agg(public._station_wx(s)), '[]'::jsonb) from unnest(coalesce(f.alternate_stations, '{}')) s),
    'enroute_sigmets', (select coalesce(jsonb_agg(jsonb_build_object('raw_text', raw_text, 'valid_until', valid_until_utc)), '[]'::jsonb)
      from public.weather_observations where observation_type in ('sigmet', 'airmet') and (valid_until_utc is null or valid_until_utc > now())));
end $$;
grant execute on function public.get_weather_briefing(uuid) to authenticated;

create or replace function public._station_wx(p_station text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('station_code', p_station,
    'metar', (select jsonb_build_object('raw_text', raw_text, 'flight_category', flight_category, 'observation_time_utc', observation_time_utc, 'parsed_data', parsed_data)
      from public.weather_observations where station_code = p_station and observation_type = 'metar' order by observation_time_utc desc limit 1),
    'taf', (select jsonb_build_object('raw_text', raw_text, 'valid_until_utc', valid_until_utc)
      from public.weather_observations where station_code = p_station and observation_type = 'taf' order by observation_time_utc desc limit 1));
$$;
grant execute on function public._station_wx(text) to authenticated;

create or replace function public.get_flight_detail(p_flight_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'flight', (select to_jsonb(f) from public.flights f where f.id = p_flight_id),
    'aircraft', (select jsonb_build_object('id', a.id, 'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type)
      from public.flights f join public.aircraft a on a.id = f.aircraft_id where f.id = p_flight_id),
    'dispatch_release', (select to_jsonb(dr) from public.dispatch_releases dr where dr.flight_id = p_flight_id and dr.status <> 'superseded' order by dr.released_at_utc desc limit 1),
    'crew', (select coalesce(jsonb_agg(jsonb_build_object('assignment_id', asg.id, 'role_on_flight', asg.role_on_flight, 'assignment_status', asg.assignment_status,
        'crew_member_id', cm.id, 'first_name', cm.first_name, 'last_name', cm.last_name, 'crew_role', cm.role)), '[]'::jsonb)
      from public.assignments asg join public.crew_members cm on cm.id = asg.crew_member_id where asg.flight_schedule_id = p_flight_id),
    'weather', public.get_weather_briefing(p_flight_id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'event_time_utc', e.event_time_utc, 'source_system', e.source_system, 'event_payload', e.event_payload) order by e.event_time_utc), '[]'::jsonb)
      from public.flight_events e where e.flight_id = p_flight_id),
    'delays', (select coalesce(jsonb_agg(to_jsonb(d) order by d.delay_minutes desc), '[]'::jsonb) from public.delay_attribution d where d.flight_id = p_flight_id),
    'briefings', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'briefing_type', b.briefing_type, 'generated_at_utc', b.generated_at_utc, 'content_json', b.content_json)), '[]'::jsonb)
      from public.flight_briefings b where b.flight_id = p_flight_id),
    'performance', public.compute_flight_performance(p_flight_id)
  ) into v;
  return v;
end $$;
grant execute on function public.get_flight_detail(uuid) to authenticated;

create or replace function public.get_flights_list(p_from date default null, p_to date default null)
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.scheduled_departure_utc), '[]'::jsonb)
  from (
    select f.id, f.flight_number, f.flight_date, f.origin_station, f.destination_station, f.status, f.delay_minutes,
      f.scheduled_departure_utc, f.scheduled_arrival_utc, f.estimated_departure_utc, f.actual_out_utc, f.actual_in_utc,
      a.tail_number, a.aircraft_type
    from public.flights f left join public.aircraft a on a.id = f.aircraft_id
    where f.flight_date between coalesce(p_from, current_date) and coalesce(p_to, current_date + 2)
  ) x;
$$;
grant execute on function public.get_flights_list(date, date) to authenticated;

create or replace function public.get_daily_ops_summary()
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'total_flights', (select count(*) from public.flights where flight_date = current_date),
    'on_time_pct', (select case when count(*) filter (where actual_in_utc is not null) = 0 then null
      else round(100.0 * count(*) filter (where actual_in_utc is not null and actual_in_utc <= scheduled_arrival_utc + interval '15 minutes') / count(*) filter (where actual_in_utc is not null)) end
      from public.flights where flight_date >= current_date - 1),
    'delays_gt15', (select count(*) from public.flights where flight_date >= current_date - 1 and delay_minutes > 15),
    'cancellations', (select count(*) from public.flights where flight_date = current_date and status = 'cancelled'),
    'diversions', (select count(*) from public.flights where flight_date >= current_date - 1 and status = 'diverted'),
    'delays_by_category', (select coalesce(jsonb_object_agg(cat, mins), '{}'::jsonb) from (select delay_code_category cat, sum(delay_minutes) mins from public.delay_attribution where created_at_utc > now() - interval '7 days' group by delay_code_category) c),
    'ifr_stations', (select count(distinct station_code) from public.weather_observations w where observation_type = 'metar' and flight_category in ('ifr', 'lifr')
      and observation_time_utc = (select max(observation_time_utc) from public.weather_observations w2 where w2.station_code = w.station_code and w2.observation_type = 'metar'))
  );
$$;
grant execute on function public.get_daily_ops_summary() to authenticated;

create or replace function public.get_dispatch_queue()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.released_at_utc desc), '[]'::jsonb)
  from (
    select dr.id, dr.release_number, dr.status, dr.released_at_utc, dr.captain_signature_utc, dr.flight_id,
      f.flight_number, f.origin_station, f.destination_station, f.scheduled_departure_utc, a.tail_number
    from public.dispatch_releases dr join public.flights f on f.id = dr.flight_id left join public.aircraft a on a.id = f.aircraft_id
    where dr.status <> 'superseded'
  ) x;
$$;
grant execute on function public.get_dispatch_queue() to authenticated;

create or replace function public.get_weather_board()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('station_code', w.station_code, 'flight_category', w.flight_category,
    'raw_text', w.raw_text, 'observation_time_utc', w.observation_time_utc, 'parsed_data', w.parsed_data) order by w.station_code), '[]'::jsonb)
  from public.weather_observations w
  where w.observation_type = 'metar'
    and w.observation_time_utc = (select max(observation_time_utc) from public.weather_observations w2 where w2.station_code = w.station_code and w2.observation_type = 'metar');
$$;
grant execute on function public.get_weather_board() to authenticated;

create or replace function public.get_weather_overlay()
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'stations', public.get_weather_board(),
    'sigmets', (select coalesce(jsonb_agg(jsonb_build_object('raw_text', raw_text, 'parsed_data', parsed_data, 'valid_until_utc', valid_until_utc)), '[]'::jsonb)
      from public.weather_observations where observation_type in ('sigmet', 'airmet') and (valid_until_utc is null or valid_until_utc > now())));
$$;
grant execute on function public.get_weather_overlay() to authenticated;

create or replace function public.get_recent_flight_events(p_limit int default 30)
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_time_utc desc), '[]'::jsonb)
  from (
    select e.id, e.event_type, e.event_time_utc, e.flight_id, e.source_system, f.flight_number, f.origin_station, f.destination_station, a.tail_number
    from public.flight_events e join public.flights f on f.id = e.flight_id left join public.aircraft a on a.id = f.aircraft_id
    order by e.event_time_utc desc limit greatest(p_limit, 1)
  ) x;
$$;
grant execute on function public.get_recent_flight_events(int) to authenticated;
