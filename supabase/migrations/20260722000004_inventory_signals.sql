-- Phase 5 — cross-module inventory intelligence (deterministic).
-- Generates inventory_shortage / alternate_part_opportunity / stock_transfer_
-- opportunity / supplier_risk signals from real stock + prediction + task +
-- supplier data. Chosen over LLM-prompt injection: it's a stock-availability
-- lookup (not a judgment call), so it's more reliable and adds zero LLM cost.

create or replace function public.generate_inventory_signals_for_org(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count int := 0;
  r record;
  t record;
  v_ac uuid;
  v_alt text;
begin
  -- Idempotent refresh: clear our prior active inventory signals for this org.
  delete from public.signals where org_id = p_org and generated_by_model = 'inventory-engine' and is_active;

  -- A + B. Shortages of critical parts with active operational demand, + alternates.
  for r in
    select p.id as part_id, p.part_number, p.description, p.criticality, p.typical_lead_time_days,
      p.alternative_part_numbers, p.compatible_aircraft_types
    from public.parts p
    where p.org_id = p_org and p.criticality in ('safety_critical', 'ao_g_critical', 'rotational')
      and exists (select 1 from public.stock_holdings h where h.part_id = p.id and h.reorder_point is not null and h.quantity_available <= h.reorder_point)
      and coalesce(p.typical_lead_time_days, 0) >= 14
    order by case p.criticality when 'ao_g_critical' then 1 when 'safety_critical' then 2 else 3 end
    limit 4
  loop
    select a.id into v_ac from public.aircraft a
    where a.org_id = p_org and (r.compatible_aircraft_types is null or a.aircraft_type = any(r.compatible_aircraft_types))
      and (exists (select 1 from public.signals s where s.aircraft_id = a.id and s.is_active and s.signal_class = 'prediction')
           or exists (select 1 from public.tasks tk where tk.aircraft_id = a.id and tk.status <> 'done' and (tk.dispatch_blocking or tk.aog)))
    limit 1;
    if v_ac is null then
      select a.id into v_ac from public.aircraft a
      where a.org_id = p_org and (r.compatible_aircraft_types is null or a.aircraft_type = any(r.compatible_aircraft_types)) limit 1;
    end if;

    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation,
      confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, v_ac, 'inventory_shortage',
      case r.criticality when 'ao_g_critical' then 'critical' else 'high' end,
      left('Low stock on ' || r.part_number || ' — lead time may exceed need', 200),
      r.description || ' is at or below its reorder point and the supplier lead time is ' || coalesce(r.typical_lead_time_days, 0) ||
        ' days, which may exceed the window before it is next required by an open task or prediction.',
      'Reserve the remaining stock now and raise a purchase request; evaluate approved alternates in stock.',
      'high', 'Deterministic cross-module check: below reorder + lead time >= 14 days + active operational demand.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'part', 'id', r.part_id::text,
        'reference', r.part_number, 'summary', r.description || ' — below reorder, lead ' || coalesce(r.typical_lead_time_days, 0) || 'd'))),
      '[]'::jsonb, 'observation', 'inventory-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;

    if r.alternative_part_numbers is not null and array_length(r.alternative_part_numbers, 1) > 0 then
      select ap.part_number into v_alt from public.parts ap
      where ap.org_id = p_org and ap.part_number = any(r.alternative_part_numbers)
        and exists (select 1 from public.stock_holdings h where h.part_id = ap.id and h.quantity_available > 0)
      limit 1;
      if v_alt is not null then
        insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation,
          confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
        values (p_org, v_ac, 'alternate_part_opportunity', 'medium',
          left('Approved alternate in stock for ' || r.part_number, 200),
          'The short part ' || r.part_number || ' has an approved substitute (' || v_alt || ') currently in stock, avoiding a lead-time delay.',
          'Confirm engineering approval and use ' || v_alt || ' to cover near-term demand.',
          'high', 'Alternate part number listed on the catalog and found available in stock.',
          jsonb_build_object('primary', jsonb_build_array(
            jsonb_build_object('type', 'part', 'id', r.part_id::text, 'reference', r.part_number, 'summary', 'short part'),
            jsonb_build_object('type', 'part', 'reference', v_alt, 'summary', 'approved alternate in stock'))),
          '[]'::jsonb, 'observation', 'inventory-engine', md5(gen_random_uuid()::text));
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  -- C. Stock transfer opportunities (top 2).
  for t in
    select distinct on (low.part_id) p.part_number, p.description, ll.location_code as to_code, sl.location_code as from_code,
      sur.quantity_available as from_avail, low.quantity_available as to_avail, low.reorder_point as to_reorder
    from public.stock_holdings low
    join public.parts p on p.id = low.part_id and p.org_id = p_org
    join public.stock_locations ll on ll.id = low.location_id
    join public.stock_holdings sur on sur.part_id = low.part_id and sur.location_id <> low.location_id
    join public.stock_locations sl on sl.id = sur.location_id
    where low.reorder_point is not null and low.quantity_available <= low.reorder_point
      and sur.quantity_available > coalesce(sur.reorder_point, 0) + 5
    order by low.part_id, sur.quantity_available desc
    limit 2
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation,
      confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'stock_transfer_opportunity', 'medium',
      left('Rebalance ' || t.part_number || ': ' || t.from_code || ' surplus → ' || t.to_code || ' shortage', 200),
      'Move ' || t.description || ' from ' || t.from_code || ' (surplus: ' || t.from_avail || ' available) to ' || t.to_code ||
        ' (below reorder: ' || t.to_avail || ' of ' || t.to_reorder || ') to avoid a purchase.',
      'Initiate an internal stock transfer instead of raising a new order.',
      'high', 'Surplus above reorder at one hub and below reorder at another for the same part.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'part', 'reference', t.part_number,
        'summary', t.from_code || ' → ' || t.to_code))),
      '[]'::jsonb, 'observation', 'inventory-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- D. Supplier risk.
  for t in
    select supplier_name, performance_score from public.suppliers
    where org_id = p_org and performance_score is not null and performance_score < 70
    order by performance_score asc limit 1
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation,
      confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'supplier_risk', 'high',
      left('Supplier performance degraded: ' || t.supplier_name, 200),
      t.supplier_name || ' has a performance score of ' || t.performance_score || ', below the 70 threshold — late deliveries or quality issues.',
      'Diversify sourcing for parts where this supplier is the only or preferred source; review the relationship.',
      'high', 'Supplier performance_score below the 70 acceptance threshold.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', 'supplier', 'reference', t.supplier_name,
        'summary', 'performance ' || t.performance_score || '/100'))),
      '[]'::jsonb, 'observation', 'inventory-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;
grant execute on function public.generate_inventory_signals_for_org(uuid) to authenticated, service_role;

-- Client wrapper: generate for the caller's own org.
create or replace function public.generate_inventory_signals()
returns int language plpgsql security invoker set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;
  if v_org is null then return 0; end if;
  return public.generate_inventory_signals_for_org(v_org);
end $$;
grant execute on function public.generate_inventory_signals() to authenticated;
