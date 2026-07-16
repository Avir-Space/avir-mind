-- Phase 5 — inventory + asset RPCs.

-- Shared: apply signed deltas to a holding (upsert, clamped at 0).
create or replace function public.adjust_holding(p_org uuid, p_part uuid, p_loc uuid, d_avail int, d_res int, d_transit int)
returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into public.stock_holdings (org_id, part_id, location_id, quantity_available, quantity_reserved, quantity_in_transit)
  values (p_org, p_part, p_loc, greatest(d_avail, 0), greatest(d_res, 0), greatest(d_transit, 0))
  on conflict (org_id, part_id, location_id) do update set
    quantity_available = greatest(public.stock_holdings.quantity_available + d_avail, 0),
    quantity_reserved  = greatest(public.stock_holdings.quantity_reserved + d_res, 0),
    quantity_in_transit = greatest(public.stock_holdings.quantity_in_transit + d_transit, 0),
    last_received_at_utc = case when d_avail > 0 then now() else public.stock_holdings.last_received_at_utc end,
    last_consumed_at_utc = case when d_avail < 0 then now() else public.stock_holdings.last_consumed_at_utc end,
    updated_at_utc = now();
end $$;

create or replace function public.upsert_part(p_attrs jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;
  insert into public.parts (org_id, part_number, manufacturer, description, category, unit_of_measure,
    shelf_life_days, storage_conditions, hazmat_class, ata_chapter, compatible_aircraft_types,
    compatible_component_types, alternative_part_numbers, current_price_usd, typical_lead_time_days, criticality)
  values (v_org, p_attrs->>'part_number', p_attrs->>'manufacturer', p_attrs->>'description', p_attrs->>'category',
    coalesce(p_attrs->>'unit_of_measure', 'each'), (p_attrs->>'shelf_life_days')::int, p_attrs->>'storage_conditions',
    p_attrs->>'hazmat_class', p_attrs->>'ata_chapter',
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_attrs->'compatible_aircraft_types', '[]'::jsonb)) x),
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_attrs->'compatible_component_types', '[]'::jsonb)) x),
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_attrs->'alternative_part_numbers', '[]'::jsonb)) x),
    (p_attrs->>'current_price_usd')::numeric, (p_attrs->>'typical_lead_time_days')::int, p_attrs->>'criticality')
  on conflict (org_id, part_number, manufacturer) do update set
    description = excluded.description, category = excluded.category, current_price_usd = excluded.current_price_usd,
    typical_lead_time_days = excluded.typical_lead_time_days, criticality = excluded.criticality, updated_at_utc = now()
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.upsert_part(jsonb) to authenticated;

create or replace function public.record_stock_movement(
  p_part_id uuid, p_movement_type text, p_quantity int,
  p_from_location uuid default null, p_to_location uuid default null, p_attrs jsonb default '{}'::jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.parts where id = p_part_id;
  insert into public.stock_movements (org_id, part_id, from_location_id, to_location_id, movement_type, quantity,
    linked_task_id, linked_component_event_id, reference_number, unit_cost_usd, performed_by_user_id, notes)
  values (v_org, p_part_id, p_from_location, p_to_location, p_movement_type, p_quantity,
    (p_attrs->>'linked_task_id')::uuid, (p_attrs->>'linked_component_event_id')::uuid, p_attrs->>'reference_number',
    (p_attrs->>'unit_cost_usd')::numeric, auth.uid(), p_attrs->>'notes')
  returning id into v_id;

  if p_movement_type in ('receipt', 'return') then
    perform public.adjust_holding(v_org, p_part_id, p_to_location, p_quantity, 0, 0);
  elsif p_movement_type in ('issue', 'scrap') then
    perform public.adjust_holding(v_org, p_part_id, p_from_location, -p_quantity, 0, 0);
  elsif p_movement_type = 'adjustment' then
    perform public.adjust_holding(v_org, p_part_id, coalesce(p_to_location, p_from_location), p_quantity, 0, 0);
  end if;
  return v_id;
end $$;
grant execute on function public.record_stock_movement(uuid, text, int, uuid, uuid, jsonb) to authenticated;

create or replace function public.transfer_stock(p_part_id uuid, p_from uuid, p_to uuid, p_quantity int, p_reference text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.parts where id = p_part_id;
  insert into public.stock_movements (org_id, part_id, from_location_id, to_location_id, movement_type, quantity, reference_number, performed_by_user_id)
  values (v_org, p_part_id, p_from, p_to, 'transfer', p_quantity, p_reference, auth.uid()) returning id into v_id;
  perform public.adjust_holding(v_org, p_part_id, p_from, -p_quantity, 0, 0);
  perform public.adjust_holding(v_org, p_part_id, p_to, p_quantity, 0, 0);
  return v_id;
end $$;
grant execute on function public.transfer_stock(uuid, uuid, uuid, int, text) to authenticated;

create or replace function public.reserve_stock(p_part_id uuid, p_location uuid, p_quantity int, p_task_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.parts where id = p_part_id;
  insert into public.stock_movements (org_id, part_id, from_location_id, movement_type, quantity, linked_task_id, performed_by_user_id)
  values (v_org, p_part_id, p_location, 'reservation', p_quantity, p_task_id, auth.uid()) returning id into v_id;
  perform public.adjust_holding(v_org, p_part_id, p_location, 0, p_quantity, 0);
  return v_id;
end $$;
grant execute on function public.reserve_stock(uuid, uuid, int, uuid) to authenticated;

create or replace function public.unreserve_stock(p_part_id uuid, p_location uuid, p_quantity int, p_task_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.parts where id = p_part_id;
  insert into public.stock_movements (org_id, part_id, from_location_id, movement_type, quantity, linked_task_id, performed_by_user_id)
  values (v_org, p_part_id, p_location, 'unreservation', p_quantity, p_task_id, auth.uid()) returning id into v_id;
  perform public.adjust_holding(v_org, p_part_id, p_location, 0, -p_quantity, 0);
  return v_id;
end $$;
grant execute on function public.unreserve_stock(uuid, uuid, int, uuid) to authenticated;

create or replace function public.consume_stock(p_part_id uuid, p_location uuid, p_quantity int, p_task_id uuid default null, p_component_event_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.parts where id = p_part_id;
  insert into public.stock_movements (org_id, part_id, from_location_id, movement_type, quantity, linked_task_id, linked_component_event_id, performed_by_user_id)
  values (v_org, p_part_id, p_location, 'consumption', p_quantity, p_task_id, p_component_event_id, auth.uid()) returning id into v_id;
  perform public.adjust_holding(v_org, p_part_id, p_location, -p_quantity, -p_quantity, 0);
  return v_id;
end $$;
grant execute on function public.consume_stock(uuid, uuid, int, uuid, uuid) to authenticated;

create or replace function public.record_asset_event(p_asset_id uuid, p_event_type text, p_event_date date, p_attrs jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.assets where id = p_asset_id;
  insert into public.asset_events (org_id, asset_id, event_type, event_date, performed_by, from_location_id, to_location_id,
    cost_usd, documentation_reference, linked_task_id, event_payload)
  values (v_org, p_asset_id, p_event_type, p_event_date, p_attrs->>'performed_by', (p_attrs->>'from_location_id')::uuid,
    (p_attrs->>'to_location_id')::uuid, (p_attrs->>'cost_usd')::numeric, p_attrs->>'documentation_reference',
    (p_attrs->>'linked_task_id')::uuid, p_attrs->'event_payload')
  returning id into v_id;

  update public.assets set
    current_status = case p_event_type
      when 'retired' then 'retired' when 'damaged' then 'out_of_service'
      when 'serviced' then 'in_service' when 'repaired' then 'in_service'
      when 'calibrated' then 'in_service' else current_status end,
    calibration_due_date = case when p_event_type = 'calibrated' then (p_event_date + interval '365 days')::date else calibration_due_date end,
    next_service_due_date = case when p_event_type = 'serviced' then (p_event_date + interval '180 days')::date else next_service_due_date end,
    location_id = coalesce((p_attrs->>'to_location_id')::uuid, location_id),
    updated_at_utc = now()
  where id = p_asset_id;
  return v_id;
end $$;
grant execute on function public.record_asset_event(uuid, text, date, jsonb) to authenticated;

-- ── Read models ──────────────────────────────────────────────────────────────

create or replace function public.get_parts_by_component_compatibility(p_component_type text)
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.criticality, p.part_number), '[]'::jsonb)
  from (
    select id, part_number, manufacturer, description, category, criticality, current_price_usd, typical_lead_time_days,
      (select coalesce(sum(quantity_available), 0) from public.stock_holdings h where h.part_id = parts.id) as total_available
    from public.parts where p_component_type = any(compatible_component_types)
  ) p;
$$;
grant execute on function public.get_parts_by_component_compatibility(text) to authenticated;

create or replace function public.get_low_stock_alerts()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.shortfall desc), '[]'::jsonb)
  from (
    select h.id as holding_id, h.part_id, p.part_number, p.description, p.criticality, p.typical_lead_time_days,
      l.id as location_id, l.location_code, l.location_name, h.quantity_available, h.quantity_reserved, h.reorder_point,
      (h.reorder_point - h.quantity_available) as shortfall,
      (select count(*) from public.stock_movements m where m.part_id = h.part_id and m.movement_type = 'consumption'
        and m.movement_date_utc > now() - interval '30 days') as consumed_30d,
      case when (select count(*) from public.stock_movements m where m.part_id = h.part_id and m.movement_type = 'consumption'
        and m.movement_date_utc > now() - interval '30 days') > 0
        then round(h.quantity_available::numeric / greatest((select count(*)::numeric / 30 from public.stock_movements m
          where m.part_id = h.part_id and m.movement_type = 'consumption' and m.movement_date_utc > now() - interval '30 days'), 0.01), 1)
        else null end as days_of_cover
    from public.stock_holdings h
    join public.parts p on p.id = h.part_id
    join public.stock_locations l on l.id = h.location_id
    where h.reorder_point is not null and h.quantity_available <= h.reorder_point
  ) x;
$$;
grant execute on function public.get_low_stock_alerts() to authenticated;

create or replace function public.get_stock_transfer_suggestions()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.qty desc), '[]'::jsonb)
  from (
    select distinct on (low.part_id, low.location_id)
      low.part_id, p.part_number, p.description,
      low.location_id as to_location_id, ll.location_code as to_location_code,
      sur.location_id as from_location_id, sl.location_code as from_location_code,
      least(low.reorder_point - low.quantity_available + coalesce(low.reorder_point, 0),
            sur.quantity_available - coalesce(sur.reorder_point, 0)) as qty,
      sur.quantity_available as from_available, low.quantity_available as to_available, low.reorder_point as to_reorder,
      format('Move stock from %s (surplus: %s available) to %s (below reorder: %s of %s) — %s',
        sl.location_code, sur.quantity_available, ll.location_code, low.quantity_available, low.reorder_point, p.description) as reasoning
    from public.stock_holdings low
    join public.parts p on p.id = low.part_id
    join public.stock_locations ll on ll.id = low.location_id
    join public.stock_holdings sur on sur.part_id = low.part_id and sur.location_id <> low.location_id
    join public.stock_locations sl on sl.id = sur.location_id
    where low.reorder_point is not null and low.quantity_available <= low.reorder_point
      and sur.quantity_available > coalesce(sur.reorder_point, 0) + 5
    order by low.part_id, low.location_id, sur.quantity_available desc
  ) s;
$$;
grant execute on function public.get_stock_transfer_suggestions() to authenticated;

create or replace function public.get_asset_service_calendar(p_days int default 90)
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date), '[]'::jsonb)
  from (
    select a.id, a.asset_tag, a.asset_name, a.asset_type, a.current_status, a.assigned_to_station,
      a.calibration_due_date, a.next_service_due_date,
      least(coalesce(a.calibration_due_date, 'infinity'::date), coalesce(a.next_service_due_date, 'infinity'::date)) as due_date,
      case when a.calibration_due_date is not null and (a.next_service_due_date is null or a.calibration_due_date <= a.next_service_due_date)
        then 'calibration' else 'service' end as due_type
    from public.assets a
    where (a.calibration_due_date is not null and a.calibration_due_date <= (now() + (p_days || ' days')::interval)::date)
       or (a.next_service_due_date is not null and a.next_service_due_date <= (now() + (p_days || ' days')::interval)::date)
  ) x;
$$;
grant execute on function public.get_asset_service_calendar(int) to authenticated;

create or replace function public.get_supplier_performance()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.performance_score desc nulls last), '[]'::jsonb)
  from (
    select s.id, s.supplier_name, s.supplier_type, s.approved_status, s.performance_score, s.typical_lead_time_days,
      s.last_order_at_utc, s.primary_contact_name, s.primary_contact_email,
      (select count(*) from public.supplier_parts sp where sp.supplier_id = s.id) as part_count,
      (select count(*) from public.supplier_parts sp where sp.supplier_id = s.id and sp.is_preferred) as preferred_count
    from public.suppliers s
  ) x;
$$;
grant execute on function public.get_supplier_performance() to authenticated;
