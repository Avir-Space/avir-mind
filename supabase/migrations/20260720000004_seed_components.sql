-- Phase 3 — seed realistic components, event history, and health trends.
-- Idempotent per org. On-signup predictive generation is client-orchestrated
-- (like Phase 2 signals): the /components surface prepares runs + invokes the
-- generate-predictive-signals Edge Function for a subset of aircraft.

create or replace function public.seed_demo_components(p_org_id uuid, p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
  r_ac record;
  r_c record;
  v_ac_ord int := 0;
  v_comp_ord int;
  v_cid uuid;
  v_install date;
  v_cur_cycles int;
  v_cur_hours numeric;
  v_csn int;
  v_csoh int;
  v_hsoh numeric;
  v_near_oh boolean;
  v_has_finding boolean;
  v_health int;
begin
  if exists (select 1 from public.components where org_id = p_org_id) then
    return 0;
  end if;

  for r_ac in
    select id, tail_number, aircraft_type from public.aircraft where org_id = p_org_id order by tail_number
  loop
    v_ac_ord := v_ac_ord + 1;
    v_comp_ord := 0;
    v_install := (now() - (((12 + (v_ac_ord % 12)))::text || ' months')::interval)::date;

    for r_c in
      select * from (values
        ('engine', 'LH', 9200, 21000, 25000, 50000, 6000, 12000),
        ('engine', 'RH', 8800, 20500, 25000, 50000, 6000, 12000),
        ('apu', 'TAIL', 4200, 9200, 15000, 30000, 4000, 8000),
        ('landing_gear_main', 'LH', 9000, 21000, 60000, NULL, 20000, NULL),
        ('landing_gear_nose', 'NOSE', 9000, 21000, 60000, NULL, 20000, NULL),
        ('avionics_unit', 'FWD', 0, 18000, NULL, NULL, NULL, NULL),
        ('environmental_control', 'MID', 0, 18000, NULL, NULL, NULL, NULL)
      ) as t(ctype, pos, base_cyc, base_hrs, lim_cyc, lim_hrs, oh_cyc, oh_hrs)
    loop
      v_comp_ord := v_comp_ord + 1;
      v_near_oh := (r_c.ctype = 'engine' and (v_ac_ord % 3) = 0);
      v_has_finding := ((v_ac_ord + v_comp_ord) % 5) = 0;

      v_cur_cycles := r_c.base_cyc + ((v_ac_ord * 131) % 2500);
      v_cur_hours := r_c.base_hrs + ((v_ac_ord * 217) % 4000);
      v_csn := v_cur_cycles;
      if r_c.oh_cyc is not null then
        v_csoh := case when v_near_oh then round(r_c.oh_cyc * 0.92) else (v_cur_cycles % r_c.oh_cyc) end;
      else
        v_csoh := 0;
      end if;
      v_hsoh := case when r_c.oh_hrs is not null then least(v_csoh::numeric / nullif(r_c.oh_cyc,0) * r_c.oh_hrs, r_c.oh_hrs) else 0 end;

      insert into public.components (
        org_id, aircraft_id, component_type, part_number, serial_number, position_code, manufacturer,
        installed_at_utc, current_cycles, current_flight_hours, cycles_since_new, flight_hours_since_new,
        cycles_since_overhaul, flight_hours_since_overhaul, limit_cycles, limit_flight_hours,
        overhaul_interval_cycles, overhaul_interval_hours, next_scheduled_event_type,
        next_scheduled_event_due_cycles, next_scheduled_event_due_date, status)
      values (
        p_org_id, r_ac.id, r_c.ctype,
        upper(left(r_c.ctype, 3)) || '-' || (1000 + ((v_ac_ord * 7) % 900))::text,
        r_ac.tail_number || '-' || r_c.pos || '-' || (10000 + v_ac_ord * 10 + v_comp_ord)::text,
        r_c.pos,
        case r_c.ctype when 'engine' then 'CFM International' when 'apu' then 'Honeywell'
          when 'avionics_unit' then 'Collins Aerospace' when 'environmental_control' then 'Liebherr'
          else 'Safran' end,
        v_install::timestamptz, v_cur_cycles, v_cur_hours, v_csn, v_cur_hours,
        v_csoh, v_hsoh, r_c.lim_cyc, r_c.lim_hrs, r_c.oh_cyc, r_c.oh_hrs,
        case when v_near_oh then 'overhaul' when r_c.ctype in ('engine', 'apu') then 'borescope' else 'inspection' end,
        case when r_c.oh_cyc is not null then r_c.oh_cyc - v_csoh else null end,
        case when v_near_oh then (now() + interval '25 days')::date else (now() + interval '160 days')::date end,
        'on_wing')
      returning id into v_cid;
      v_count := v_count + 1;

      -- Event history (installed + overhaul baseline + inspections + optional finding + recent hours).
      insert into public.component_events (org_id, component_id, aircraft_id, event_type, event_date_utc,
        cycles_at_event, flight_hours_at_event, finding_severity, finding_description, station, facility,
        performed_by, source_system, cost_usd)
      values
        (p_org_id, v_cid, r_ac.id, 'installed', v_install, 0, 0, null, null, r_ac.tail_number, 'Line Maintenance', 'MRO Tech', 'amos', null),
        (p_org_id, v_cid, r_ac.id, 'cycle_recorded', (v_install + interval '5 months')::date,
          round(v_cur_cycles * 0.5), round(v_cur_hours * 0.5), null, null, null, null, 'System', 'avir', null),
        (p_org_id, v_cid, r_ac.id,
          case when r_c.ctype in ('engine', 'apu') then 'borescope' else 'functional_test' end,
          (now() - interval '150 days')::date, round(v_cur_cycles * 0.85), round(v_cur_hours * 0.85),
          case when v_has_finding then 'minor' else 'nil' end,
          case when v_has_finding then 'Minor wear noted, within limits' else 'No findings' end,
          null, 'MRO Dock 2', 'Inspector', 'trax', 4200),
        (p_org_id, v_cid, r_ac.id, 'hours_recorded', (now() - interval '18 days')::date,
          v_cur_cycles, v_cur_hours, null, null, null, null, 'System', 'avir', null);

      if v_has_finding then
        insert into public.component_events (org_id, component_id, aircraft_id, event_type, event_date_utc,
          cycles_at_event, flight_hours_at_event, finding_severity, finding_description, facility, performed_by, source_system, cost_usd)
        values (p_org_id, v_cid, r_ac.id, 'finding_recorded', (now() - interval '52 days')::date,
          round(v_cur_cycles * 0.95), round(v_cur_hours * 0.95), 'moderate',
          'Elevated vibration signature on last survey; trend monitoring recommended', 'MRO Dock 2', 'Reliability Eng', 'sap', 0);
      end if;

      if r_c.ctype = 'engine' then
        insert into public.component_events (org_id, component_id, aircraft_id, event_type, event_date_utc,
          cycles_at_event, flight_hours_at_event, finding_severity, station, facility, performed_by, source_system, cost_usd)
        values (p_org_id, v_cid, r_ac.id, 'overhaul', v_install, 0, 0, 'nil', null, 'Engine Shop', 'Overhaul Team', 'amos', 1250000);
      end if;

      -- Health trend history (6 backdated points, declining), then compute the authoritative current.
      insert into public.component_health_history (org_id, component_id, health_score, score_contributors, computed_at_utc)
      select p_org_id, v_cid,
        greatest(45, 93 - i * 3 - (v_ac_ord % 8) - (case when v_near_oh then 10 else 0 end) - (case when v_has_finding then 8 else 0 end)),
        jsonb_build_object('synthetic', true, 'point', i),
        now() - (((12 - i * 2))::text || ' months')::interval
      from generate_series(0, 5) as i;

      v_health := public.compute_component_health(v_cid);
    end loop;
  end loop;

  -- A few off-wing spares in inventory (not tied to a tail).
  for v_comp_ord in 1..4 loop
    insert into public.components (org_id, aircraft_id, component_type, part_number, serial_number,
      position_code, manufacturer, current_cycles, current_flight_hours, cycles_since_new, flight_hours_since_new,
      cycles_since_overhaul, flight_hours_since_overhaul, limit_cycles, overhaul_interval_cycles, status, health_score, health_score_updated_at_utc)
    values (p_org_id, null,
      (array['engine', 'apu', 'avionics_unit', 'landing_gear_nose'])[v_comp_ord],
      'SPR-' || (2000 + v_comp_ord)::text, 'SPARE-' || (90000 + v_comp_ord)::text, null,
      'Various', (2000 + v_comp_ord * 300), (5000 + v_comp_ord * 400), (2000 + v_comp_ord * 300), (5000 + v_comp_ord * 400),
      500, 1000, case (array['engine','apu','avionics_unit','landing_gear_nose'])[v_comp_ord] when 'avionics_unit' then null else 25000 end,
      case (array['engine','apu','avionics_unit','landing_gear_nose'])[v_comp_ord] when 'avionics_unit' then null else 6000 end,
      'off_wing_inventory', 88, now());
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.seed_demo_components(uuid, uuid) to authenticated, anon, service_role;

-- Wire component seeding into new-user provisioning + backfill existing orgs.
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  begin
    v_org := public.seed_avir_demo(new.id);
    if v_org is not null then
      perform public.seed_demo_flight_schedules(v_org, new.id);
      perform public.seed_demo_components(v_org, new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select o.id as org_id,
           (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id
    from public.orgs o
  loop
    perform public.seed_demo_components(r.org_id, r.user_id);
  end loop;
end
$$;
