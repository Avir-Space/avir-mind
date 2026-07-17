-- Phase 7 — seed Flight Ops. Re-create the flight creator to write `flights`
-- (the compat view can't take flight_date), then layer dispatch / weather /
-- events / delays / briefings.

create or replace function public.seed_demo_flight_schedules(p_org_id uuid, p_user_id uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int := 0; r record; v_all text[]; v_home text; v_dests text[]; v_origin text; v_dest text;
  v_dep timestamptz; v_arr timestamptz; v_status text; v_ord int := 0; v_leg int; v_block int;
begin
  if exists (select 1 from public.flights where org_id = p_org_id) then return 0; end if;

  select array_agg(distinct s) into v_all from (
    select coalesce(st.current_station, a.base_station) as s from public.aircraft a
    left join public.aircraft_state st on st.aircraft_id = a.id where a.org_id = p_org_id) q where s is not null;
  if v_all is null or array_length(v_all, 1) < 2 then v_all := array['JFK', 'LHR', 'FRA', 'DXB']; end if;

  for r in select a.id, a.tail_number, coalesce(st.current_station, a.base_station) as home, coalesce(st.state, 'on_ground') as state
    from public.aircraft a left join public.aircraft_state st on st.aircraft_id = a.id where a.org_id = p_org_id order by a.tail_number
  loop
    v_ord := v_ord + 1; v_home := coalesce(r.home, v_all[1]);
    v_dests := array(select s from unnest(v_all) with ordinality as u(s, i) where s <> v_home order by ((i + v_ord) % greatest(array_length(v_all, 1), 1)), s limit 3);
    if v_dests is null or array_length(v_dests, 1) is null then v_dests := array['LHR', 'FRA', 'DXB']; end if;
    v_origin := v_home;
    for v_leg in 1..4 loop
      if v_leg = 4 or v_leg > array_length(v_dests, 1) then v_dest := v_home; else v_dest := coalesce(v_dests[v_leg], v_home); end if;
      v_dep := now() + (((v_ord % 6) + (v_leg - 1) * 4) || ' hours')::interval;
      v_arr := v_dep + interval '2 hours 30 minutes';
      if v_leg = 1 and r.state = 'in_air' then v_dep := now() - interval '1 hour 10 minutes'; v_arr := now() + interval '1 hour 20 minutes'; v_status := 'airborne';
      elsif v_arr <= now() then v_status := 'arrived'; elsif v_dep <= now() then v_status := 'airborne'; else v_status := 'scheduled'; end if;
      v_block := round(extract(epoch from (v_arr - v_dep)) / 60);
      insert into public.flights (org_id, aircraft_id, flight_number, flight_date, origin_station, destination_station,
        scheduled_departure_utc, scheduled_arrival_utc, status, planned_block_time_minutes, planned_fuel_kg,
        passenger_count, cargo_kg, planned_route, planned_flight_level, alternate_stations, source_system)
      values (p_org_id, r.id, 'AV' || lpad((100 + v_ord * 4 + v_leg)::text, 3, '0'), v_dep::date, v_origin, v_dest,
        v_dep, v_arr, v_status, v_block, v_block * 18, 120 + (v_ord * 3 % 60), 800 + (v_ord * 50 % 2000),
        v_origin || ' DCT ' || v_dest, 340 + (v_leg % 4) * 20, array[v_dests[(v_leg % 3) + 1]], 'avir');
      v_count := v_count + 1; v_origin := v_dest;
    end loop;
  end loop;
  return v_count;
end $$;
grant execute on function public.seed_demo_flight_schedules(uuid, uuid) to authenticated, anon, service_role;

-- Full ops layer: past flights, weather, dispatch releases, delays, briefings.
create or replace function public.seed_demo_flight_ops(p_org_id uuid, p_user_id uuid)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_count int := 0; r record; i int; t int; v_ord int := 0; v_fid uuid; v_dep timestamptz; v_arr timestamptz;
  v_delayed boolean; v_dly int; v_out timestamptz; v_off timestamptz; v_on timestamptz; v_in timestamptz;
  v_stations text[] := array['FRA','JFK','LAX','ORD','DFW','DEL','BOM','LHR','ATL','DEN','SEA','DXB'];
  v_cat text; v_ceil int; v_vis int; v_cm uuid; v_impact_flight uuid;
begin
  if exists (select 1 from public.weather_observations where org_id = p_org_id) then return 0; end if;

  -- Set fuel actuals + enrich a couple of already-arrived flights.
  update public.flights set planned_fuel_kg = coalesce(planned_fuel_kg, planned_block_time_minutes * 18) where org_id = p_org_id;

  -- 48h of METAR (every 6h) + TAF per station; LHR IFR, ORD LIFR, SEA MVFR.
  for i in 1..array_length(v_stations, 1) loop
    v_cat := case v_stations[i] when 'LHR' then 'ifr' when 'ORD' then 'lifr' when 'SEA' then 'mvfr' else 'vfr' end;
    v_ceil := case v_cat when 'lifr' then 300 when 'ifr' then 700 when 'mvfr' then 2200 else 9000 end;
    v_vis := case v_cat when 'lifr' then 800 when 'ifr' then 2400 when 'mvfr' then 6000 else 9999 end;
    for t in 0..7 loop
      insert into public.weather_observations (org_id, station_code, observation_type, observation_time_utc, raw_text, parsed_data, flight_category, source)
      values (p_org_id, v_stations[i], 'metar', now() - (t * 6 || ' hours')::interval,
        v_stations[i] || ' ' || to_char(now() - (t * 6 || ' hours')::interval, 'DDHH24MI') || 'Z ' || lpad((((i * 30) % 360))::text, 3, '0') || (8 + i % 12)::text || 'KT ' || v_vis || ' ' || (case when v_cat = 'vfr' then 'FEW' else 'OVC' end) || lpad((v_ceil / 100)::text, 3, '0') || ' ' || (12 + i % 10) || '/' || (6 + i % 6) || ' Q101' || (i % 9),
        jsonb_build_object('wind_dir', (i * 30) % 360, 'wind_kt', 8 + i % 12, 'visibility_m', v_vis, 'ceiling_ft', v_ceil, 'temp_c', 12 + i % 10, 'dewpoint_c', 6 + i % 6, 'altimeter_hpa', 1010 + i % 9),
        v_cat, 'avir');
      v_count := v_count + 1;
    end loop;
    insert into public.weather_observations (org_id, station_code, observation_type, observation_time_utc, valid_from_utc, valid_until_utc, raw_text, flight_category, source)
    values (p_org_id, v_stations[i], 'taf', now() - interval '2 hours', now(), now() + interval '24 hours',
      'TAF ' || v_stations[i] || ' ' || to_char(now(), 'DDHH24MI') || 'Z ' || to_char(now(), 'DD') || '00/' || to_char(now() + interval '1 day', 'DD') || '00 VRB05KT 9999 SCT035', v_cat, 'avir');
  end loop;
  -- One enroute SIGMET.
  insert into public.weather_observations (org_id, station_code, observation_type, observation_time_utc, valid_from_utc, valid_until_utc, raw_text, source)
  values (p_org_id, 'ENROUTE', 'sigmet', now() - interval '30 minutes', now(), now() + interval '5 hours',
    'SIGMET 3 VALID: SEV TURB FCST FL280-FL400 N ATLANTIC TRACKS MOV E', 'avir');

  -- Past flights (last 48h) per aircraft: 2 each, with OOOI, delays, events.
  for r in select id, tail_number, coalesce((select current_station from public.aircraft_state s where s.aircraft_id = a.id), base_station) as home from public.aircraft a where a.org_id = p_org_id order by tail_number loop
    v_ord := v_ord + 1;
    for i in 1..2 loop
      v_dep := now() - ((i * 20 + v_ord % 12) || ' hours')::interval;
      v_arr := v_dep + interval '2 hours 30 minutes';
      v_delayed := (v_ord + i) % 4 = 0;
      v_dly := case when v_delayed then 35 + (v_ord % 25) else (v_ord % 12) end;
      v_out := v_dep + (v_dly || ' minutes')::interval; v_off := v_out + interval '15 minutes';
      v_on := v_arr + (v_dly || ' minutes')::interval; v_in := v_on + interval '8 minutes';
      insert into public.flights (org_id, aircraft_id, flight_number, flight_date, origin_station, destination_station,
        scheduled_departure_utc, scheduled_arrival_utc, actual_out_utc, actual_off_utc, actual_on_utc, actual_in_utc,
        status, delay_minutes, planned_block_time_minutes, actual_block_time_minutes, planned_fuel_kg, actual_fuel_kg,
        passenger_count, cargo_kg, source_system)
      values (p_org_id, r.id, 'AV' || (700 + v_ord * 2 + i), v_dep::date, r.home, v_stations[1 + ((v_ord + i) % 12)],
        v_dep, v_arr, v_out, v_off, v_on, v_in, 'arrived', v_dly, 150, round(extract(epoch from (v_in - v_out)) / 60),
        5000, 5000 + (case when v_ord % 5 = 0 then 450 else 80 + v_ord % 60 end), 130 + v_ord % 50, 1200, 'sita')
      returning id into v_fid;
      v_count := v_count + 1;
      insert into public.flight_events (org_id, flight_id, event_type, event_time_utc, source_system) values
        (p_org_id, v_fid, 'pushback', v_out, 'acars'), (p_org_id, v_fid, 'takeoff', v_off, 'acars'),
        (p_org_id, v_fid, 'landing', v_on, 'acars'), (p_org_id, v_fid, 'taxi_in', v_in, 'acars');
      if v_delayed then
        insert into public.delay_attribution (org_id, flight_id, delay_code, delay_code_category, delay_minutes, delay_reason, responsibility_org)
        values (p_org_id, v_fid, '81', 'atc', greatest(v_dly - 15, 10), 'ATC flow restriction', 'atc'),
               (p_org_id, v_fid, '22', 'ramp', 15, 'Late catering uplift', 'ground_handler');
      end if;
    end loop;
  end loop;

  -- Dispatch releases + briefings for upcoming flights.
  for r in select id, flight_number, planned_block_time_minutes from public.flights where org_id = p_org_id and scheduled_departure_utc > now() order by scheduled_departure_utc limit 12 loop
    insert into public.dispatch_releases (org_id, flight_id, release_number, dispatcher_user_id, released_at_utc, valid_until_utc, status, fuel_plan, weather_summary, weight_and_balance, performance_data)
    values (p_org_id, r.id, 'REL-' || substr(r.id::text, 1, 6), p_user_id, now(), now() + interval '6 hours', 'pending_captain',
      jsonb_build_object('trip_kg', r.planned_block_time_minutes * 18, 'contingency_kg', 400, 'alternate_kg', 900, 'final_reserve_kg', 600, 'taxi_kg', 150, 'block_kg', r.planned_block_time_minutes * 18 + 2050),
      jsonb_build_object('origin', 'VFR', 'destination', 'MVFR', 'note', 'Monitor destination trend'),
      jsonb_build_object('zfw_kg', 52000, 'tow_kg', 68000, 'ldw_kg', 60000, 'cg_pct_mac', 27.5),
      jsonb_build_object('v1', 142, 'vr', 148, 'v2', 152, 'todr_m', 1850, 'ldr_m', 1420));
    v_count := v_count + 1;
    insert into public.flight_briefings (org_id, flight_id, briefing_type, content_json)
    values (p_org_id, r.id, 'full_package', jsonb_build_object('sections', jsonb_build_array('weather', 'notams', 'fuel', 'alternates'), 'generated', 'avir'));
  end loop;

  -- Guarantee a crew_impact_from_delay: delay an assigned pic's flight + make them duty-heavy.
  select asg.crew_member_id, asg.flight_schedule_id into v_cm, v_impact_flight
  from public.assignments asg where asg.org_id = p_org_id and asg.role_on_flight = 'pic' limit 1;
  if v_cm is not null and v_impact_flight is not null then
    for i in 0..3 loop
      insert into public.duty_periods (org_id, crew_member_id, duty_type, start_utc, end_utc, flight_time_minutes, status)
      values (p_org_id, v_cm, 'flight', now() - (i || ' days')::interval - interval '3 hours', now() - (i || ' days')::interval + interval '6 hours', 460, 'actual');
    end loop;
    update public.flights set delay_minutes = 50, status = 'delayed' where id = v_impact_flight;
    insert into public.delay_attribution (org_id, flight_id, delay_code, delay_code_category, delay_minutes, delay_reason, responsibility_org)
    values (p_org_id, v_impact_flight, '81', 'atc', 50, 'ATC flow into congested arrival', 'atc');
  end if;

  return v_count;
end $$;
grant execute on function public.seed_demo_flight_ops(uuid, uuid) to authenticated, anon, service_role;

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
      perform public.seed_demo_crew(v_org, new.id);
      perform public.seed_demo_flight_ops(v_org, new.id);
      perform public.generate_inventory_signals_for_org(v_org);
      perform public.generate_crew_signals_for_org(v_org);
      perform public.generate_operational_signals_for_org(v_org);
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
    perform public.seed_demo_flight_ops(r.org_id, r.user_id);
    perform public.generate_operational_signals_for_org(r.org_id);
  end loop;
end $$;
