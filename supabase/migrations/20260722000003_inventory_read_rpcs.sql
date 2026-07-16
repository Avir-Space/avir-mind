-- Phase 5 — inventory read models for the frontend.

create or replace function public.get_inventory_dashboard()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_transfers int;
  v_supplier_risk int;
  v_accel int;
  v_moves int;
begin
  v_transfers := jsonb_array_length(public.get_stock_transfer_suggestions());
  select count(*) into v_supplier_risk from public.suppliers where performance_score is not null and performance_score < 70;
  select count(distinct m.part_id) into v_accel from public.stock_movements m
    where m.movement_type = 'consumption' and m.movement_date_utc > now() - interval '14 days';
  select count(*) into v_moves from public.stock_movements;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'total_skus', (select count(*) from public.parts),
      'total_value', (select coalesce(round(sum(h.quantity_available * coalesce(p.current_price_usd, 0))), 0)
                      from public.stock_holdings h join public.parts p on p.id = h.part_id),
      'low_stock_count', (select count(*) from public.stock_holdings where reorder_point is not null and quantity_available <= reorder_point),
      'reorder_count', (select count(distinct part_id) from public.stock_holdings where reorder_point is not null and quantity_available <= reorder_point)
    ),
    'insights', jsonb_build_array(
      jsonb_build_object('category', 'consumption', 'severity', 'medium', 'title', 'Accelerating consumption',
        'one_liner', v_accel || ' part' || case when v_accel = 1 then '' else 's' end || ' consumed in the last 14 days — watch for reorder pressure.'),
      jsonb_build_object('category', 'transfer', 'severity', 'info', 'title', 'Transfer opportunities',
        'one_liner', v_transfers || ' part' || case when v_transfers = 1 then '' else 's' end || ' have surplus at one hub and shortage at another.'),
      jsonb_build_object('category', 'supplier', 'severity', case when v_supplier_risk > 0 then 'high' else 'low' end, 'title', 'Supplier risk',
        'one_liner', v_supplier_risk || ' supplier' || case when v_supplier_risk = 1 then '' else 's' end || ' below the 70 performance threshold.'),
      case when v_moves = 0
        then jsonb_build_object('category', 'insufficient_data', 'severity', 'insufficient_data', 'title', 'Insufficient data',
          'one_liner', 'No stock movements yet — consumption trends will populate as parts are issued.')
        else jsonb_build_object('category', 'coverage', 'severity', 'info', 'title', 'Movement history',
          'one_liner', v_moves || ' stock movements on record across the last 90 days.') end
    )
  );
end $$;
grant execute on function public.get_inventory_dashboard() to authenticated;

create or replace function public.get_parts_overview()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.part_number), '[]'::jsonb)
  from (
    select p.id, p.part_number, p.manufacturer, p.description, p.category, p.criticality, p.unit_of_measure,
      p.current_price_usd, p.ata_chapter,
      coalesce((select sum(h.quantity_available) from public.stock_holdings h where h.part_id = p.id), 0) as total_available,
      coalesce((select sum(h.quantity_reserved) from public.stock_holdings h where h.part_id = p.id), 0) as total_reserved,
      (select count(*) from public.stock_holdings h where h.part_id = p.id) as location_count,
      exists (select 1 from public.stock_holdings h where h.part_id = p.id and h.reorder_point is not null and h.quantity_available <= h.reorder_point) as below_reorder,
      coalesce(round((select sum(h.quantity_available) from public.stock_holdings h where h.part_id = p.id) * coalesce(p.current_price_usd, 0)), 0) as total_value
    from public.parts p
  ) x;
$$;
grant execute on function public.get_parts_overview() to authenticated;

create or replace function public.get_part_detail(p_part_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
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
          and a.aircraft_type = any((select compatible_aircraft_types from public.parts where id = p_part_id)))),
    'compatible_aircraft', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type) order by a.tail_number), '[]'::jsonb)
      from public.aircraft a where a.aircraft_type = any((select compatible_aircraft_types from public.parts where id = p_part_id)))
  ) into v;
  return v;
end $$;
grant execute on function public.get_part_detail(uuid) to authenticated;

create or replace function public.get_supplier_detail(p_supplier_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'supplier', (select to_jsonb(s) from public.suppliers s where s.id = p_supplier_id),
    'parts', (select coalesce(jsonb_agg(jsonb_build_object(
        'part_id', p.id, 'part_number', p.part_number, 'description', p.description, 'category', p.category, 'criticality', p.criticality,
        'supplier_part_reference', sp.supplier_part_reference, 'typical_unit_price_usd', sp.typical_unit_price_usd,
        'typical_lead_time_days', sp.typical_lead_time_days, 'is_preferred', sp.is_preferred, 'last_price_usd', sp.last_price_usd) order by p.part_number), '[]'::jsonb)
      from public.supplier_parts sp join public.parts p on p.id = sp.part_id where sp.supplier_id = p_supplier_id),
    'part_count', (select count(*) from public.supplier_parts where supplier_id = p_supplier_id)
  ) into v;
  return v;
end $$;
grant execute on function public.get_supplier_detail(uuid) to authenticated;

create or replace function public.get_location_detail(p_location_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'location', (select to_jsonb(l) from public.stock_locations l where l.id = p_location_id),
    'holdings', (select coalesce(jsonb_agg(jsonb_build_object(
        'part_id', p.id, 'part_number', p.part_number, 'description', p.description, 'criticality', p.criticality,
        'quantity_available', h.quantity_available, 'quantity_reserved', h.quantity_reserved, 'reorder_point', h.reorder_point,
        'value', round(h.quantity_available * coalesce(p.current_price_usd, 0)),
        'below_reorder', (h.reorder_point is not null and h.quantity_available <= h.reorder_point)) order by p.part_number), '[]'::jsonb)
      from public.stock_holdings h join public.parts p on p.id = h.part_id where h.location_id = p_location_id),
    'movements', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'movement_type', m.movement_type, 'quantity', m.quantity,
        'part_id', m.part_id, 'movement_date_utc', m.movement_date_utc) order by m.movement_date_utc desc), '[]'::jsonb)
      from (select * from public.stock_movements where from_location_id = p_location_id or to_location_id = p_location_id order by movement_date_utc desc limit 30) m),
    'assets', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'asset_tag', a.asset_tag, 'asset_name', a.asset_name,
        'asset_type', a.asset_type, 'current_status', a.current_status) order by a.asset_tag), '[]'::jsonb)
      from public.assets a where a.location_id = p_location_id),
    'total_value', (select coalesce(round(sum(h.quantity_available * coalesce(p.current_price_usd, 0))), 0)
      from public.stock_holdings h join public.parts p on p.id = h.part_id where h.location_id = p_location_id)
  ) into v;
  return v;
end $$;
grant execute on function public.get_location_detail(uuid) to authenticated;
