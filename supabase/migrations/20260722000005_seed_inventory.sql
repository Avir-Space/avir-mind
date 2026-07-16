-- Phase 5 — seed inventory + assets. Idempotent per org.

create or replace function public.seed_demo_inventory(p_org_id uuid, p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
  v_loc uuid[] := array[]::uuid[];
  v_sup uuid[] := array[]::uuid[];
  v_id uuid;
  i int;
  fam int;
  v_pid uuid;
  v_prefix text; v_cat text; v_crit text; v_uom text; v_lead int; v_price numeric; v_ata text;
  v_actypes text[]; v_comptypes text[]; v_alt text[];
  v_pn text;
  v_qty_main int; v_qty_stn int; v_reorder int; v_stn uuid;
  a int; v_atype text; v_astatus text; v_cal boolean; v_caldue date;
begin
  if exists (select 1 from public.parts where org_id = p_org_id) then return 0; end if;

  -- 8 stock locations.
  for i in 1..8 loop
    insert into public.stock_locations (org_id, location_code, location_name, location_type, station_code, climate_controlled, hazmat_certified)
    values (p_org_id,
      (array['FRA-WH-01','JFK-STN','LAX-STN','ORD-STN','DFW-STN','LHR-STN','DXB-STN','FRA-MRO'])[i],
      (array['Frankfurt Main Warehouse','New York JFK Station','Los Angeles Station','Chicago Station','Dallas Station','London Heathrow Station','Dubai Station','Frankfurt MRO Shop'])[i],
      (array['main_warehouse','station_stock','station_stock','station_stock','station_stock','station_stock','station_stock','mro_shop'])[i],
      (array['FRA','JFK','LAX','ORD','DFW','LHR','DXB','FRA'])[i],
      i in (1, 8), i in (1, 8))
    returning id into v_id;
    v_loc := array_append(v_loc, v_id);
  end loop;

  -- 12 suppliers (a few below the 70 performance threshold).
  for i in 1..12 loop
    insert into public.suppliers (org_id, supplier_name, supplier_code, supplier_type, approved_status,
      primary_contact_name, primary_contact_email, typical_lead_time_days, performance_score, last_order_at_utc)
    values (p_org_id,
      (array['CFM Materials','Honeywell Aerospace','Collins Aerospace','Safran Parts','AeroDistribution GmbH','Global Aviation Supply','Precision MRO Services','TurbineTech Brokers','Liebherr Aviation','Pacific Parts Co','Atlas Component Exchange','Meridian Aero Logistics'])[i],
      'SUP-' || lpad(i::text, 3, '0'),
      (array['oem','oem','oem','oem','distributor','distributor','mro','broker','oem','distributor','broker','distributor'])[i],
      (array['approved','approved','approved','approved','approved','approved_with_conditions','approved','under_review','approved','approved','suspended','approved_with_conditions'])[i],
      (array['J. Weber','S. Tan','M. Rossi','P. Laurent','K. Müller','D. Nguyen','R. Osei','L. Petrov','A. Bauer','C. Reyes','T. Okoro','F. Haddad'])[i],
      'orders@supplier' || i || '.example',
      (array[45,30,21,40,14,10,25,60,28,12,50,18])[i],
      (array[92,88,85,80,76,72,68,64,60,90,58,74])[i],
      now() - ((i * 3) || ' days')::interval)
    returning id into v_id;
    v_sup := array_append(v_sup, v_id);
  end loop;

  -- ~200 parts across 10 families, with holdings + movements + supplier links.
  for i in 1..200 loop
    fam := i % 10;
    v_prefix := (array['ENG','APU','LGR','AVI','FLT','SEAL','OIL','BAT','ECS','TOOL'])[fam + 1];
    v_cat := (array['rotable','rotable','rotable','rotable','expendable','consumable','chemical','expendable','rotable','tooling'])[fam + 1];
    v_crit := (array['ao_g_critical','safety_critical','safety_critical','rotational','standard','standard','standard','safety_critical','rotational','standard'])[fam + 1];
    v_uom := (array['each','each','each','each','each','each','liter','each','each','each'])[fam + 1];
    v_lead := (array[45,30,60,21,10,7,5,25,28,14])[fam + 1] + (i % 12);
    v_price := (array[85000,42000,120000,15000,320,45,28,3800,22000,1200])[fam + 1] * (1 + (i % 5) * 0.03);
    v_ata := (array['72','49','32','34','79','72','12','24','21',null])[fam + 1];
    v_actypes := case fam
      when 0 then array['A320neo','A321'] when 1 then array['B737-800','B737 MAX 8']
      when 2 then array['A320neo','A321','B737-800'] when 3 then array['G650','Falcon 7X','Global 7500']
      when 7 then array['E175','CRJ-900'] when 8 then array['A320neo','B737-800'] else null::text[] end;
    v_comptypes := case fam
      when 0 then array['engine'] when 1 then array['apu'] when 2 then array['landing_gear_main','landing_gear_nose']
      when 3 then array['avionics_unit'] when 4 then array['engine','apu'] when 5 then array['landing_gear_main','engine']
      when 6 then array['engine','apu'] when 7 then array['battery'] when 8 then array['environmental_control'] else null::text[] end;
    v_pn := v_prefix || '-' || (1000 + i)::text;
    -- Give some parts an approved alternate that points at a nearby (in-stock) part.
    v_alt := case when i % 6 = 0 and i > 10 then array[v_prefix || '-' || (1000 + i - 10)::text] else null end;

    insert into public.parts (org_id, part_number, manufacturer, description, category, unit_of_measure,
      shelf_life_days, storage_conditions, hazmat_class, ata_chapter, compatible_aircraft_types, compatible_component_types,
      alternative_part_numbers, current_price_usd, typical_lead_time_days, criticality)
    values (p_org_id, v_pn,
      (array['CFM International','Honeywell','Messier-Bugatti','Collins Aerospace','Pall Aerospace','Trelleborg','ExxonMobil Aviation','Concorde Battery','Liebherr','Snap-on Aviation'])[fam + 1],
      (array['Engine LP turbine blade set','APU starter-generator','Main gear shock strut assembly','Air data computer','Fuel filter element','Hydraulic seal kit','Turbine engine oil','Ni-Cd main battery','Air cycle machine','Torque wrench, calibrated'])[fam + 1] || ' rev ' || chr(65 + (i % 6)),
      v_cat, v_uom,
      case when fam in (6, 7) then 730 else null end,
      case when fam = 6 then 'Temperature controlled 15-25C' when fam = 7 then 'Ventilated, upright' else null end,
      case when fam = 6 then 'Class 3 flammable liquid' when fam = 7 then 'Class 8 corrosive' else null end,
      v_ata, v_actypes, v_comptypes, v_alt, round(v_price, 2), v_lead, v_crit)
    returning id into v_pid;
    v_count := v_count + 1;

    -- Holdings: main warehouse + one station. ~1 in 7 below reorder point.
    if fam in (4, 5, 6) then v_qty_main := 120 + (i % 200); v_reorder := 80;
    elsif fam = 7 then v_qty_main := 8 + (i % 12); v_reorder := 6;
    elsif fam = 9 then v_qty_main := 2 + (i % 3); v_reorder := 1;
    else v_qty_main := 2 + (i % 5); v_reorder := 2; end if;

    v_stn := v_loc[2 + (i % 6)];
    v_qty_stn := case when i % 7 = 0 then greatest(v_reorder - (1 + i % 3), 0) else v_reorder + 2 + (i % 4) end;

    insert into public.stock_holdings (org_id, part_id, location_id, quantity_available, quantity_reserved, reorder_point, max_stock_level, last_received_at_utc)
    values (p_org_id, v_pid, v_loc[1], v_qty_main, 0, v_reorder, v_qty_main * 2, now() - ((20 + i % 40) || ' days')::interval);
    insert into public.stock_holdings (org_id, part_id, location_id, quantity_available, quantity_reserved, reorder_point, max_stock_level)
    values (p_org_id, v_pid, v_stn, v_qty_stn, 0, v_reorder, v_reorder * 4);

    -- Movements over the last 90 days.
    insert into public.stock_movements (org_id, part_id, to_location_id, movement_type, quantity, reference_number, unit_cost_usd, performed_by_user_id, movement_date_utc)
    values (p_org_id, v_pid, v_loc[1], 'receipt', v_qty_main, 'PO-' || (5000 + i), round(v_price, 2), p_user_id, now() - ((30 + i % 55) || ' days')::interval);
    if fam in (4, 5, 6) then
      insert into public.stock_movements (org_id, part_id, from_location_id, movement_type, quantity, performed_by_user_id, movement_date_utc)
      values (p_org_id, v_pid, v_stn, 'consumption', 1 + (i % 4), p_user_id, now() - ((3 + i % 40) || ' days')::interval),
             (p_org_id, v_pid, v_stn, 'consumption', 1 + (i % 3), p_user_id, now() - ((1 + i % 12) || ' days')::interval);
    end if;

    -- Supplier links for ~60% of parts.
    if i % 5 < 3 then
      insert into public.supplier_parts (org_id, supplier_id, part_id, supplier_part_reference, typical_lead_time_days, typical_unit_price_usd, minimum_order_quantity, is_preferred, last_price_usd, last_ordered_at_utc)
      values (p_org_id, v_sup[1 + (i % 12)], v_pid, 'S' || (i % 12) || '-' || v_pn, v_lead, round(v_price * 0.97, 2), case when fam in (4,5,6) then 10 else 1 end, true, round(v_price * 0.97, 2), now() - ((i % 60) || ' days')::interval);
      if i % 3 = 0 then
        insert into public.supplier_parts (org_id, supplier_id, part_id, supplier_part_reference, typical_lead_time_days, typical_unit_price_usd, minimum_order_quantity, is_preferred)
        values (p_org_id, v_sup[1 + ((i + 5) % 12)], v_pid, 'ALT-' || v_pn, v_lead + 7, round(v_price * 1.05, 2), 1, false);
      end if;
    end if;
  end loop;

  -- 40 assets across stations.
  for a in 1..40 loop
    v_atype := (array['ground_support_equipment','tooling','calibrated_instrument','test_equipment','vehicle','hangar_equipment'])[1 + (a % 6)];
    v_cal := v_atype in ('calibrated_instrument','test_equipment');
    v_astatus := case when a % 13 = 0 then 'under_maintenance' when a % 19 = 0 then 'out_of_service' else 'in_service' end;
    v_caldue := case when v_cal then (now() + (((a % 5) * 25 - 20) || ' days')::interval)::date else null end;
    insert into public.assets (org_id, asset_tag, asset_name, asset_type, manufacturer, model, serial_number, location_id,
      current_status, purchased_date, purchase_cost_usd, calibration_required, calibration_due_date, next_service_due_date, assigned_to_station)
    values (p_org_id, 'AST-' || lpad(a::text, 3, '0'),
      (array['Tow tractor','Torque multiplier','Borescope camera','Engine test set','Service van','Jack stand set'])[1 + (a % 6)] || ' #' || a,
      v_atype,
      (array['TLD','Snap-on','Olympus','Barfield','Ford','Malabar'])[1 + (a % 6)],
      'M-' || (100 + a), 'SN-' || (70000 + a), v_loc[1 + (a % 8)], v_astatus,
      (current_date - ((200 + a * 5) || ' days')::interval)::date, round((5000 + a * 1500)::numeric, 2),
      v_cal, v_caldue, (now() + (((a % 6) * 30 + 10) || ' days')::interval)::date,
      (array['FRA','JFK','LAX','ORD','DFW','LHR','DXB','FRA'])[1 + (a % 8)])
    returning id into v_id;
    insert into public.asset_events (org_id, asset_id, event_type, event_date, performed_by, cost_usd)
    values (p_org_id, v_id, 'acquired', (current_date - ((200 + a * 5) || ' days')::interval)::date, 'Procurement', round((5000 + a * 1500)::numeric, 2));
    if v_cal then
      insert into public.asset_events (org_id, asset_id, event_type, event_date, performed_by)
      values (p_org_id, v_id, 'calibrated', (current_date - ((a % 300) || ' days')::interval)::date, 'Cal Lab');
    end if;
  end loop;

  return v_count;
end $$;
grant execute on function public.seed_demo_inventory(uuid, uuid) to authenticated, anon, service_role;

-- Wire into signup + backfill (also (re)generate deterministic inventory signals).
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
      perform public.generate_inventory_signals_for_org(v_org);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select o.id as org_id,
    (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id
    from public.orgs o
  loop
    perform public.seed_demo_inventory(r.org_id, r.user_id);
    perform public.generate_inventory_signals_for_org(r.org_id);
  end loop;
end $$;
