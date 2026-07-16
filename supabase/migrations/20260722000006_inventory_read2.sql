-- Phase 5 — additional inventory read models.

create or replace function public.get_locations_overview()
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.location_code), '[]'::jsonb)
  from (
    select l.id, l.location_code, l.location_name, l.location_type, l.station_code, l.climate_controlled, l.hazmat_certified, l.is_active,
      (select count(*) from public.stock_holdings h where h.location_id = l.id) as part_count,
      (select coalesce(round(sum(h.quantity_available * coalesce(p.current_price_usd, 0))), 0)
        from public.stock_holdings h join public.parts p on p.id = h.part_id where h.location_id = l.id) as total_value,
      (select count(*) from public.stock_holdings h where h.location_id = l.id and h.reorder_point is not null and h.quantity_available <= h.reorder_point) as low_stock_count,
      (select count(*) from public.assets a where a.location_id = l.id) as asset_count
    from public.stock_locations l
  ) x;
$$;
grant execute on function public.get_locations_overview() to authenticated;

create or replace function public.get_recent_movements(p_limit int default 100)
returns jsonb language sql security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.movement_date_utc desc), '[]'::jsonb)
  from (
    select m.id, m.movement_type, m.quantity, m.movement_date_utc, m.reference_number, m.part_id,
      p.part_number, p.description, fl.location_code as from_code, tl.location_code as to_code
    from public.stock_movements m
    join public.parts p on p.id = m.part_id
    left join public.stock_locations fl on fl.id = m.from_location_id
    left join public.stock_locations tl on tl.id = m.to_location_id
    order by m.movement_date_utc desc limit greatest(p_limit, 1)
  ) x;
$$;
grant execute on function public.get_recent_movements(int) to authenticated;

create or replace function public.get_asset_detail(p_asset_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'asset', (select to_jsonb(a) from public.assets a where a.id = p_asset_id),
    'location', (select jsonb_build_object('id', l.id, 'location_code', l.location_code, 'location_name', l.location_name)
                 from public.assets a join public.stock_locations l on l.id = a.location_id where a.id = p_asset_id),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.event_date desc, e.created_at_utc desc), '[]'::jsonb)
               from public.asset_events e where e.asset_id = p_asset_id)
  ) into v;
  return v;
end $$;
grant execute on function public.get_asset_detail(uuid) to authenticated;

-- Aircraft Profile → Parts tab: compatible parts + stock coverage at the tail's base.
create or replace function public.get_aircraft_parts(p_aircraft_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb; v_type text; v_base text;
begin
  select aircraft_type, base_station into v_type, v_base from public.aircraft where id = p_aircraft_id;
  select jsonb_build_object(
    'aircraft_type', v_type,
    'base_station', v_base,
    'predicted_demand', (select count(*) from public.signals s where s.aircraft_id = p_aircraft_id and s.is_active and s.signal_class = 'prediction'),
    'parts', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.criticality, x.part_number), '[]'::jsonb)
      from (
        select p.id, p.part_number, p.description, p.category, p.criticality, p.current_price_usd, p.typical_lead_time_days,
          coalesce((select sum(h.quantity_available) from public.stock_holdings h where h.part_id = p.id), 0) as total_available,
          coalesce((select sum(h.quantity_available) from public.stock_holdings h
            join public.stock_locations l on l.id = h.location_id where h.part_id = p.id and l.station_code = v_base), 0) as available_at_base
        from public.parts p
        where v_type = any(p.compatible_aircraft_types)
      ) x)
  ) into v;
  return v;
end $$;
grant execute on function public.get_aircraft_parts(uuid) to authenticated;
