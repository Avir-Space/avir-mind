-- Pass 2 data + routing fixes.

-- ── Bug C: /inventory/parts/[id] "Part not found" ───────────────────────────
-- get_part_detail threw `operator does not exist: text = text[]`: the demand +
-- compatible_aircraft subqueries used `= any((select compatible_aircraft_types
-- ...))`, which Postgres parses as the SUBQUERY form of ANY (element type) against
-- a text[] value. Rewrite those two to `in (select unnest(...))`.
create or replace function public.get_part_detail(p_part_id uuid)
returns jsonb language plpgsql set search_path to 'public' as $function$
declare v jsonb;
begin
  select jsonb_build_object(
    'part', (select to_jsonb(p) from public.parts p where p.id = p_part_id),
    'holdings', (select coalesce(jsonb_agg(jsonb_build_object(
        'location_id', l.id, 'location_code', l.location_code, 'location_name', l.location_name, 'location_type', l.location_type,
        'quantity_available', h.quantity_available, 'quantity_reserved', h.quantity_reserved, 'quantity_in_transit', h.quantity_in_transit,
        'reorder_point', h.reorder_point, 'below_reorder', (h.reorder_point is not null and h.quantity_available <= h.reorder_point)) order by l.location_code), '[]'::jsonb)
      from public.stock_holdings h join public.stock_locations l on l.id = h.location_id where h.part_id = p_part_id),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object(
        'supplier_id', s.id, 'supplier_name', s.supplier_name, 'supplier_type', s.supplier_type,
        'supplier_part_reference', sp.supplier_part_reference, 'typical_lead_time_days', sp.typical_lead_time_days,
        'typical_unit_price_usd', sp.typical_unit_price_usd, 'minimum_order_quantity', sp.minimum_order_quantity,
        'is_preferred', sp.is_preferred, 'performance_score', s.performance_score) order by sp.is_preferred desc, sp.typical_unit_price_usd), '[]'::jsonb)
      from public.supplier_parts sp join public.suppliers s on s.id = sp.supplier_id where sp.part_id = p_part_id),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'movement_type', m.movement_type, 'quantity', m.quantity, 'movement_date_utc', m.movement_date_utc,
        'reference_number', m.reference_number, 'from_location_id', m.from_location_id, 'to_location_id', m.to_location_id) order by m.movement_date_utc desc), '[]'::jsonb)
      from (select * from public.stock_movements where part_id = p_part_id order by movement_date_utc desc limit 40) m),
    'demand', jsonb_build_object(
      'monthly', (select coalesce(jsonb_agg(jsonb_build_object('month', mm.month, 'consumed', mm.consumed) order by mm.month), '[]'::jsonb)
        from (select to_char(date_trunc('month', movement_date_utc), 'YYYY-MM') as month, sum(quantity) as consumed
              from public.stock_movements where part_id = p_part_id and movement_type = 'consumption'
                and movement_date_utc > now() - interval '12 months' group by 1) mm),
      'predicted_demand', (select count(*) from public.signals sig
        join public.aircraft a on a.id = sig.aircraft_id
        where sig.is_active and sig.signal_class = 'prediction'
          and a.aircraft_type in (select unnest(compatible_aircraft_types) from public.parts where id = p_part_id))),
    'compatible_aircraft', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type) order by a.tail_number), '[]'::jsonb)
      from public.aircraft a where a.aircraft_type in (select unnest(compatible_aircraft_types) from public.parts where id = p_part_id))
  ) into v;
  return v;
end $function$;

-- ── Bug A: Fleet category/risk filters don't narrow the cards ────────────────
-- The board rendered every aircraft regardless of the risk/category chips (those
-- only filtered the `act` tasks CTE, not the aircraft set). Narrow the aircraft
-- to those with a matching active task when a risk/category filter is applied.
create or replace function public.get_fleet_board(
  p_fleet_id uuid default null,
  p_station_codes text[] default null,
  p_aircraft_types text[] default null,
  p_risk_bands text[] default null,
  p_parent_types text[] default null,
  p_search text default null
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_result jsonb;
begin
  with base_ac as (
    select ac.id, ac.tail_number, ac.aircraft_type, ac.base_station,
      st.state, st.current_station,
      case coalesce(st.state, 'unknown')
        when 'under_maintenance' then 'under_maintenance'
        when 'in_air' then 'in_air'
        when 'stationed' then 'stationed'
        else 'on_ground'
      end as grp
    from public.aircraft ac
    left join public.aircraft_state st on st.aircraft_id = ac.id
    where (p_fleet_id is null or exists (
            select 1 from public.fleet_aircraft fa where fa.aircraft_id = ac.id and fa.fleet_id = p_fleet_id))
      and (p_station_codes is null or ac.base_station = any(p_station_codes))
      and (p_aircraft_types is null or ac.aircraft_type = any(p_aircraft_types))
  ),
  act as (
    select t.*, public.task_severity(t.risk_band, t.dispatch_blocking, t.aog) as severity,
      case public.task_severity(t.risk_band, t.dispatch_blocking, t.aog)
        when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end as sev_rank
    from public.tasks t
    where t.status <> 'done'
      and (p_risk_bands is null or t.risk_band = any(p_risk_bands))
      and (p_parent_types is null or t.parent_type = any(p_parent_types))
  ),
  ranked as (
    select a.*, row_number() over (
      partition by a.aircraft_id
      order by a.sev_rank desc, a.dispatch_blocking desc, a.due_at_utc asc nulls last, a.created_at_utc asc
    ) as rn
    from act a
  ),
  cards as (
    select
      b.id as aircraft_id, b.tail_number, b.aircraft_type, b.base_station,
      coalesce(b.current_station, b.base_station) as station_code, b.state, b.grp,
      (select count(*) from act a where a.aircraft_id = b.id) as task_count,
      (select count(*) from act a where a.aircraft_id = b.id and a.risk_band = 'high') as high_count,
      (select count(*) from act a where a.aircraft_id = b.id and a.risk_band = 'medium') as medium_count,
      (select count(*) from act a where a.aircraft_id = b.id and a.risk_band = 'low') as low_count,
      (select bool_or(a.dispatch_blocking) from act a where a.aircraft_id = b.id) as any_blocking,
      (select bool_or(a.aog) from act a where a.aircraft_id = b.id) as any_aog,
      pt.id as pt_id, pt.title as pt_title, pt.why_summary as pt_why, pt.parent_type as pt_parent,
      pt.sub_type as pt_sub, pt.risk_band as pt_risk, pt.severity as pt_severity,
      pt.dispatch_blocking as pt_blocking, pt.aog as pt_aog, pt.facility as pt_facility
    from base_ac b
    left join ranked pt on pt.aircraft_id = b.id and pt.rn = 1
    where (p_search is null or p_search = ''
           or b.tail_number ilike '%' || p_search || '%'
           or exists (select 1 from act a where a.aircraft_id = b.id and a.title ilike '%' || p_search || '%'))
      -- Risk/category chips narrow the aircraft set (act is already filtered).
      and ((p_risk_bands is null and p_parent_types is null)
           or exists (select 1 from act a where a.aircraft_id = b.id))
  ),
  card_json as (
    select c.grp, jsonb_build_object(
      'aircraft_id', c.aircraft_id, 'tail_number', c.tail_number, 'aircraft_type', c.aircraft_type,
      'station_code', c.station_code, 'state', c.state, 'task_count', c.task_count,
      'dispatch_blocking', coalesce(c.any_blocking, false), 'aog', coalesce(c.any_aog, false),
      'severity_summary', jsonb_build_object('high', c.high_count, 'medium', c.medium_count, 'low', c.low_count),
      'primary_task', case when c.pt_id is null then null else jsonb_build_object(
        'task_id', c.pt_id, 'title', c.pt_title, 'why_summary', c.pt_why, 'parent_type', c.pt_parent,
        'sub_type', c.pt_sub, 'risk_band', c.pt_risk, 'severity', c.pt_severity,
        'dispatch_blocking', c.pt_blocking, 'aog', c.pt_aog, 'facility', c.pt_facility,
        'sources', coalesce((select jsonb_agg(jsonb_build_object(
            'source_system', s.source_system, 'source_reference_id', s.source_reference_id, 'source_url', s.source_url))
          from public.task_sources s where s.task_id = c.pt_id), '[]'::jsonb)
      ) end
    ) as card,
    (case when c.pt_severity = 'critical' then 4 when c.pt_severity = 'high' then 3
          when c.pt_severity = 'medium' then 2 when c.pt_severity = 'low' then 1 else 0 end) as card_rank
    from cards c
  )
  select jsonb_build_object(
    'columns', jsonb_build_object(
      'under_maintenance', coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'under_maintenance'), '[]'::jsonb),
      'in_air',           coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'in_air'), '[]'::jsonb),
      'on_ground',        coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'on_ground'), '[]'::jsonb),
      'stationed',        coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'stationed'), '[]'::jsonb)
    ),
    'insights', (
      with a as (select t.* , public.task_severity(t.risk_band,t.dispatch_blocking,t.aog) sev from public.tasks t where t.status <> 'done')
      select jsonb_build_array(
        jsonb_build_object('category','dispatch','severity','critical','title','Dispatch Blocking',
          'one_liner', (select count(*) from a where a.dispatch_blocking)::text || ' active blocking tasks'
            || coalesce(', concentrated at ' || (select station_code from a where a.dispatch_blocking group by station_code order by count(*) desc limit 1), ''),
          'aircraft_count', (select count(distinct aircraft_id) from a where a.dispatch_blocking)),
        jsonb_build_object('category','risk','severity','high','title','High Risk Cluster',
          'one_liner', (select count(*) from (select aircraft_id from a where a.risk_band='high' group by aircraft_id having count(*) >= 2) z)::text || ' aircraft with 2+ high-risk tasks',
          'aircraft_count', (select count(*) from (select aircraft_id from a where a.risk_band='high' group by aircraft_id having count(*) >= 2) z)),
        jsonb_build_object('category','tail','severity','medium','title','Tail Requires Attention',
          'one_liner', coalesce((select ac.tail_number || ' — ' || count(*)::text || ' active tasks' from a join public.aircraft ac on ac.id=a.aircraft_id group by ac.tail_number order by count(*) desc limit 1), 'No active tasks'),
          'aircraft_count', 1),
        jsonb_build_object('category','station','severity','info','title','Station Workload',
          'one_liner', coalesce((select station_code || ' — ' || count(*)::text || ' active tasks' from a where station_code is not null group by station_code order by count(*) desc limit 1), 'No active work'),
          'aircraft_count', (select count(distinct aircraft_id) from a where station_code = (select station_code from a where station_code is not null group by station_code order by count(*) desc limit 1)))
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── Bug I: weather_impact signals had empty evidence_refs = {} ───────────────
update public.signals sg
  set evidence_refs = jsonb_build_object(
    'primary', jsonb_build_array(jsonb_build_object(
      'type', 'weather',
      'reference', coalesce((select f.destination_station from public.flights f
                             where f.aircraft_id = sg.aircraft_id and f.scheduled_departure_utc > now()
                             order by f.scheduled_departure_utc limit 1), 'N/A'),
      'summary', sg.title)))
  where sg.category = 'weather_impact'
    and coalesce(sg.evidence_refs, '{}'::jsonb) = '{}'::jsonb;

-- ── Bug H: seed dispatch releases + crew assignments for upcoming flights ────
do $$
declare v_org uuid; r record; n int; v_cap uuid; v_fo uuid;
begin
  for v_org in select id from public.orgs where primary_business_model in ('operator', 'hybrid') loop
    n := 0;
    for r in
      select f.id from public.flights f
      where f.org_id = v_org and f.scheduled_departure_utc > now()
        and not exists (select 1 from public.dispatch_releases d where d.flight_id = f.id)
      order by f.scheduled_departure_utc limit 5
    loop
      insert into public.dispatch_releases (org_id, flight_id, release_number, released_at_utc, status,
        fuel_plan, weight_and_balance, performance_data)
      values (v_org, r.id, 'DR-' || upper(substr(r.id::text, 1, 8)), now(), 'pending_captain',
        jsonb_build_object('trip_kg', 8200, 'contingency_kg', 400, 'alternate_kg', 900, 'final_reserve_kg', 600, 'taxi_kg', 150, 'block_kg', 10250),
        jsonb_build_object('zfw_kg', 52000, 'tow_kg', 68000, 'ldw_kg', 60000, 'cg_pct_mac', 27.5),
        jsonb_build_object('v1', 142, 'vr', 148, 'v2', 152, 'todr_m', 1850, 'ldr_m', 1420));

      select id into v_cap from public.crew_members where org_id = v_org and role = 'captain' order by employee_id offset (n % 8) limit 1;
      select id into v_fo from public.crew_members where org_id = v_org and role = 'first_officer' order by employee_id offset (n % 8) limit 1;
      if v_cap is not null then
        insert into public.assignments (org_id, crew_member_id, flight_schedule_id, role_on_flight, assignment_status, assigned_at_utc)
        values (v_org, v_cap, r.id, 'pic', 'assigned', now()) on conflict do nothing;
      end if;
      if v_fo is not null then
        insert into public.assignments (org_id, crew_member_id, flight_schedule_id, role_on_flight, assignment_status, assigned_at_utc)
        values (v_org, v_fo, r.id, 'sic', 'assigned', now()) on conflict do nothing;
      end if;
      n := n + 1;
    end loop;
  end loop;
end $$;
