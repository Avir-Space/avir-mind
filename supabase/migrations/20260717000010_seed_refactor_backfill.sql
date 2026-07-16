-- 0110: extract task seeding into a reusable, idempotent function and have
-- seed_avir_demo call it. This also lets us BACKFILL tasks for any org that was
-- provisioned before Phase 1 existed (e.g. accounts created during Phase 0).

-- ── seed_demo_tasks(org, user) — idempotent task generator for an org ─────────
create or replace function public.seed_demo_tasks(p_org_id uuid, p_user_id uuid)
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_parents text[]; v_subs text[]; v_displays text[]; v_catalog_n int;
  v_facilities text[] := array['Hangar 3','Line Maintenance','Ramp E','Bay 12','Component Shop','Avionics Lab','MRO Dock 2'];
  v_comments text[] := array['Parts ordered, ETA 2 days.','Coordinating with line maintenance.','Awaiting engineering disposition.',
    'Deferred per MEL, monitoring.','Borescope scheduled for next RON.','Vendor contacted for warranty review.',
    'Reviewed with the duty engineer.','Escalated to the maintenance controller.'];
  ac record; v_count int; i int; v_k int; v_rnd double precision;
  v_status text; v_active boolean; v_risk text; v_blocking boolean; v_aog boolean; v_aog_ct int;
  v_src text; v_ref text; v_url text; v_created timestamptz; v_due timestamptz; v_started timestamptz;
  v_assignee uuid; v_station text; v_facility text; v_display text; v_parent text; v_sub text;
  v_title text; v_why text; v_task_id uuid; v_ac_is_aog boolean; v_rank numeric := 0;
begin
  if p_org_id is null or p_user_id is null then
    raise exception 'seed_demo_tasks: org and user are required';
  end if;
  -- Idempotent: never double-seed tasks for an org.
  if exists (select 1 from public.tasks where org_id = p_org_id) then
    return 0;
  end if;

  select array_agg(parent_type order by parent_type,sort_rank), array_agg(sub_type order by parent_type,sort_rank),
         array_agg(display_name order by parent_type,sort_rank)
    into v_parents, v_subs, v_displays from public.task_type_catalog where active;
  v_catalog_n := array_length(v_parents,1);

  for ac in
    select a.id,a.tail_number,a.aircraft_type,a.base_station,s.current_station,s.next_event_type
    from public.aircraft a join public.aircraft_state s on s.aircraft_id=a.id where a.org_id=p_org_id
  loop
    v_count := 5 + floor(random()*6);                    -- 5-10 baseline (centers total ~200)
    if random() < 0.18 then v_count := v_count + 6 + floor(random()*10); end if; -- heavy tails (15+)
    if random() < 0.15 then v_count := 2 + floor(random()*2); end if;            -- light tails (2-3)
    v_ac_is_aog := (ac.next_event_type = 'AOG Recovery');
    v_aog_ct := 0;

    for i in 1..v_count loop
      v_k := 1 + floor(random()*v_catalog_n);
      v_parent := v_parents[v_k]; v_sub := v_subs[v_k]; v_display := v_displays[v_k];

      v_rnd := random();
      v_status := case when v_rnd<0.25 then 'queued' when v_rnd<0.42 then 'in_progress'
        when v_rnd<0.49 then 'blocked' when v_rnd<0.61 then 'monitoring' else 'done' end;
      v_active := v_status <> 'done';
      v_rnd := random();
      v_risk := case when v_rnd<0.08 then 'high' when v_rnd<0.43 then 'medium' else 'low' end;
      v_blocking := v_active and random() < 0.09;

      v_aog := false;
      if v_ac_is_aog and (i <= 2 or (v_active and random() < 0.4)) then
        v_aog := true; v_aog_ct := v_aog_ct + 1;
        v_status := case when v_status in ('done','queued') then 'in_progress' else v_status end;
        v_active := true; v_risk := 'high'; v_blocking := true;
      end if;

      v_rnd := random();
      v_src := case when v_rnd<0.35 then 'amos' when v_rnd<0.55 then 'trax' when v_rnd<0.70 then 'sap' when v_rnd<0.85 then 'fr' else 'avir' end;
      v_ref := upper(v_src)||'-'||lpad((floor(random()*900000)+1000)::int::text,6,'0');
      v_url := 'https://'||v_src||'.example.com/ref/'||v_ref;

      v_created := now() - make_interval(days=>floor(random()*30)::int, hours=>floor(random()*24)::int);
      v_due := case when v_active then now()+make_interval(hours=>(floor(random()*336)-48)::int) else null end;
      v_started := case when v_status in ('in_progress','monitoring','blocked') then v_created+make_interval(hours=>floor(random()*24)::int) else null end;
      v_assignee := case when v_active and random()<0.4 then p_user_id else null end;
      v_station := coalesce(ac.current_station, ac.base_station);
      v_facility := v_facilities[1+floor(random()*array_length(v_facilities,1))];
      v_title := v_display||' — '||ac.tail_number;
      v_why := case v_parent
        when 'powerplant' then 'Engine parameter trend requires inspection before next dispatch.'
        when 'avionics' then 'Recurring avionics fault flagged across recent legs.'
        when 'structures' then 'Structural check triggered by a recorded event.'
        when 'landing_gear' then 'Landing gear component approaching a service limit.'
        when 'interior' then 'Cabin item reported unserviceable by crew.'
        when 'flight_ops' then 'Operational discrepancy logged on a recent sector.'
        when 'crew' then 'Crew record requires reconciliation before assignment.'
        when 'compliance' then 'Regulatory item due for evaluation and sign-off.'
        when 'inventory' then 'Parts availability risk detected for planned work.'
        else 'Ground event reported at station requiring follow-up.' end;
      v_rank := v_rank + 1;

      insert into public.tasks (org_id,aircraft_id,title,why_summary,parent_type,sub_type,status,risk_band,
        dispatch_blocking,aog,station_code,facility,due_at_utc,started_at_utc,assignee_user_id,reporter_user_id,board_rank,created_at_utc,updated_at_utc)
      values (p_org_id,ac.id,v_title,v_why,v_parent,v_sub,v_status,v_risk,v_blocking,v_aog,v_station,v_facility,v_due,v_started,
        v_assignee,p_user_id,v_rank,v_created,v_created) returning id into v_task_id;

      insert into public.task_sources (task_id,source_system,source_reference_id,source_url,first_seen_at_utc,last_seen_at_utc)
      values (v_task_id,v_src,v_ref,v_url,v_created,v_created);
      insert into public.task_events (org_id,task_id,actor_user_id,event_type,event_payload,created_at_utc)
      values (p_org_id,v_task_id,p_user_id,'task_created',jsonb_build_object('title',v_title,'source_system',v_src),v_created);
      if v_assignee is not null then
        insert into public.task_events (org_id,task_id,actor_user_id,event_type,event_payload,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,'assigned',jsonb_build_object('to',v_assignee),v_created+interval '1 hour');
      end if;
      if v_status <> 'queued' then
        insert into public.task_events (org_id,task_id,actor_user_id,event_type,event_payload,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,'status_change',jsonb_build_object('from','queued','to',case when v_status='done' then 'in_progress' else v_status end),v_created+interval '2 hours');
      end if;
      if v_status = 'done' then
        insert into public.task_events (org_id,task_id,actor_user_id,event_type,event_payload,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,'status_change',jsonb_build_object('from','in_progress','to','done'),v_created+interval '1 day');
      end if;
      if random() < 0.70 then
        insert into public.task_events (org_id,task_id,actor_user_id,event_type,body,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,'comment',v_comments[1+floor(random()*array_length(v_comments,1))],v_created+interval '5 hours');
      end if;
      if v_active and random() < 0.30 then
        insert into public.task_acknowledgements (task_id,user_id,acknowledged_at_utc)
        values (v_task_id,p_user_id,v_created+interval '3 hours') on conflict do nothing;
        insert into public.task_events (org_id,task_id,actor_user_id,event_type,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,'acknowledged',v_created+interval '3 hours');
      end if;
      if v_status in ('in_progress','done') and random() < 0.22 then
        insert into public.task_work_logs (org_id,task_id,user_id,time_spent_minutes,description,work_date,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,(floor(random()*8)+1)*30,'Work performed per task scope.',(v_created+interval '6 hours')::date,v_created+interval '6 hours');
        insert into public.task_events (org_id,task_id,actor_user_id,event_type,event_payload,created_at_utc)
        values (p_org_id,v_task_id,p_user_id,'work_logged',jsonb_build_object('minutes',(floor(random()*8)+1)*30),v_created+interval '6 hours');
      end if;
    end loop;
  end loop;

  insert into public.audit_events (org_id,actor_user_id,entity_type,entity_id,event_type,event_payload)
  values (p_org_id,p_user_id,'org',p_org_id,'tasks.seeded',jsonb_build_object('task_count',(select count(*) from public.tasks where org_id=p_org_id)));

  return (select count(*)::int from public.tasks where org_id = p_org_id);
end;
$$;

grant execute on function public.seed_demo_tasks(uuid, uuid) to service_role;

-- ── seed_avir_demo now delegates task seeding to seed_demo_tasks ──────────────
create or replace function public.seed_avir_demo(p_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org_id uuid; v_email text; v_org_name text;
  v_fleet_ids uuid[] := array[]::uuid[]; v_fleet_id uuid; v_ac_id uuid; r record;
begin
  if p_user_id is null then raise exception 'seed_avir_demo: p_user_id is required'; end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'seed_avir_demo: may only seed the calling user'; end if;

  select m.org_id into v_org_id from public.org_members m where m.user_id = p_user_id limit 1;
  if v_org_id is not null then return v_org_id; end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  v_org_name := coalesce(nullif(initcap(split_part(v_email,'@',1)) || ' Operations',' Operations'),'AVIR Demo Airline');
  insert into public.orgs (name, plan) values (v_org_name,'free') returning id into v_org_id;
  insert into public.org_members (org_id, user_id, role) values (v_org_id, p_user_id, 'owner');

  insert into public.fleets (org_id,name,aircraft_type_focus) values (v_org_id,'Fleet 1 — Narrowbody','A320 / B737 family') returning id into v_fleet_id;
  v_fleet_ids[1] := v_fleet_id;
  insert into public.fleets (org_id,name,aircraft_type_focus) values (v_org_id,'Fleet 2 — Regional','E175 / CRJ-900') returning id into v_fleet_id;
  v_fleet_ids[2] := v_fleet_id;
  insert into public.fleets (org_id,name,aircraft_type_focus) values (v_org_id,'Fleet 3 — Business Jets','G650 / Falcon 7X / Global 7500') returning id into v_fleet_id;
  v_fleet_ids[3] := v_fleet_id;

  for r in
    select * from (values
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
    insert into public.aircraft (org_id,tail_number,aircraft_type,serial_number,base_station,ownership_type,delivery_date)
    values (v_org_id,r.tail,r.actype,r.serial,r.base,r.ownership,(current_date-(r.deliv_days||' days')::interval)::date)
    returning id into v_ac_id;
    insert into public.fleet_aircraft (fleet_id,aircraft_id) values (v_fleet_ids[r.fleet_no],v_ac_id);
    insert into public.aircraft_state (aircraft_id,state,state_source,state_confidence,current_station,last_transition_at,next_event_at,next_event_type)
    values (v_ac_id,r.state,r.source,r.conf,r.cur_station,now()-(r.since_h||' hours')::interval,
      case when r.until_h is null then null else now()+(r.until_h||' hours')::interval end,r.next_evt);
  end loop;

  insert into public.audit_events (org_id,actor_user_id,entity_type,entity_id,event_type,event_payload)
  values (v_org_id,p_user_id,'org',v_org_id,'org.provisioned',jsonb_build_object('fleets',3,'aircraft',24,'source','seed_avir_demo'));

  perform public.seed_demo_tasks(v_org_id, p_user_id);

  return v_org_id;
end;
$$;
