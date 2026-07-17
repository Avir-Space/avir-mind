-- AVIR Mind — Phase 12: MRO RPCs + deterministic MRO signals.
-- 1202. Customer/contract CRUD, service assignments, work-package lifecycle,
-- findings + customer notification, SLA computation, customer reports, and the
-- shop-floor / customer / WIP dashboards. Writes SECURITY DEFINER + is_org_member
-- guarded; reads SECURITY INVOKER (RLS-scoped to the active org via _caller_org).

-- ── customers ──
create or replace function public.create_customer_account(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.customer_accounts (org_id, customer_name, customer_code, customer_type, primary_contact_name, primary_contact_email, primary_contact_phone, customer_status, credit_limit_usd, payment_terms, default_currency, notes)
  values (v_org, p->>'customer_name', p->>'customer_code', p->>'customer_type', p->>'primary_contact_name', p->>'primary_contact_email', p->>'primary_contact_phone',
    coalesce(p->>'customer_status','active'), (p->>'credit_limit_usd')::numeric, p->>'payment_terms', coalesce(p->>'default_currency','USD'), p->>'notes')
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_customer_account(jsonb) to authenticated;

create or replace function public.update_customer_account(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.customer_accounts where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.customer_accounts set
    customer_name = coalesce(p->>'customer_name', customer_name),
    customer_status = coalesce(p->>'customer_status', customer_status),
    primary_contact_name = coalesce(p->>'primary_contact_name', primary_contact_name),
    primary_contact_email = coalesce(p->>'primary_contact_email', primary_contact_email),
    payment_terms = coalesce(p->>'payment_terms', payment_terms),
    notes = coalesce(p->>'notes', notes), updated_at_utc = now()
  where id = p_id;
  return p_id;
end $$;
grant execute on function public.update_customer_account(uuid, jsonb) to authenticated;

-- ── contracts ──
create or replace function public.create_service_contract(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.service_contracts (org_id, customer_account_id, contract_number, contract_name, contract_type, effective_from, effective_to, auto_renew,
    covered_aircraft_types, covered_scope, excluded_scope, pricing_structure, sla_definitions, warranty_terms, reporting_obligations, annual_value_usd, contract_status)
  values (v_org, (p->>'customer_account_id')::uuid, p->>'contract_number', p->>'contract_name', p->>'contract_type',
    (p->>'effective_from')::date, (p->>'effective_to')::date, coalesce((p->>'auto_renew')::boolean, false),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p->'covered_aircraft_types') x), '{}'),
    p->'covered_scope', p->'excluded_scope', p->'pricing_structure', p->'sla_definitions', p->'warranty_terms', p->'reporting_obligations',
    (p->>'annual_value_usd')::numeric, coalesce(p->>'contract_status','active'))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_service_contract(jsonb) to authenticated;

create or replace function public.update_service_contract(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.service_contracts where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.service_contracts set contract_name = coalesce(p->>'contract_name', contract_name),
    contract_status = coalesce(p->>'contract_status', contract_status),
    effective_to = coalesce((p->>'effective_to')::date, effective_to),
    sla_definitions = coalesce(p->'sla_definitions', sla_definitions), updated_at_utc = now() where id = p_id;
  return p_id;
end $$;
grant execute on function public.update_service_contract(uuid, jsonb) to authenticated;

-- ── service assignments ──
create or replace function public.assign_aircraft_to_service(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.aircraft_service_assignments (org_id, customer_account_id, service_contract_id, aircraft_id,
    arrival_expected_utc, arrival_actual_utc, planned_release_utc, assignment_status, primary_service_purpose,
    assigned_hangar, assigned_bay, customer_reference, estimated_labor_hours, notes)
  values (v_org, (p->>'customer_account_id')::uuid, (p->>'service_contract_id')::uuid, (p->>'aircraft_id')::uuid,
    (p->>'arrival_expected_utc')::timestamptz, (p->>'arrival_actual_utc')::timestamptz, (p->>'planned_release_utc')::timestamptz,
    coalesce(p->>'assignment_status','expected'), p->>'primary_service_purpose', p->>'assigned_hangar', p->>'assigned_bay',
    p->>'customer_reference', (p->>'estimated_labor_hours')::numeric, p->>'notes')
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.assign_aircraft_to_service(jsonb) to authenticated;

create or replace function public.transition_service_assignment_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.aircraft_service_assignments where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.aircraft_service_assignments set assignment_status = p_status, updated_at_utc = now(),
    arrival_actual_utc = case when p_status = 'arrived' and arrival_actual_utc is null then now() else arrival_actual_utc end,
    actual_release_utc = case when p_status = 'released' then now() else actual_release_utc end
  where id = p_id;
  return jsonb_build_object('id', p_id, 'status', p_status);
end $$;
grant execute on function public.transition_service_assignment_status(uuid, text) to authenticated;

-- ── work packages ──
create or replace function public.create_work_package(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.work_packages (org_id, service_assignment_id, work_package_number, package_type, title, description,
    planned_start_utc, planned_completion_utc, status, labor_hours_planned, parts_cost_planned_usd, billable, customer_approval_required)
  values (v_org, (p->>'service_assignment_id')::uuid, p->>'work_package_number', p->>'package_type', p->>'title', p->>'description',
    (p->>'planned_start_utc')::timestamptz, (p->>'planned_completion_utc')::timestamptz, coalesce(p->>'status','planned'),
    (p->>'labor_hours_planned')::numeric, (p->>'parts_cost_planned_usd')::numeric, coalesce((p->>'billable')::boolean, true),
    coalesce((p->>'customer_approval_required')::boolean, false))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_work_package(jsonb) to authenticated;

create or replace function public.transition_work_package_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.work_packages where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.work_packages set status = p_status, updated_at_utc = now(),
    actual_start_utc = case when p_status = 'in_progress' and actual_start_utc is null then now() else actual_start_utc end,
    actual_completion_utc = case when p_status = 'complete' then now() else actual_completion_utc end
  where id = p_id;
  return jsonb_build_object('id', p_id, 'status', p_status);
end $$;
grant execute on function public.transition_work_package_status(uuid, text) to authenticated;

-- ── findings ──
create or replace function public.record_finding(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.work_packages where id = (p->>'work_package_id')::uuid;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  insert into public.work_package_findings (org_id, work_package_id, finding_type, severity, discovered_by_user_id,
    component_reference, location_reference, description, recommended_action, estimated_additional_cost_usd, estimated_additional_labor_hours, resolution_status)
  values (v_org, (p->>'work_package_id')::uuid, p->>'finding_type', p->>'severity', auth.uid(),
    p->>'component_reference', p->>'location_reference', p->>'description', p->>'recommended_action',
    (p->>'estimated_additional_cost_usd')::numeric, (p->>'estimated_additional_labor_hours')::numeric, coalesce(p->>'resolution_status','pending'))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.record_finding(jsonb) to authenticated;

create or replace function public.notify_customer_of_finding(p_finding_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_cust uuid; v_wp uuid; v_report uuid; f public.work_package_findings;
begin
  select * into f from public.work_package_findings where id = p_finding_id;
  v_org := f.org_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  select asa.customer_account_id into v_cust
    from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id
    where wp.id = f.work_package_id;
  update public.work_package_findings set customer_notified = true, customer_notified_at_utc = now() where id = p_finding_id;
  insert into public.customer_reports (org_id, customer_account_id, report_type, reporting_period_start, reporting_period_end, report_status, content, generated_at_utc, generated_by_user_id)
  values (v_org, v_cust, 'findings_summary', current_date, current_date, 'draft',
    jsonb_build_object('finding', jsonb_build_object('description', f.description, 'severity', f.severity, 'recommended_action', f.recommended_action,
      'estimated_additional_cost_usd', f.estimated_additional_cost_usd, 'component', f.component_reference)), now(), auth.uid())
  returning id into v_report;
  return jsonb_build_object('finding_id', p_finding_id, 'draft_report_id', v_report, 'customer_notified', true);
end $$;
grant execute on function public.notify_customer_of_finding(uuid) to authenticated;

-- ── SLA computation ──
create or replace function public.compute_sla_performance(p_contract_id uuid, p_start date default (current_date - 30), p_end date default current_date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_cust uuid; v_target numeric; v_actual numeric; v_perf numeric; v_id uuid; v_credits numeric;
begin
  select org_id, customer_account_id into v_org, v_cust from public.service_contracts where id = p_contract_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;

  -- on-time release rate over completed assignments in window
  select coalesce((sc.sla_definitions->>'turnaround_days')::numeric, 14) into v_target from public.service_contracts sc where sc.id = p_contract_id;
  select round(avg(case when asa.actual_release_utc <= asa.planned_release_utc then 100 else 0 end), 2)
    into v_actual from public.aircraft_service_assignments asa
    where asa.service_contract_id = p_contract_id and asa.actual_release_utc is not null
      and asa.actual_release_utc::date between p_start and p_end;
  v_actual := coalesce(v_actual, 0);
  v_perf := v_actual;
  v_credits := case when v_actual < 90 then round((90 - v_actual) * 250, 2) else 0 end;

  insert into public.sla_measurements (org_id, service_contract_id, customer_account_id, sla_type, measurement_period_start, measurement_period_end,
    target_value, actual_value, unit, performance_pct, credits_owed_usd, penalty_reason)
  values (v_org, p_contract_id, v_cust, 'on_time_release', p_start, p_end, 90, v_actual, 'percent', v_perf, v_credits,
    case when v_credits > 0 then 'On-time release below 90% target' else null end)
  returning id into v_id;
  return jsonb_build_object('measurement_id', v_id, 'performance_pct', v_perf, 'credits_owed_usd', v_credits);
end $$;
grant execute on function public.compute_sla_performance(uuid, date, date) to authenticated;

-- ── customer report ──
create or replace function public.generate_customer_report(p_customer_id uuid, p_report_type text default 'monthly_activity', p_start date default (current_date - 30), p_end date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_content jsonb;
begin
  select org_id into v_org from public.customer_accounts where id = p_customer_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;

  v_content := jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'customer', (select customer_name from public.customer_accounts where id = p_customer_id),
    'aircraft_serviced', (select count(*) from public.aircraft_service_assignments where customer_account_id = p_customer_id and org_id = v_org),
    'work_packages', (select count(*) from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id where asa.customer_account_id = p_customer_id),
    'findings', (select count(*) from public.work_package_findings f join public.work_packages wp on wp.id = f.work_package_id join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id where asa.customer_account_id = p_customer_id),
    'wip_cost_usd', (select coalesce(sum(coalesce(wp.labor_cost_actual_usd,0) + coalesce(wp.parts_cost_actual_usd,0) + coalesce(wp.other_costs_usd,0)),0)
      from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id where asa.customer_account_id = p_customer_id),
    'sla', coalesce((select jsonb_agg(jsonb_build_object('type', m.sla_type, 'target', m.target_value, 'actual', m.actual_value, 'performance_pct', m.performance_pct, 'credits_owed_usd', m.credits_owed_usd))
      from public.sla_measurements m where m.customer_account_id = p_customer_id and m.measurement_period_end >= p_start), '[]'::jsonb),
    'open_findings', coalesce((select jsonb_agg(jsonb_build_object('severity', f.severity, 'description', f.description, 'status', f.resolution_status))
      from public.work_package_findings f join public.work_packages wp on wp.id = f.work_package_id join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id
      where asa.customer_account_id = p_customer_id and f.resolution_status in ('pending','approved_for_work','deferred')), '[]'::jsonb));

  insert into public.customer_reports (org_id, customer_account_id, report_type, reporting_period_start, reporting_period_end, generated_at_utc, generated_by_user_id, report_status, content)
  values (v_org, p_customer_id, p_report_type, p_start, p_end, now(), auth.uid(), 'generated', v_content)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.generate_customer_report(uuid, text, date, date) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Dashboards / reads
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.get_shop_floor_view()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select asa.id, asa.assignment_status, asa.primary_service_purpose, asa.assigned_hangar, asa.assigned_bay,
      asa.arrival_actual_utc, asa.planned_release_utc, asa.estimated_labor_hours, asa.actual_labor_hours,
      a.tail_number, a.aircraft_type, c.customer_name, c.id as customer_id,
      -- derived shop status: work-package holds override the assignment status
      case
        when exists (select 1 from public.work_packages wp where wp.service_assignment_id = asa.id and wp.status = 'awaiting_parts') then 'awaiting_parts'
        when exists (select 1 from public.work_packages wp where wp.service_assignment_id = asa.id and wp.status = 'awaiting_customer_approval') then 'awaiting_customer'
        else asa.assignment_status end as shop_status,
      (select count(*) from public.work_packages wp where wp.service_assignment_id = asa.id) as work_package_count,
      case when asa.planned_release_utc is not null and asa.arrival_actual_utc is not null and asa.planned_release_utc > asa.arrival_actual_utc
        then round(100.0 * extract(epoch from (now() - asa.arrival_actual_utc)) / nullif(extract(epoch from (asa.planned_release_utc - asa.arrival_actual_utc)),0), 0) else null end as tat_progress_pct
    from public.aircraft_service_assignments asa
    join public.aircraft a on a.id = asa.aircraft_id
    join public.customer_accounts c on c.id = asa.customer_account_id
    where asa.org_id = v_org and asa.assignment_status <> 'cancelled'
    order by asa.planned_release_utc nulls last) t), '[]'::jsonb);
end $$;
grant execute on function public.get_shop_floor_view() to authenticated;

create or replace function public.get_customer_accounts()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.customer_name) from (
    select c.*, (select count(*) from public.service_contracts sc where sc.customer_account_id = c.id and sc.contract_status = 'active') as active_contracts,
      (select count(*) from public.aircraft_service_assignments asa where asa.customer_account_id = c.id and asa.assignment_status in ('arrived','in_service','ready_for_release')) as active_service
    from public.customer_accounts c where c.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_customer_accounts() to authenticated;

create or replace function public.get_customer_dashboard(p_customer_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'customer', to_jsonb(c),
    'contracts', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.effective_from desc) from public.service_contracts sc where sc.customer_account_id = c.id), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('id', asa.id, 'status', asa.assignment_status, 'purpose', asa.primary_service_purpose,
        'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type, 'planned_release_utc', asa.planned_release_utc, 'arrival_actual_utc', asa.arrival_actual_utc))
      from public.aircraft_service_assignments asa join public.aircraft a on a.id = asa.aircraft_id where asa.customer_account_id = c.id), '[]'::jsonb),
    'work_packages', coalesce((select jsonb_agg(jsonb_build_object('id', wp.id, 'number', wp.work_package_number, 'title', wp.title, 'status', wp.status,
        'wip_cost', coalesce(wp.labor_cost_actual_usd,0)+coalesce(wp.parts_cost_actual_usd,0)+coalesce(wp.other_costs_usd,0)))
      from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id where asa.customer_account_id = c.id), '[]'::jsonb),
    'sla', coalesce((select jsonb_agg(to_jsonb(m) order by m.measurement_period_end desc) from public.sla_measurements m where m.customer_account_id = c.id), '[]'::jsonb),
    'financial', jsonb_build_object(
      'wip_cost_usd', (select coalesce(sum(coalesce(wp.labor_cost_actual_usd,0)+coalesce(wp.parts_cost_actual_usd,0)+coalesce(wp.other_costs_usd,0)),0)
        from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id where asa.customer_account_id = c.id),
      'annual_contract_value_usd', (select coalesce(sum(annual_value_usd),0) from public.service_contracts where customer_account_id = c.id and contract_status = 'active'),
      'credits_owed_usd', (select coalesce(sum(credits_owed_usd),0) from public.sla_measurements where customer_account_id = c.id)),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'report_type', r.report_type, 'status', r.report_status, 'generated_at_utc', r.generated_at_utc) order by r.created_at_utc desc) from public.customer_reports r where r.customer_account_id = c.id), '[]'::jsonb))
  from public.customer_accounts c where c.id = p_customer_id;
$$;
grant execute on function public.get_customer_dashboard(uuid) to authenticated;

create or replace function public.get_service_contracts()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.effective_from desc) from (
    select sc.id, sc.contract_number, sc.contract_name, sc.contract_type, sc.effective_from, sc.effective_to,
      sc.contract_status, sc.annual_value_usd, c.customer_name, c.id as customer_id,
      (sc.effective_to is not null and sc.effective_to <= current_date + 60) as expiring_soon
    from public.service_contracts sc join public.customer_accounts c on c.id = sc.customer_account_id where sc.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_service_contracts() to authenticated;

create or replace function public.get_contract_detail(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'contract', to_jsonb(sc),
    'customer', (select jsonb_build_object('id', c.id, 'name', c.customer_name, 'code', c.customer_code) from public.customer_accounts c where c.id = sc.customer_account_id),
    'active_work', coalesce((select jsonb_agg(jsonb_build_object('id', wp.id, 'number', wp.work_package_number, 'title', wp.title, 'status', wp.status, 'tail_number', a.tail_number))
      from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id join public.aircraft a on a.id = asa.aircraft_id
      where asa.service_contract_id = sc.id and wp.status not in ('complete','cancelled')), '[]'::jsonb),
    'sla_measurements', coalesce((select jsonb_agg(to_jsonb(m) order by m.measurement_period_end desc) from public.sla_measurements m where m.service_contract_id = sc.id), '[]'::jsonb))
  from public.service_contracts sc where sc.id = p_id;
$$;
grant execute on function public.get_contract_detail(uuid) to authenticated;

create or replace function public.get_active_contracts()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(sc)) from public.service_contracts sc where sc.org_id = v_org and sc.contract_status = 'active'), '[]'::jsonb);
end $$;
grant execute on function public.get_active_contracts() to authenticated;

create or replace function public.get_expiring_contracts(p_days int default 90)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'contract_number', sc.contract_number, 'contract_name', sc.contract_name,
    'customer_name', c.customer_name, 'effective_to', sc.effective_to, 'days_remaining', (sc.effective_to - current_date), 'annual_value_usd', sc.annual_value_usd) order by sc.effective_to)
    from public.service_contracts sc join public.customer_accounts c on c.id = sc.customer_account_id
    where sc.org_id = v_org and sc.contract_status in ('active','expiring_soon') and sc.effective_to is not null and sc.effective_to <= current_date + p_days), '[]'::jsonb);
end $$;
grant execute on function public.get_expiring_contracts(int) to authenticated;

create or replace function public.get_work_packages()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.created_at_utc desc) from (
    select wp.id, wp.work_package_number, wp.package_type, wp.title, wp.status, wp.planned_completion_utc,
      coalesce(wp.labor_cost_actual_usd,0)+coalesce(wp.parts_cost_actual_usd,0)+coalesce(wp.other_costs_usd,0) as wip_cost,
      a.tail_number, a.aircraft_type, c.customer_name, wp.created_at_utc,
      (select count(*) from public.work_package_findings f where f.work_package_id = wp.id) as finding_count
    from public.work_packages wp
    join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id
    join public.aircraft a on a.id = asa.aircraft_id
    join public.customer_accounts c on c.id = asa.customer_account_id
    where wp.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_work_packages() to authenticated;

create or replace function public.get_work_package_detail(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'work_package', to_jsonb(wp),
    'aircraft', (select jsonb_build_object('id', a.id, 'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type) from public.aircraft a join public.aircraft_service_assignments asa on asa.aircraft_id = a.id where asa.id = wp.service_assignment_id),
    'customer', (select jsonb_build_object('id', c.id, 'name', c.customer_name) from public.customer_accounts c join public.aircraft_service_assignments asa on asa.customer_account_id = c.id where asa.id = wp.service_assignment_id),
    'contract', (select jsonb_build_object('id', sc.id, 'number', sc.contract_number) from public.service_contracts sc join public.aircraft_service_assignments asa on asa.service_contract_id = sc.id where asa.id = wp.service_assignment_id),
    'findings', coalesce((select jsonb_agg(to_jsonb(f) order by f.discovered_at_utc desc) from public.work_package_findings f where f.work_package_id = wp.id), '[]'::jsonb))
  from public.work_packages wp where wp.id = p_id;
$$;
grant execute on function public.get_work_package_detail(uuid) to authenticated;

create or replace function public.get_wip_summary()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'total_wip_usd', (select coalesce(sum(coalesce(labor_cost_actual_usd,0)+coalesce(parts_cost_actual_usd,0)+coalesce(other_costs_usd,0)),0) from public.work_packages where org_id = v_org and status not in ('complete','cancelled')),
    'open_packages', (select count(*) from public.work_packages where org_id = v_org and status not in ('complete','cancelled')),
    'aircraft_in_service', (select count(*) from public.aircraft_service_assignments where org_id = v_org and assignment_status in ('arrived','in_service','ready_for_release')),
    'by_customer', coalesce((select jsonb_agg(row_to_json(t)) from (
      select c.customer_name, count(wp.id) as packages,
        coalesce(sum(coalesce(wp.labor_cost_actual_usd,0)+coalesce(wp.parts_cost_actual_usd,0)+coalesce(wp.other_costs_usd,0)),0) as wip_usd
      from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id join public.customer_accounts c on c.id = asa.customer_account_id
      where wp.org_id = v_org and wp.status not in ('complete','cancelled') group by c.customer_name order by wip_usd desc) t), '[]'::jsonb));
end $$;
grant execute on function public.get_wip_summary() to authenticated;

create or replace function public.get_customer_reports(p_customer_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at_utc desc), '[]'::jsonb) from public.customer_reports r where r.customer_account_id = p_customer_id;
$$;
grant execute on function public.get_customer_reports(uuid) to authenticated;

create or replace function public.get_aircraft_service_context(p_aircraft_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'assignment', to_jsonb(asa),
    'customer', (select jsonb_build_object('id', c.id, 'name', c.customer_name, 'code', c.customer_code) from public.customer_accounts c where c.id = asa.customer_account_id),
    'contract', (select jsonb_build_object('id', sc.id, 'number', sc.contract_number, 'name', sc.contract_name) from public.service_contracts sc where sc.id = asa.service_contract_id),
    'work_packages', coalesce((select jsonb_agg(jsonb_build_object('id', wp.id, 'number', wp.work_package_number, 'title', wp.title, 'status', wp.status)) from public.work_packages wp where wp.service_assignment_id = asa.id), '[]'::jsonb),
    'findings', coalesce((select jsonb_agg(jsonb_build_object('severity', f.severity, 'description', f.description, 'status', f.resolution_status))
      from public.work_package_findings f join public.work_packages wp on wp.id = f.work_package_id where wp.service_assignment_id = asa.id), '[]'::jsonb))
  from public.aircraft_service_assignments asa
  where asa.aircraft_id = p_aircraft_id and asa.assignment_status not in ('released','cancelled')
  order by asa.created_at_utc desc limit 1;
$$;
grant execute on function public.get_aircraft_service_context(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- MRO deterministic signals
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.generate_mro_signals_for_org(p_org uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_count int := 0; r record;
begin
  delete from public.signals where org_id = p_org and generated_by_model = 'mro-engine' and is_active;

  -- sla_breach_risk: in-service aircraft past 80% of its TAT window
  for r in
    select asa.aircraft_id, a.tail_number, c.customer_name, asa.planned_release_utc, asa.primary_service_purpose
    from public.aircraft_service_assignments asa join public.aircraft a on a.id = asa.aircraft_id join public.customer_accounts c on c.id = asa.customer_account_id
    where asa.org_id = p_org and asa.assignment_status = 'in_service' and asa.planned_release_utc is not null and asa.arrival_actual_utc is not null
      and now() > asa.arrival_actual_utc + (asa.planned_release_utc - asa.arrival_actual_utc) * 0.8
      and now() < asa.planned_release_utc order by asa.planned_release_utc limit 3
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'sla_breach_risk', 'high',
      left('TAT risk: ' || r.tail_number || ' (' || r.customer_name || ')', 200),
      r.tail_number || ' for ' || r.customer_name || ' (' || coalesce(r.primary_service_purpose,'service') || ') is past 80% of its contracted turnaround window, due ' || to_char(r.planned_release_utc,'Mon DD') || '. On-time release SLA is at risk.',
      'Expedite remaining work packages or notify the customer of a revised release.',
      'high', 'In-service assignment past 80% of its planned turnaround window.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','service_assignment','reference',r.tail_number,'summary','due ' || to_char(r.planned_release_utc,'Mon DD')))),
      '[]'::jsonb, 'observation', 'mro-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- contract_expiring_soon
  for r in
    select sc.id, sc.contract_number, sc.contract_name, c.customer_name, sc.effective_to
    from public.service_contracts sc join public.customer_accounts c on c.id = sc.customer_account_id
    where sc.org_id = p_org and sc.contract_status in ('active','expiring_soon') and sc.effective_to is not null and sc.effective_to <= current_date + 60 order by sc.effective_to limit 3
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'contract_expiring_soon', 'medium',
      left('Contract expiring: ' || r.contract_number || ' (' || r.customer_name || ')', 200),
      'Service contract ' || r.contract_number || ' with ' || r.customer_name || ' expires on ' || r.effective_to || '. Begin renewal to avoid a coverage gap.',
      'Initiate renewal discussions and confirm pricing/SLA terms with the customer.',
      'high', 'Active contract with effective_to within 60 days.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','service_contract','reference',r.contract_number,'summary','expires ' || r.effective_to))),
      '[]'::jsonb, 'observation', 'mro-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- customer_finding_notification_overdue
  for r in
    select f.id, f.description, f.severity, wp.work_package_number, c.customer_name, asa.aircraft_id, a.tail_number
    from public.work_package_findings f
    join public.work_packages wp on wp.id = f.work_package_id
    join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id
    join public.customer_accounts c on c.id = asa.customer_account_id
    join public.aircraft a on a.id = asa.aircraft_id
    where f.org_id = p_org and not f.customer_notified and f.severity in ('major','critical') and f.discovered_at_utc < now() - interval '24 hours' limit 3
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'customer_finding_notification_overdue', case when r.severity='critical' then 'critical' else 'high' end,
      left('Unnotified finding: ' || r.tail_number || ' (' || r.customer_name || ')', 200),
      'A ' || r.severity || ' finding on ' || r.tail_number || ' (WP ' || r.work_package_number || ') for ' || r.customer_name || ' was discovered over 24h ago and the customer has not been notified: ' || left(r.description, 120),
      'Notify the customer and obtain disposition before proceeding with additional work.',
      'high', 'Major/critical finding uncommunicated to the customer beyond 24 hours.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','finding','reference',r.work_package_number,'summary',r.severity || ' finding'))),
      '[]'::jsonb, 'observation', 'mro-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- work_package_stall
  for r in
    select wp.work_package_number, wp.title, wp.status, a.tail_number, c.customer_name, asa.aircraft_id
    from public.work_packages wp join public.aircraft_service_assignments asa on asa.id = wp.service_assignment_id
    join public.aircraft a on a.id = asa.aircraft_id join public.customer_accounts c on c.id = asa.customer_account_id
    where wp.org_id = p_org and wp.status in ('held','awaiting_parts') and wp.updated_at_utc < now() - interval '5 days' limit 2
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'work_package_stall', 'medium',
      left('Stalled WP ' || r.work_package_number || ' (' || r.status || ')', 200),
      'Work package ' || r.work_package_number || ' on ' || r.tail_number || ' for ' || r.customer_name || ' has been ' || r.status || ' for over 5 days, extending turnaround.',
      'Resolve the blocker (parts / approval) or reschedule to protect the release date.',
      'medium', 'Work package held/awaiting_parts beyond 5 days.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','work_package','reference',r.work_package_number,'summary',r.status))),
      '[]'::jsonb, 'observation', 'mro-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
grant execute on function public.generate_mro_signals_for_org(uuid) to authenticated, service_role;
