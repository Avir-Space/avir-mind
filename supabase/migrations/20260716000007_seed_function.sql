-- 0007: seed_avir_demo(p_user_id)
--
-- Provisions a brand-new user into their own org and seeds a realistic demo
-- fleet: 3 fleets, 24 aircraft, live state per aircraft.
--
-- Idempotent: if the user already belongs to an org, it returns that org and
-- does nothing. This makes it safe to call from BOTH the signup trigger and the
-- signup page without double-seeding.
--
-- SECURITY DEFINER so it can write across RLS. Callers other than the internal
-- trigger (auth.uid() is null) may only seed themselves.
--
-- State distribution (24 aircraft):
--   dispatch-ready (in_air/on_ground/stationed) : 20  (83.3%)
--   under_maintenance                           :  3  (12.5%, incl. 1 AOG @ 4.2%)
--   unknown (telemetry-gap edge case)           :  1  ( 4.2%)
-- Source: 14 telemetry / 7 ops_system / 3 manual. Confidence: mostly high.

create or replace function public.seed_avir_demo(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id    uuid;
  v_email     text;
  v_org_name  text;
  v_fleet_ids uuid[] := array[]::uuid[];
  v_fleet_id  uuid;
  v_ac_id     uuid;
  r           record;
begin
  -- Guardrails ---------------------------------------------------------------
  if p_user_id is null then
    raise exception 'seed_avir_demo: p_user_id is required';
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'seed_avir_demo: may only seed the calling user';
  end if;

  -- Idempotency: already provisioned → return existing org.
  select m.org_id into v_org_id
  from public.org_members m
  where m.user_id = p_user_id
  limit 1;
  if v_org_id is not null then
    return v_org_id;
  end if;

  -- Org + owner membership ---------------------------------------------------
  select u.email into v_email from auth.users u where u.id = p_user_id;
  v_org_name := coalesce(
    nullif(initcap(split_part(v_email, '@', 1)) || ' Operations', ' Operations'),
    'AVIR Demo Airline'
  );

  insert into public.orgs (name, plan)
  values (v_org_name, 'free')
  returning id into v_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (v_org_id, p_user_id, 'owner');

  -- Fleets -------------------------------------------------------------------
  insert into public.fleets (org_id, name, aircraft_type_focus)
  values (v_org_id, 'Fleet 1 — Narrowbody', 'A320 / B737 family')
  returning id into v_fleet_id;
  v_fleet_ids[1] := v_fleet_id;

  insert into public.fleets (org_id, name, aircraft_type_focus)
  values (v_org_id, 'Fleet 2 — Regional', 'E175 / CRJ-900')
  returning id into v_fleet_id;
  v_fleet_ids[2] := v_fleet_id;

  insert into public.fleets (org_id, name, aircraft_type_focus)
  values (v_org_id, 'Fleet 3 — Business Jets', 'G650 / Falcon 7X / Global 7500')
  returning id into v_fleet_id;
  v_fleet_ids[3] := v_fleet_id;

  -- Aircraft + state ---------------------------------------------------------
  for r in
    select * from (values
      -- tail, type, serial, base, ownership, deliv_days, fleet_no, state, source, conf, cur_station, next_evt, until_h, since_h
      ('N320AV','A320neo','MSN7412','JFK','owned',    900, 1,'on_ground',        'telemetry', 'high',  'JFK','Departure',           6,  18),
      ('N321AV','A321',   'MSN7188','LAX','owned',   1200, 1,'in_air',           'telemetry', 'high',  null, 'Arrival',             2,   3),
      ('N322AV','A320neo','MSN7655','ORD','leased',   540, 1,'stationed',        'telemetry', 'high',  'ORD','Positioning',        30,  72),
      ('N323AV','A321',   'MSN6903','DFW','managed', 1500, 1,'on_ground',        'ops_system','medium','DFW','Departure',           9,  26),
      ('VT-ANA','A320neo','MSN7501','DEL','leased',   700, 1,'in_air',           'telemetry', 'high',  null, 'Arrival',             4,   5),
      ('VT-ANB','A321',   'MSN7020','BOM','owned',   1100, 1,'on_ground',        'telemetry', 'high',  'BOM','Departure',           7,  12),
      ('D-AIAA','A320neo','MSN7733','FRA','owned',    420, 1,'stationed',        'telemetry', 'high',  'FRA','Positioning',        48,  96),
      ('D-AIAB','A321',   'MSN6650','FRA','leased',  1650, 1,'under_maintenance','ops_system','medium','FRA','AOG Recovery',       72,  30),
      ('N737AV','B737-800','MSN38221','ATL','owned', 1800, 1,'in_air',           'telemetry', 'high',  null, 'Arrival',             3,   4),
      ('N738AV','B737 MAX 8','MSN64120','DEN','owned', 380,1,'on_ground',        'telemetry', 'high',  'DEN','Departure',           5,  10),
      ('N739AV','B737-800','MSN38455','SEA','leased',2100, 1,'on_ground',        'manual',    'low',   'SEA','Inspection',         14,  40),
      ('G-AVBA','B737 MAX 8','MSN64330','LHR','managed',300,1,'stationed',       'telemetry', 'high',  'LHR','Positioning',        24,  60),
      ('G-AVBB','B737-800','MSN38990','LHR','owned', 1950, 1,'in_air',           'telemetry', 'high',  null, 'Arrival',             1,   2),
      ('D-ABYC','B737 MAX 8','MSN64501','FRA','leased',260,1,'under_maintenance','ops_system','medium','FRA','C-Check',           120,  48),
      ('N175AV','E175',   'MSN17512','MIA','owned',   650, 2,'on_ground',        'telemetry', 'high',  'MIA','Departure',           8,  15),
      ('N176AV','E175',   'MSN17588','JFK','owned',   620, 2,'in_air',           'telemetry', 'high',  null, 'Arrival',             2,   3),
      ('N901AV','CRJ-900','MSN15330','DFW','leased', 1400, 2,'on_ground',        'ops_system','medium','DFW','Departure',          10,  22),
      ('N902AV','CRJ-900','MSN15402','ORD','owned',  1350, 2,'stationed',        'ops_system','medium','ORD','Positioning',        36,  80),
      ('VT-REA','E175',   'MSN17650','BLR','managed',  580, 2,'under_maintenance','ops_system','high', 'BLR','Return to Service',  60,  36),
      ('VT-REB','CRJ-900','MSN15510','DEL','leased', 1250, 2,'on_ground',        'manual',    'medium','DEL','Inspection',         16,  44),
      ('N650AV','G650',   'MSN6220','DXB','owned',    480, 3,'stationed',        'telemetry', 'high',  'DXB','Positioning',        50,  90),
      ('N77XAV','Falcon 7X','MSN0288','DOH','owned', 1600, 3,'in_air',           'telemetry', 'high',  null, 'Arrival',             3,   4),
      ('G-GLBL','Global 7500','MSN70115','LHR','managed',240,3,'on_ground',      'ops_system','high',  'LHR','Departure',          12,  20),
      ('D-CBJX','G650',   'MSN6301','DXB','leased',    700, 3,'unknown',         'manual',    'low',   null, null,               null,  96)
    ) as t(tail, actype, serial, base, ownership, deliv_days, fleet_no, state, source, conf, cur_station, next_evt, until_h, since_h)
  loop
    insert into public.aircraft (
      org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type, delivery_date
    ) values (
      v_org_id, r.tail, r.actype, r.serial, r.base, r.ownership,
      (current_date - (r.deliv_days || ' days')::interval)::date
    )
    returning id into v_ac_id;

    insert into public.fleet_aircraft (fleet_id, aircraft_id)
    values (v_fleet_ids[r.fleet_no], v_ac_id);

    insert into public.aircraft_state (
      aircraft_id, state, state_source, state_confidence, current_station,
      last_transition_at, next_event_at, next_event_type
    ) values (
      v_ac_id, r.state, r.source, r.conf, r.cur_station,
      now() - (r.since_h || ' hours')::interval,
      case when r.until_h is null then null else now() + (r.until_h || ' hours')::interval end,
      r.next_evt
    );
  end loop;

  -- Audit the provisioning event.
  insert into public.audit_events (org_id, actor_user_id, entity_type, entity_id, event_type, event_payload)
  values (v_org_id, p_user_id, 'org', v_org_id, 'org.provisioned',
          jsonb_build_object('fleets', 3, 'aircraft', 24, 'source', 'seed_avir_demo'));

  return v_org_id;
end;
$$;

grant execute on function public.seed_avir_demo(uuid) to authenticated, anon, service_role;
