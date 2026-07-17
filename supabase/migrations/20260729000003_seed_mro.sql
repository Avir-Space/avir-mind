-- AVIR Mind — Phase 12: MRO demo seed.
-- 1203: gives every user a SECOND org — "AVIR MRO Demo" (business_model = mro) —
-- alongside their operator org, so they can toggle tenant views. Seeds 5
-- customers, 8 contracts, customer aircraft, 6 service assignments in varied shop
-- statuses, 12 work packages, findings, SLA measurements (mixed), reports, and
-- fires the MRO signal engine. Operator org is untouched.

create or replace function public.seed_demo_mro(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_mro uuid; v_dom_role uuid; v_cm uuid; v_tm uuid;
  c_royl uuid; c_skyc uuid; c_avls uuid; c_glxy uuid; c_corp uuid;
  k_royl uuid; k_sky uuid; k_avl1 uuid; k_avl2 uuid; k_glxy uuid; k_corp uuid; k_royl2 uuid; k_expiring uuid;
  ac1 uuid; ac2 uuid; ac3 uuid; ac4 uuid; ac5 uuid; ac6 uuid; ac7 uuid; ac8 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid;
  wp uuid; wp_stall uuid; wp_finding uuid;
begin
  if p_user_id is null then return null; end if;

  -- fresh: drop any prior MRO demo org for this user (cascades all children)
  delete from public.orgs o using public.org_members m
    where m.org_id = o.id and m.user_id = p_user_id and o.primary_business_model = 'mro' and o.name = 'AVIR MRO Demo';

  insert into public.orgs (name, plan, primary_business_model, default_view_lens, brand_name)
  values ('AVIR MRO Demo', 'free', 'mro', 'customer_service', 'AVIR MRO') returning id into v_mro;
  insert into public.org_members (org_id, user_id, role) values (v_mro, p_user_id, 'owner');

  -- MRO roles
  insert into public.org_roles (org_id, role_code, role_display_name, typical_shift_pattern) values
    (v_mro, 'mro_customer_manager', 'Customer Manager', 'business_hours'),
    (v_mro, 'mro_technical_manager', 'Technical Manager', 'day_shift'),
    (v_mro, 'mro_finance_manager', 'Finance Manager', 'business_hours'),
    (v_mro, 'quality_assurance', 'Quality Assurance', 'business_hours'),
    (v_mro, 'director_of_maintenance', 'Director of Maintenance', 'business_hours');
  select id into v_cm from public.org_roles where org_id = v_mro and role_code = 'mro_customer_manager';
  select id into v_tm from public.org_roles where org_id = v_mro and role_code = 'mro_technical_manager';
  insert into public.user_role_assignments (org_id, user_id, role_id, is_primary) values (v_mro, p_user_id, v_cm, true), (v_mro, p_user_id, v_tm, false);

  -- customer aircraft (owned by customers, managed by the MRO during service)
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, 'JY-AYU', 'A320neo', 'MSN9001', 'AMM', 'managed') returning id into ac1;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, 'JY-BAX', 'A321', 'MSN9002', 'AMM', 'managed') returning id into ac2;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, 'N88SC', 'Global 7500', 'MSN9003', 'TEB', 'managed') returning id into ac3;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, '9H-AVL', 'A320neo', 'MSN9004', 'MLA', 'managed') returning id into ac4;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, '9H-AVM', 'B737-800', 'MSN9005', 'MLA', 'managed') returning id into ac5;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, 'GX-101', 'B737 MAX 8', 'MSN9006', 'SIN', 'managed') returning id into ac6;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, 'GX-102', 'B737-800', 'MSN9007', 'SIN', 'managed') returning id into ac7;
  insert into public.aircraft (org_id, tail_number, aircraft_type, serial_number, base_station, ownership_type) values
    (v_mro, 'M-CORP', 'Falcon 7X', 'MSN9008', 'FAB', 'managed') returning id into ac8;

  -- customers
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, customer_status, credit_limit_usd, payment_terms) values
    (v_mro, 'Royal Jordanian', 'ROYL', 'operator_airline', 'Layla Haddad', 'layla.haddad@rj.example', 'active', 5000000, 'Net 45') returning id into c_royl;
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, customer_status, credit_limit_usd, payment_terms) values
    (v_mro, 'Skyline Charter', 'SKYC', 'operator_charter', 'Tom Reyes', 'tom@skyline.example', 'active', 1500000, 'Net 30') returning id into c_skyc;
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, customer_status, credit_limit_usd, payment_terms) values
    (v_mro, 'AeroLease Capital', 'AVLS', 'lessor', 'Nadia Fischer', 'nadia@aerolease.example', 'active', 8000000, 'Net 60') returning id into c_avls;
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, customer_status, credit_limit_usd, payment_terms) values
    (v_mro, 'Galaxy Air', 'GLXY', 'operator_airline', 'Sam Osei', 'sam.osei@galaxy.example', 'active', 3000000, 'Net 45') returning id into c_glxy;
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, customer_status, credit_limit_usd, payment_terms) values
    (v_mro, 'Meridian Corporate', 'CORP', 'operator_corporate', 'Erin Walsh', 'erin@meridiancorp.example', 'prospect', 750000, 'Prepaid') returning id into c_corp;

  -- contracts (8, varied types; one expiring within 60 days)
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, sla_definitions, annual_value_usd, contract_status)
    values (v_mro, c_royl, 'MRO-ROYL-01', 'Royal Jordanian — Base Maintenance PBH', 'power_by_hour', current_date - 400, current_date + 330, array['A320neo','A321'],
      jsonb_build_object('turnaround_days', 25, 'on_time_release_pct', 90, 'quality_defect_rate_max', 2), 4200000, 'active') returning id into k_royl;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, sla_definitions, annual_value_usd, contract_status)
    values (v_mro, c_royl, 'MRO-ROYL-02', 'Royal Jordanian — Line Maintenance', 'time_and_materials', current_date - 200, current_date + 165, array['A320neo','A321'],
      jsonb_build_object('response_hours', 4), 600000, 'active') returning id into k_royl2;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, sla_definitions, annual_value_usd, contract_status)
    values (v_mro, c_skyc, 'MRO-SKYC-01', 'Skyline Charter — Business Jet T&M', 'time_and_materials', current_date - 120, current_date + 45, array['Global 7500'],
      jsonb_build_object('turnaround_days', 18), 900000, 'active') returning id into k_expiring;  -- expiring soon
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, sla_definitions, annual_value_usd, contract_status)
    values (v_mro, c_avls, 'MRO-AVLS-01', 'AeroLease — Transition Checks (Block Hour)', 'block_hour', current_date - 300, current_date + 400, array['A320neo','B737-800'],
      jsonb_build_object('turnaround_days', 30), 2600000, 'active') returning id into k_avl1;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, annual_value_usd, contract_status)
    values (v_mro, c_avls, 'MRO-AVLS-02', 'AeroLease — Records & Bridging', 'fixed_fee', current_date - 90, current_date + 640, array['A320neo','B737-800'], 300000, 'active') returning id into k_avl2;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, sla_definitions, annual_value_usd, contract_status)
    values (v_mro, c_glxy, 'MRO-GLXY-01', 'Galaxy Air — Heavy Checks Fixed Fee', 'fixed_fee', current_date - 220, current_date + 500, array['B737 MAX 8','B737-800'],
      jsonb_build_object('turnaround_days', 28, 'on_time_release_pct', 92), 3100000, 'active') returning id into k_glxy;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, annual_value_usd, contract_status)
    values (v_mro, c_glxy, 'MRO-GLXY-02', 'Galaxy Air — AOG Support', 'ad_hoc', current_date - 60, current_date + 300, array['B737 MAX 8','B737-800'], 450000, 'active');
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, covered_aircraft_types, annual_value_usd, contract_status)
    values (v_mro, c_corp, 'MRO-CORP-01', 'Meridian — Ad Hoc Business Jet', 'ad_hoc', current_date - 30, current_date + 335, array['Falcon 7X'], 250000, 'draft') returning id into k_corp;

  -- service assignments (varied shop statuses; ac1 set up to trip the SLA-risk signal)
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id, arrival_actual_utc, planned_release_utc, assignment_status, primary_service_purpose, assigned_hangar, assigned_bay, customer_reference, estimated_labor_hours, actual_labor_hours)
    values (v_mro, c_royl, k_royl, ac1, now() - interval '20 days', now() + interval '5 days', 'in_service', 'C-check', 'Hangar 1', 'Bay 3', 'RJ-PO-88213', 4200, 3600) returning id into a1;
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id, arrival_actual_utc, planned_release_utc, assignment_status, primary_service_purpose, assigned_hangar, assigned_bay, customer_reference, estimated_labor_hours, actual_labor_hours)
    values (v_mro, c_avls, k_avl1, ac4, now() - interval '12 days', now() + interval '8 days', 'in_service', 'Lease transition check', 'Hangar 2', 'Bay 1', 'AVL-WO-3120', 3000, 1800) returning id into a2;
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id, arrival_actual_utc, planned_release_utc, assignment_status, primary_service_purpose, assigned_hangar, assigned_bay, customer_reference, estimated_labor_hours)
    values (v_mro, c_glxy, k_glxy, ac6, now() - interval '8 days', now() + interval '18 days', 'in_service', 'AD 2024-30 compliance + heavy check', 'Hangar 3', 'Bay 2', 'GX-2200', 5200) returning id into a3;
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id, arrival_actual_utc, planned_release_utc, assignment_status, primary_service_purpose, assigned_hangar, assigned_bay, customer_reference)
    values (v_mro, c_skyc, k_expiring, ac3, now() - interval '1 day', now() + interval '16 days', 'arrived', 'Scheduled inspection', 'Hangar 1', 'Bay 5', 'SKY-441') returning id into a4;
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id, arrival_actual_utc, planned_release_utc, assignment_status, primary_service_purpose, assigned_hangar, assigned_bay, customer_reference)
    values (v_mro, c_royl, k_royl, ac2, now() - interval '24 days', now() + interval '1 day', 'ready_for_release', 'C-check', 'Hangar 1', 'Bay 4', 'RJ-PO-88109') returning id into a5;
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id, arrival_actual_utc, planned_release_utc, actual_release_utc, assignment_status, primary_service_purpose, assigned_hangar, customer_reference)
    values (v_mro, c_glxy, k_glxy, ac7, now() - interval '26 days', now() - interval '2 hours', now() - interval '1 hour', 'released', 'Heavy check', 'Hangar 3', 'GX-2199') returning id into a6;

  -- work packages (12) — spread across a1..a5; include a stall + awaiting-approval
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, status, labor_hours_planned, labor_hours_actual, parts_cost_actual_usd, labor_cost_actual_usd, planned_completion_utc) values
    (v_mro, a1, 'WP-ROYL-1001', 'scheduled_check', 'C-check zonal inspection', 'in_progress', 1600, 1400, 82000, 168000, now() + interval '4 days'),
    (v_mro, a1, 'WP-ROYL-1002', 'ad_compliance', 'AD 2024-15-08 accomplishment', 'complete', 120, 118, 9400, 14160, now() - interval '3 days'),
    (v_mro, a1, 'WP-ROYL-1003', 'modification', 'Cabin reconfiguration', 'awaiting_customer_approval', 400, 60, 4000, 7200, now() + interval '3 days');
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, status, labor_hours_planned, labor_hours_actual, parts_cost_actual_usd, labor_cost_actual_usd, planned_completion_utc) values
    (v_mro, a2, 'WP-AVLS-2001', 'scheduled_check', 'Transition check — structures', 'in_progress', 1200, 700, 41000, 84000, now() + interval '7 days');
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, status, labor_hours_planned, labor_hours_actual, parts_cost_actual_usd, labor_cost_actual_usd, planned_completion_utc, updated_at_utc)
    values (v_mro, a2, 'WP-AVLS-2002', 'unscheduled', 'Corrosion rectification — aft cargo', 'awaiting_parts', 300, 120, 6000, 14400, now() + interval '6 days', now() - interval '6 days') returning id into wp_stall;
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, status, labor_hours_planned, labor_hours_actual, parts_cost_actual_usd, labor_cost_actual_usd, planned_completion_utc)
    values (v_mro, a3, 'WP-GLXY-3002', 'ad_compliance', 'AD 2024-30-URGENT jackscrew inspection', 'in_progress', 200, 90, 12000, 10800, now() + interval '10 days') returning id into wp_finding;
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, status, labor_hours_planned, labor_hours_actual, parts_cost_actual_usd, labor_cost_actual_usd, planned_completion_utc) values
    (v_mro, a3, 'WP-GLXY-3001', 'scheduled_check', 'Heavy check — airframe', 'in_progress', 2400, 900, 120000, 108000, now() + interval '16 days'),
    (v_mro, a3, 'WP-GLXY-3003', 'sb_incorporation', 'SB engine mount re-torque', 'planned', 80, 0, 0, 0, now() + interval '14 days');
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, status, labor_hours_planned, labor_hours_actual, parts_cost_actual_usd, labor_cost_actual_usd, planned_completion_utc) values
    (v_mro, a4, 'WP-SKYC-4001', 'scheduled_check', 'Business jet inspection', 'planned', 400, 0, 0, 0, now() + interval '14 days'),
    (v_mro, a5, 'WP-ROYL-5001', 'scheduled_check', 'C-check final QA + release', 'complete', 1500, 1520, 76000, 182400, now() - interval '1 day'),
    (v_mro, a5, 'WP-ROYL-5002', 'warranty_repair', 'Warranty — APU generator', 'complete', 60, 58, 3200, 6960, now() - interval '2 days'),
    (v_mro, a2, 'WP-AVLS-2003', 'line_service', 'Daily line checks', 'in_progress', 40, 20, 500, 2400, now() + interval '1 day');

  -- findings
  insert into public.work_package_findings (org_id, work_package_id, finding_type, severity, discovered_at_utc, description, recommended_action, estimated_additional_cost_usd, estimated_additional_labor_hours, customer_notified, resolution_status)
    values (v_mro, wp_finding, 'unscheduled_discovery', 'major', now() - interval '30 hours', 'Elevator trim jackscrew wear beyond serviceable limits found during AD 2024-30 inspection.', 'Replace jackscrew assembly; obtain customer approval for additional work.', 48000, 90, false, 'pending');
  insert into public.work_package_findings (org_id, work_package_id, finding_type, severity, discovered_at_utc, description, recommended_action, estimated_additional_cost_usd, customer_notified, customer_notified_at_utc, resolution_status)
    values (v_mro, wp_stall, 'corrosion', 'moderate', now() - interval '6 days', 'Surface corrosion in aft cargo floor beams.', 'Blend and treat per SRM; awaiting replacement panel.', 6000, true, now() - interval '5 days', 'approved_for_work');
  insert into public.work_package_findings (org_id, work_package_id, finding_type, severity, discovered_at_utc, description, recommended_action, estimated_additional_cost_usd, customer_notified, customer_notified_at_utc, resolution_status)
    values (v_mro, (select id from public.work_packages where work_package_number = 'WP-ROYL-5002'), 'warranty_claim_candidate', 'moderate', now() - interval '10 days', 'APU generator failure within warranty period — warranty claim candidate.', 'File warranty claim with OEM.', 0, true, now() - interval '9 days', 'rectified');
  insert into public.work_package_findings (org_id, work_package_id, finding_type, severity, discovered_at_utc, description, recommended_action, customer_notified, resolution_status)
    values (v_mro, (select id from public.work_packages where work_package_number = 'WP-ROYL-1001'), 'routine_inspection_finding', 'minor', now() - interval '4 days', 'Minor wear on cargo door seal.', 'Replace seal at next opportunity.', true, 'rectified');

  -- SLA measurements (mixed performance)
  insert into public.sla_measurements (org_id, service_contract_id, customer_account_id, sla_type, measurement_period_start, measurement_period_end, target_value, actual_value, unit, performance_pct, credits_owed_usd, penalty_reason) values
    (v_mro, k_royl, c_royl, 'on_time_release', current_date - 30, current_date, 90, 86, 'percent', 86, 1000, 'On-time release below 90% target'),
    (v_mro, k_royl, c_royl, 'turnaround_time', current_date - 30, current_date, 25, 24.2, 'days', 103, 0, null),
    (v_mro, k_glxy, c_glxy, 'on_time_release', current_date - 30, current_date, 92, 96, 'percent', 96, 0, null),
    (v_mro, k_avl1, c_avls, 'quality_defect_rate', current_date - 30, current_date, 2, 1.4, 'percent', 130, 0, null);

  -- customer reports
  insert into public.customer_reports (org_id, customer_account_id, service_contract_id, report_type, reporting_period_start, reporting_period_end, generated_at_utc, report_status, content)
    values (v_mro, c_royl, k_royl, 'monthly_activity', current_date - 30, current_date, now() - interval '2 days', 'sent_to_customer',
      jsonb_build_object('period', jsonb_build_object('start', (current_date-30), 'end', current_date), 'customer', 'Royal Jordanian',
        'aircraft_serviced', 2, 'work_packages', 5, 'findings', 2, 'wip_cost_usd', 545280,
        'sla', jsonb_build_array(jsonb_build_object('type','on_time_release','target',90,'actual',86,'performance_pct',86,'credits_owed_usd',1000)),
        'headline', 'Two aircraft serviced; C-check on JY-BAX released on time. On-time release 86% (1 credit applied).'));
  insert into public.customer_reports (org_id, customer_account_id, report_type, reporting_period_start, reporting_period_end, report_status, content)
    values (v_mro, c_glxy, 'findings_summary', current_date, current_date, 'draft',
      jsonb_build_object('finding', jsonb_build_object('description','Elevator trim jackscrew wear beyond limits','severity','major','estimated_additional_cost_usd',48000)));

  perform public.generate_mro_signals_for_org(v_mro);
  return v_mro;
end $$;
grant execute on function public.seed_demo_mro(uuid) to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Wire into signup + backfill (every user gets an MRO demo org alongside operator).
-- ═════════════════════════════════════════════════════════════════════════════
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
      perform public.seed_demo_compliance(v_org, new.id);
      perform public.generate_inventory_signals_for_org(v_org);
      perform public.generate_crew_signals_for_org(v_org);
      perform public.generate_operational_signals_for_org(v_org);
      perform public.generate_compliance_signals_for_org(v_org);
      perform public.seed_demo_calibration(v_org, new.id);
      perform public.seed_demo_backtest(v_org, new.id);
      perform public.seed_demo_comms(v_org, new.id);
      -- second tenant: MRO demo (toggle target)
      perform public.seed_demo_mro(new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select distinct (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id from public.orgs o where o.primary_business_model = 'operator' loop
    if r.user_id is not null then
      perform public.seed_demo_mro(r.user_id);
    end if;
  end loop;
end $$;
