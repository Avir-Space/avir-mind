-- AVIR Mind — Phase 8: compliance-aware signals + seed.
-- 0804: deterministic compliance signals (pulled straight from the compliance
-- tables — no LLM, no per-signup cost) and realistic seed data. Wired into
-- signup + backfilled for existing orgs.

-- ═════════════════════════════════════════════════════════════════════════════
-- Deterministic compliance signals.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.generate_compliance_signals_for_org(p_org uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_count int := 0; r record; v_gap int;
begin
  delete from public.signals where org_id = p_org and generated_by_model = 'compliance-engine' and is_active;

  -- ad_deadline_approaching: an open AD deadline within 30 days.
  for r in
    select s.aircraft_id, a.tail_number, d.ad_number, d.issuing_authority, d.ad_title, d.compliance_deadline_date, d.criticality,
      (d.compliance_deadline_date - current_date) as days_left
    from public.aircraft_ad_status s
    join public.airworthiness_directives d on d.id = s.ad_id
    join public.aircraft a on a.id = s.aircraft_id
    where s.org_id = p_org and s.status in ('open','in_progress')
      and d.compliance_deadline_date is not null and d.compliance_deadline_date <= current_date + 30
    order by d.compliance_deadline_date limit 5
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'ad_deadline_approaching',
      case when r.criticality = 'emergency' or r.days_left <= 7 then 'critical' else 'high' end,
      left('AD ' || r.ad_number || ' due in ' || r.days_left || 'd on ' || r.tail_number, 200),
      'Airworthiness Directive ' || r.ad_number || ' (' || upper(r.issuing_authority) || ' — ' || r.ad_title || ') is open on ' || r.tail_number || ' with a compliance deadline of ' || r.compliance_deadline_date || ' (' || r.days_left || ' days). ',
      'Schedule the method of compliance before the deadline or arrange an approved deferral.',
      'high', 'Open AD status with a compliance_deadline_date inside the 30-day window.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','airworthiness_directive','reference',r.ad_number,'summary',upper(r.issuing_authority) || ' · due ' || r.compliance_deadline_date))),
      '[]'::jsonb, 'observation', 'compliance-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- sb_recommendation_open: an alert-class SB open beyond ~30 days.
  for r in
    select s.aircraft_id, a.tail_number, b.sb_number, b.manufacturer, b.sb_title, b.issued_date
    from public.aircraft_sb_status s
    join public.service_bulletins b on b.id = s.sb_id
    join public.aircraft a on a.id = s.aircraft_id
    where s.org_id = p_org and s.status in ('open','in_progress') and b.classification = 'alert'
      and b.issued_date <= current_date - 30
    order by b.issued_date limit 3
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'sb_recommendation_open', 'medium',
      left('Alert SB ' || r.sb_number || ' open on ' || r.tail_number, 200),
      'Alert Service Bulletin ' || r.sb_number || ' (' || r.manufacturer || ' — ' || r.sb_title || ') has been open on ' || r.tail_number || ' since ' || r.issued_date || ', beyond the typical response window.',
      'Evaluate the SB for accomplishment or formally record the disposition.',
      'medium', 'Alert-class SB open more than 30 days after issue.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','service_bulletin','reference',r.sb_number,'summary',r.manufacturer || ' · issued ' || r.issued_date))),
      '[]'::jsonb, 'observation', 'compliance-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- mel_extension_risk: a deferred MEL item approaching its repair-by date.
  for r in
    select m.aircraft_id, a.tail_number, c.mel_item_number, c.system_name, c.category, m.repair_by_date,
      (m.repair_by_date - current_date) as days_left
    from public.aircraft_mel_items m
    join public.mel_catalog c on c.id = m.mel_catalog_id
    join public.aircraft a on a.id = m.aircraft_id
    where m.org_id = p_org and m.status in ('open','extended') and m.repair_by_date <= current_date + 5
    order by m.repair_by_date limit 4
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'mel_extension_risk',
      case when r.days_left <= 1 then 'critical' else 'high' end,
      left('MEL ' || r.mel_item_number || ' repair due in ' || r.days_left || 'd on ' || r.tail_number, 200),
      'Deferred MEL item ' || r.mel_item_number || ' (' || r.system_name || ', category ' || upper(r.category) || ') on ' || r.tail_number || ' must be rectified by ' || r.repair_by_date || ' (' || r.days_left || ' days). Dispatch reliability and the placard status are affected.',
      'Rectify the item or seek an approved extension before the interval expires.',
      'high', 'Open MEL item with a repair-by date inside the 5-day window.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','mel_item','reference',r.mel_item_number,'summary','cat ' || upper(r.category) || ' · due ' || r.repair_by_date))),
      '[]'::jsonb, 'observation', 'compliance-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- llp_approaching_limit: a life-limited part near its limit.
  for r in
    select l.id, comp.aircraft_id, a.tail_number, comp.part_number, comp.component_type, l.life_limit_type,
      l.remaining, l.percentage_used, l.criticality
    from public.life_limited_parts l
    join public.components comp on comp.id = l.component_id
    left join public.aircraft a on a.id = comp.aircraft_id
    where l.org_id = p_org and l.percentage_used >= 88
    order by l.percentage_used desc limit 4
  loop
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, r.aircraft_id, 'llp_approaching_limit',
      case when r.percentage_used >= 95 or r.criticality = 'safety_critical' then 'critical' else 'high' end,
      left('LLP ' || r.part_number || ' at ' || r.percentage_used || '% life', 200),
      'Life-limited part ' || r.part_number || ' (' || r.component_type || ') on ' || coalesce(r.tail_number,'inventory') || ' has used ' || r.percentage_used || '% of its ' || r.life_limit_type || ' limit — ' || round(r.remaining) || ' ' || r.life_limit_type || ' remaining. This is a hard limit.',
      'Plan removal/replacement before the limit is reached; a hard-life part cannot be extended.',
      'high', 'Life-limited part at or above 88% of its certified limit.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','life_limited_part','reference',r.part_number,'summary',r.percentage_used || '% used · ' || round(r.remaining) || ' ' || r.life_limit_type || ' left'))),
      '[]'::jsonb, 'observation', 'compliance-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end loop;

  -- dsai_oversight_gap: many AI decisions unreviewed by any human (DS.AI risk).
  select count(*) into v_gap from public.ai_decision_records adr
    where adr.org_id = p_org and adr.decision_at_utc >= now() - interval '30 days'
      and not exists (select 1 from public.human_oversight_events h where h.ai_decision_record_id = adr.id);
  if v_gap >= 5 then
    insert into public.signals (org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning, evidence_refs, suggested_actions, signal_class, generated_by_model, generation_context_hash)
    values (p_org, null, 'dsai_oversight_gap', 'medium',
      left(v_gap || ' AI decisions await human review', 200),
      v_gap || ' AI-generated decisions in the last 30 days have not been reviewed, accepted, or dismissed by any human. Under EASA DS.AI (NPA 2025-07), decisions used in regulated operations require documented human oversight.',
      'Triage the unreviewed decisions in the DS.AI Audit trail and record a disposition for each.',
      'high', 'Count of ai_decision_records with no linked human_oversight_events over a rolling 30 days.',
      jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type','dsai','reference','oversight_gap','summary',v_gap || ' decisions unreviewed'))),
      '[]'::jsonb, 'observation', 'compliance-engine', md5(gen_random_uuid()::text));
    v_count := v_count + 1;
  end if;

  return v_count;
end $$;
grant execute on function public.generate_compliance_signals_for_org(uuid) to authenticated, service_role;

create or replace function public.generate_compliance_signals()
returns int language plpgsql security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return 0; end if;
  return public.generate_compliance_signals_for_org(v_org);
end $$;
grant execute on function public.generate_compliance_signals() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Seed — 40 ADs, 25 SBs, MEL catalog + active items, 12 LLPs, 6 reports.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.seed_demo_compliance(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_types text[]; v_type text; v_ad_id uuid; v_sb_id uuid; v_task_id uuid; v_cat public.mel_catalog;
  r_ac record; r_comp record; rnd numeric; i int; j int;
  v_auth text; v_crit text; v_class text; v_mfr text;
  v_days int[]; v_pcts numeric[]; v_lltype text; v_llval numeric; v_curr numeric; v_llcrit text;
begin
  -- idempotent
  delete from public.regulatory_reports where org_id = p_org_id;
  delete from public.aircraft_mel_items where org_id = p_org_id;
  delete from public.life_limited_parts where org_id = p_org_id;
  delete from public.mel_catalog where org_id = p_org_id;
  delete from public.aircraft_sb_status where org_id = p_org_id;
  delete from public.aircraft_ad_status where org_id = p_org_id;
  delete from public.service_bulletins where org_id = p_org_id;
  delete from public.airworthiness_directives where org_id = p_org_id;

  select array_agg(distinct aircraft_type) into v_types from public.aircraft where org_id = p_org_id;
  if v_types is null or array_length(v_types,1) = 0 then return; end if;

  -- ── 39 catalog ADs + 1 guaranteed near-deadline AD = 40 ──
  for i in 1..39 loop
    v_auth := (array['faa','easa','dgca','easa','faa','uk_caa'])[1 + (i % 6)];
    v_crit := (array['mandatory','mandatory','recommended','mandatory','emergency'])[1 + (i % 5)];
    v_type := v_types[1 + (i % array_length(v_types,1))];
    insert into public.airworthiness_directives (org_id, ad_number, issuing_authority, ad_title, ad_summary, effective_date, compliance_deadline_date, compliance_deadline_flight_hours, applicable_aircraft_types, criticality, ad_document_url)
    values (p_org_id, '2024-' || lpad((10 + i)::text, 2, '0') || '-' || lpad(((i * 3) % 30 + 1)::text, 2, '0'), v_auth,
      (array['Fuel pump wiring inspection','Wing spar cap fatigue','Rudder actuator seal','Engine fan blade root','Landing gear pin corrosion','Cargo door latch','Pitot heat monitoring','FADEC software update','Slat track lubrication','Battery thermal runaway'])[1 + (i % 10)] || ' — ' || v_type,
      'Recurring inspection / corrective action mandated by ' || upper(v_auth) || ' for ' || v_type || ' operators.',
      current_date - (60 + i * 6),
      case when i % 4 = 0 then null else current_date - (60 + i * 6) + (150 + i * 4) end,
      case when i % 6 = 0 then 500 + i * 50 else null end,
      array[v_type], v_crit, 'https://ad.example.aero/' || v_auth || '/2024-' || (10 + i))
    returning id into v_ad_id;

    for r_ac in select id from public.aircraft where org_id = p_org_id and aircraft_type = v_type loop
      rnd := random();
      insert into public.aircraft_ad_status (org_id, aircraft_id, ad_id, status, compliance_method, complied_at_date, performed_by, documentation_reference, deferral_authority, deferral_expiry_date)
      values (p_org_id, r_ac.id, v_ad_id,
        case when rnd < 0.70 then 'complied' when rnd < 0.90 then 'open' else 'deferred' end,
        case when rnd < 0.70 then 'Inspection per AD MoC' else null end,
        case when rnd < 0.70 then current_date - floor(random() * 200)::int else null end,
        case when rnd < 0.70 then (array['MRO Line Maintenance','Base Maintenance','CAMO'])[1 + floor(random()*3)::int] else null end,
        case when rnd < 0.70 then 'WO-' || floor(random()*90000 + 10000)::int else null end,
        case when rnd >= 0.90 then 'CAMO deferral board' else null end,
        case when rnd >= 0.90 then current_date + 45 else null end)
      on conflict (org_id, aircraft_id, ad_id) do nothing;
    end loop;
  end loop;

  -- Guaranteed near-deadline open AD (DoD: ad_deadline_approaching).
  insert into public.airworthiness_directives (org_id, ad_number, issuing_authority, ad_title, ad_summary, effective_date, compliance_deadline_date, applicable_aircraft_types, criticality, ad_document_url)
  values (p_org_id, '2024-30-URGENT', 'faa', 'Elevator trim jackscrew inspection — ' || v_types[1],
    'Emergency inspection following in-service findings; applies fleet-wide to type ' || v_types[1] || '.',
    current_date - 20, current_date + 12, array[v_types[1]], 'emergency', 'https://ad.example.aero/faa/2024-30')
  returning id into v_ad_id;
  for r_ac in select id from public.aircraft where org_id = p_org_id and aircraft_type = v_types[1] loop
    insert into public.aircraft_ad_status (org_id, aircraft_id, ad_id, status, notes)
    values (p_org_id, r_ac.id, v_ad_id, 'open', 'Awaiting slot — near deadline.')
    on conflict (org_id, aircraft_id, ad_id) do update set status = 'open';
  end loop;

  -- ── 24 SBs + 1 guaranteed open alert = 25 ──
  for i in 1..24 loop
    v_class := (array['alert','recommended','recommended','optional','informational'])[1 + (i % 5)];
    v_mfr := (array['Airbus','Boeing','Embraer','Bombardier','Gulfstream','Dassault','CFM','Pratt & Whitney'])[1 + (i % 8)];
    v_type := v_types[1 + (i % array_length(v_types,1))];
    insert into public.service_bulletins (org_id, sb_number, manufacturer, sb_title, sb_summary, issued_date, recommended_by_date, applicable_aircraft_types, classification)
    values (p_org_id, 'SB-' || v_mfr || '-' || lpad(i::text,3,'0'), v_mfr,
      (array['Hydraulic reservoir upgrade','Cabin altitude sensor rework','Nacelle anti-ice modification','Avionics cooling fan replacement','Flap carriage inspection','APU generator SB','Windshield heat harness'])[1 + (i % 7)] || ' — ' || v_type,
      'Manufacturer service bulletin for ' || v_type || '.',
      current_date - (20 + i * 5), current_date + (30 + i * 4), array[v_type], v_class)
    returning id into v_sb_id;
    for r_ac in select id from public.aircraft where org_id = p_org_id and aircraft_type = v_type loop
      insert into public.aircraft_sb_status (org_id, aircraft_id, sb_id, status)
      values (p_org_id, r_ac.id, v_sb_id, case when random() < 0.55 then 'complied' else 'open' end)
      on conflict (org_id, aircraft_id, sb_id) do nothing;
    end loop;
  end loop;
  insert into public.service_bulletins (org_id, sb_number, manufacturer, sb_title, sb_summary, issued_date, recommended_by_date, applicable_aircraft_types, classification)
  values (p_org_id, 'SB-ALERT-001', 'Airbus', 'Alert: engine mount bolt torque re-check — ' || v_types[1],
    'Alert SB requiring prompt evaluation.', current_date - 60, current_date + 5, array[v_types[1]], 'alert')
  returning id into v_sb_id;
  for r_ac in select id from public.aircraft where org_id = p_org_id and aircraft_type = v_types[1] loop
    insert into public.aircraft_sb_status (org_id, aircraft_id, sb_id, status) values (p_org_id, r_ac.id, v_sb_id, 'open')
    on conflict (org_id, aircraft_id, sb_id) do nothing;
  end loop;

  -- ── MEL catalog: ~40 items per aircraft type ──
  foreach v_type in array v_types loop
    for j in 1..40 loop
      insert into public.mel_catalog (org_id, aircraft_type, mel_item_number, ata_chapter, system_name, item_description, category, repair_interval_days, number_installed, number_required, operational_procedure, maintenance_procedure, placard_required)
      values (p_org_id, v_type,
        lpad((21 + (j % 15))::text,2,'0') || '-' || lpad((j % 9 + 1)::text,2,'0') || '-' || lpad(j::text,2,'0'),
        (21 + (j % 15))::text,
        (array['Air Conditioning','Electrical Power','Equipment','Fire Protection','Flight Controls','Fuel','Hydraulic Power','Ice & Rain','Lights','Navigation','Oxygen','Pneumatic','Water/Waste','APU','Doors'])[1 + (j % 15)],
        (array['One pack may be inoperative','One generator may be inoperative','A cabin light may be inoperative','One smoke detector inop','Yaw damper inop','One fuel quantity indicator inop','Standby hydraulic pump inop','One windshield heat inop','Reading light inop','One VOR inop','Passenger oxygen mask row inop','Bleed valve inop','Potable water unusable','APU inop','Cargo door warning inop'])[1 + (j % 15)],
        (array['a','b','c','d','c','b','c','d'])[1 + (j % 8)],
        (array[999,3,10,120,10,3,10,120])[1 + (j % 8)],
        (array[2,2,4,4,1,3,2,3])[1 + (j % 8)],
        (array[1,1,2,3,1,2,1,2])[1 + (j % 8)],
        'Operate per approved MEL operational procedure (O).',
        'Deactivate and placard per approved MEL maintenance procedure (M).',
        (j % 5 <> 0))
      on conflict (org_id, aircraft_type, mel_item_number) do nothing;
    end loop;
  end loop;

  -- ── 7 active MEL items across the fleet, varied repair-by urgency ──
  v_days := array[2, 5, 9, 20, 45, 80, 110];
  i := 0;
  for r_ac in select a.id, a.aircraft_type, a.base_station from public.aircraft a where a.org_id = p_org_id order by a.tail_number limit 7 loop
    i := i + 1;
    select * into v_cat from public.mel_catalog where org_id = p_org_id and aircraft_type = r_ac.aircraft_type order by random() limit 1;
    if v_cat.id is null then continue; end if;
    insert into public.tasks (org_id, aircraft_id, title, why_summary, parent_type, sub_type, status, risk_band, dispatch_blocking, station_code, due_at_utc, reporter_user_id)
    values (p_org_id, r_ac.id, 'MEL ' || v_cat.mel_item_number || ' — ' || v_cat.system_name,
      'Deferred MEL item requires rectification.', 'compliance', 'mel_reconciliation', 'queued',
      case when v_days[i] <= 5 then 'high' else 'medium' end, false, r_ac.base_station,
      (current_date + v_days[i])::timestamptz, p_user_id)
    returning id into v_task_id;
    insert into public.aircraft_mel_items (org_id, aircraft_id, mel_catalog_id, deferred_by_user_id, reason, repair_by_date, status, placard_installed, linked_task_id, deferred_at_utc)
    values (p_org_id, r_ac.id, v_cat.id, p_user_id,
      (array['Part on order','Awaiting engineering disposition','Deferred at line for schedule','Troubleshooting continues'])[1 + (i % 4)],
      current_date + v_days[i], 'open', v_cat.placard_required, v_task_id, now() - (i || ' days')::interval);
  end loop;

  -- ── 12 LLPs across the fleet, varied %used (one ≥95, one ≥90 for DoD) ──
  v_pcts := array[95, 92, 78, 63, 51, 44, 88, 57, 39, 27, 16, 71];
  i := 0;
  for r_comp in select c.id, c.component_type, c.limit_cycles, c.limit_flight_hours from public.components c
    where c.org_id = p_org_id and c.aircraft_id is not null order by c.created_at_utc limit 12 loop
    i := i + 1;
    v_lltype := (array['cycles','flight_hours','calendar_time'])[1 + (i % 3)];
    v_llval := case v_lltype
      when 'cycles' then coalesce(nullif(r_comp.limit_cycles,0), 20000)
      when 'flight_hours' then coalesce(nullif(r_comp.limit_flight_hours,0), 30000)
      else 120 end;  -- calendar months
    v_curr := round(v_llval * v_pcts[i] / 100.0, 2);
    v_llcrit := (array['safety_critical','regulatory_required','operator_policy'])[1 + (i % 3)];
    insert into public.life_limited_parts (org_id, component_id, life_limit_type, life_limit_value, current_value, criticality, source_document, created_at_utc)
    values (p_org_id, r_comp.id, v_lltype, v_llval, v_curr, v_llcrit,
      (array['MPD Section 9','AD 2024-14-05','SB Airbus-021','CMM life limit','Type Certificate Data Sheet'])[1 + (i % 5)],
      now() - (v_pcts[i] || ' months')::interval);
  end loop;

  -- ── 6 regulatory reports (mix filed / draft) ──
  insert into public.regulatory_reports (org_id, report_type, issuing_regulator, report_reference, filed_at_date, filed_by_user_id, linked_event_id, report_summary, status, follow_up_actions)
  values
    (p_org_id, 'mor', 'FAA', 'MOR-2026-0142', current_date - 30, p_user_id, 'engine surge event', 'Mandatory Occurrence Report: momentary engine surge during climb; no injuries, aircraft returned to service after inspection.', 'filed', '[{"action":"Borescope inspection","status":"complete"}]'::jsonb),
    (p_org_id, 'msr', 'EASA', 'MSR-2026-0067', current_date - 18, p_user_id, 'hydraulic leak', 'Maintenance Status Report: hydraulic reservoir leak found during A-check.', 'acknowledged', '[]'::jsonb),
    (p_org_id, 'sms_incident', 'DGCA', 'SMS-2026-0031', null, null, 'ground handling', 'SMS incident: ground vehicle contacted winglet during pushback. Under investigation.', 'draft', '[{"action":"Interview ground crew","status":"open"}]'::jsonb),
    (p_org_id, 'srr', 'UK CAA', 'SRR-2026-0009', current_date - 8, p_user_id, 'bird strike', 'Safety Related Report: bird strike on approach; nacelle inspection nil findings.', 'filed', '[]'::jsonb),
    (p_org_id, 'quality_audit', 'Internal QA', 'QA-2026-Q2', current_date - 45, p_user_id, null, 'Quarterly quality audit of line maintenance station procedures.', 'closed', '[]'::jsonb),
    (p_org_id, 'mor', 'FAA', 'MOR-2026-0155', null, null, 'cabin pressure', 'Draft MOR: cabin pressure fluctuation reported by crew; data under review.', 'draft', '[]'::jsonb);
end $$;
grant execute on function public.seed_demo_compliance(uuid, uuid) to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Wire into signup + backfill existing orgs.
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
      -- compliance signals last: dsai_oversight_gap needs the other signals'
      -- decision records to already exist.
      perform public.generate_compliance_signals_for_org(v_org);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select o.id as org_id, (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id from public.orgs o loop
    perform public.seed_demo_compliance(r.org_id, r.user_id);
    perform public.generate_compliance_signals_for_org(r.org_id);
  end loop;
end $$;
