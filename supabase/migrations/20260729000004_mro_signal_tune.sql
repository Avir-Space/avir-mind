-- AVIR Mind — Phase 12: tune the sla_breach_risk threshold from 80% → 75% of the
-- turnaround window (a TAT is genuinely at risk once past three-quarters of its
-- window), then refresh MRO signals for existing MRO tenants.

create or replace function public.generate_mro_signals_for_org(p_org uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_count int := 0; r record;
begin
  delete from public.signals where org_id = p_org and generated_by_model = 'mro-engine' and is_active;

  for r in
    select asa.aircraft_id, a.tail_number, c.customer_name, asa.planned_release_utc, asa.primary_service_purpose
    from public.aircraft_service_assignments asa join public.aircraft a on a.id = asa.aircraft_id join public.customer_accounts c on c.id = asa.customer_account_id
    where asa.org_id = p_org and asa.assignment_status = 'in_service' and asa.planned_release_utc is not null and asa.arrival_actual_utc is not null
      and now() > asa.arrival_actual_utc + (asa.planned_release_utc - asa.arrival_actual_utc) * 0.75
      and now() < asa.planned_release_utc order by asa.planned_release_utc limit 3
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'sla_breach_risk', 'high',
      left('TAT risk: ' || r.tail_number || ' (' || r.customer_name || ')', 200),
      r.tail_number || ' for ' || r.customer_name || ' (' || coalesce(r.primary_service_purpose,'service') || ') is past 75% of its contracted turnaround window, due ' || to_char(r.planned_release_utc,'Mon DD') || '. On-time release SLA is at risk.',
      'Expedite remaining work packages or notify the customer of a revised release.',
      'high', 'In-service assignment past 75% of its planned turnaround window.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','service_assignment','reference',r.tail_number,'summary','due ' || to_char(r.planned_release_utc,'Mon DD')))),
      '[]'::jsonb, 'observation', 'mro-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

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

do $$
declare r record;
begin
  for r in select id from public.orgs where primary_business_model = 'mro' loop
    perform public.generate_mro_signals_for_org(r.id);
  end loop;
end $$;
