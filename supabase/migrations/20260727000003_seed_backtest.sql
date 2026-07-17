-- AVIR Mind — Phase 10: backtest seed.
-- 1003: three sample projects. Project A is fully replayed with a realistic
-- ~71% would-have-caught rate (20 of 28 actual events have a precursor state the
-- rule engine fires on; the rest are honest misses), plus false-positive signals
-- so the rate is neither 0% nor 100%. Project B is ingested-but-not-run;
-- Project C is an empty draft. Wired into signup + backfilled.

create or replace function public.seed_demo_backtest(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_run uuid; e int; v_type text; v_entity text; v_etime timestamptz; v_lead int; caught boolean; v_sum jsonb;
begin
  if p_org_id is null or p_user_id is null then return; end if;
  delete from public.backtest_projects where org_id = p_org_id;

  -- ── Project A — complete, with run + report ──
  insert into public.backtest_projects (org_id, project_name, customer_organization_name, purpose, status, data_period_start, data_period_end, created_by_user_id, notes)
  values (p_org_id, 'Northstar Air — 90-Day Evaluation', 'Northstar Air (Part 135)', 'customer_evaluation', 'draft', current_date - 90, current_date, p_user_id, 'Prospect evaluation: replay of their AMOS + flight exports.')
  returning id into v_a;

  insert into public.backtest_data_sources (org_id, backtest_project_id, source_type, source_file_name, source_file_size_bytes, source_storage_path, rows_ingested, ingested_at_utc)
  values
    (p_org_id, v_a, 'csv_aircraft_events', 'aircraft_events_q2.csv', 184320, p_org_id || '/' || v_a || '/aircraft_events_q2.csv', 420, now() - interval '2 days'),
    (p_org_id, v_a, 'csv_component_events', 'component_events_q2.csv', 241664, p_org_id || '/' || v_a || '/component_events_q2.csv', 512, now() - interval '2 days'),
    (p_org_id, v_a, 'csv_flights', 'flights_q2.csv', 356352, p_org_id || '/' || v_a || '/flights_q2.csv', 1840, now() - interval '2 days'),
    (p_org_id, v_a, 'json_amos_export', 'amos_findings.json', 98304, p_org_id || '/' || v_a || '/amos_findings.json', 96, now() - interval '2 days');

  for e in 1..28 loop
    v_type := case when e <= 12 then 'unscheduled_component_removal' when e <= 22 then 'flight_delay' else 'aog_incident' end;
    v_entity := case when e <= 12 then 'CMP-' || (1000 + e) else 'NS-1' || lpad(e::text, 2, '0') end;
    v_etime := now() - ((5 + e * 2.7) || ' days')::interval;
    caught := e <= 20;  -- 20 of 28 → ~71%
    if caught then
      v_lead := 3 + (e % 5) * 7;  -- 3..31 days
      insert into public.backtest_reconstructed_states (org_id, backtest_project_id, entity_type, entity_external_id, reconstruction_timestamp_utc, state_snapshot, state_hash)
      values (p_org_id, v_a,
        case when v_type = 'unscheduled_component_removal' then 'component' when v_type = 'flight_delay' then 'flight' else 'aircraft' end,
        v_entity, v_etime - (v_lead || ' days')::interval,
        case when v_type = 'unscheduled_component_removal' then jsonb_build_object('finding_severity','major','signal_category','engine_borescope','part_number','PN-'||(4000+e))
             when v_type = 'flight_delay' then jsonb_build_object('delay_minutes', 55 + e, 'flight_number', 'NS' || (200 + e))
             else jsonb_build_object('event_type','incident_report','detail','precursor anomaly detected') end,
        md5(v_entity || e::text || 'pre'));
    end if;
    insert into public.backtest_actual_events (org_id, backtest_project_id, actual_event_type, actual_event_time_utc, entity_external_id, event_description, severity_at_occurrence, was_predictable_in_hindsight)
    values (p_org_id, v_a, v_type, v_etime, v_entity,
      case v_type when 'unscheduled_component_removal' then 'Unscheduled removal — ' || v_entity
                  when 'flight_delay' then 'Delay over 45 min — ' || v_entity else 'AOG incident — ' || v_entity end,
      case when v_type = 'aog_incident' then 'critical' else 'high' end, caught);
  end loop;

  -- false-positive precursor states (fire signals with no matching event)
  insert into public.backtest_reconstructed_states (org_id, backtest_project_id, entity_type, entity_external_id, reconstruction_timestamp_utc, state_snapshot, state_hash)
  select p_org_id, v_a, 'component', 'CMP-FP-' || g, now() - ((g * 3) || ' days')::interval,
    jsonb_build_object('finding_severity', case when g % 2 = 0 then 'major' else 'critical' end, 'signal_category', 'component_wear'),
    md5('fp' || g::text)
  from generate_series(1, 14) g;

  insert into public.backtest_runs (org_id, backtest_project_id, run_type, status) values (p_org_id, v_a, 'full_replay', 'running') returning id into v_run;
  perform public.simulate_backtest_run(v_a, v_run, 'full_replay');
  v_sum := public.get_backtest_summary(v_a);
  insert into public.backtest_reports (org_id, backtest_project_id, report_type, generated_by_user_id, summary_stats, narrative, content_hash)
  values (p_org_id, v_a, 'executive_summary', p_user_id, v_sum,
    jsonb_build_object(
      'headline', 'AVIR would have caught ' || (v_sum->>'would_have_caught_pct') || '% of significant events, average lead time ' || (v_sum->>'avg_lead_time_days') || ' days.',
      'methodology', 'AVIR replayed Northstar Air''s historical AMOS + flight exports over the last 90 days. At each significant point in the reconstructed history, AVIR''s deterministic signal rules ran against the operational context and produced the signals they would have generated in real time; those were matched to the events that actually occurred, on the same asset, within a 90-day forward window.',
      'key_findings', coalesce((select jsonb_agg(row_to_json(t)) from (
        select ss.title, ss.simulated_signal_category, ss.match_lead_time_days, ss.entity_external_id, ae.actual_event_type, ae.event_description
        from public.backtest_simulated_signals ss join public.backtest_actual_events ae on ae.id = ss.matched_actual_event_id
        where ss.backtest_project_id = v_a and ss.match_confidence in ('exact','likely')
        order by ss.match_lead_time_days desc limit 5) t), '[]'::jsonb),
      'limitations', 'This backtest replays AVIR''s deterministic rule engine, not the on-demand LLM synthesis layer, so it is a conservative lower bound. "Uncertain" matches are excluded from the headline.'),
    md5(v_sum::text));

  -- ── Project B — ingested, not yet run ──
  insert into public.backtest_projects (org_id, project_name, customer_organization_name, purpose, status, data_period_start, data_period_end, created_by_user_id, notes)
  values (p_org_id, 'Part 135 Demo — Q2 Sample', 'Skyline Charter', 'sales_demo', 'draft', current_date - 60, current_date, p_user_id, 'Sales demo dataset — ready to run.')
  returning id into v_b;
  insert into public.backtest_data_sources (org_id, backtest_project_id, source_type, source_file_name, source_file_size_bytes, source_storage_path, rows_ingested, ingested_at_utc)
  values
    (p_org_id, v_b, 'csv_component_events', 'skyline_components.csv', 132096, p_org_id || '/' || v_b || '/skyline_components.csv', 260, now() - interval '1 day'),
    (p_org_id, v_b, 'json_trax_export', 'skyline_trax.json', 61440, p_org_id || '/' || v_b || '/skyline_trax.json', 74, now() - interval '1 day');
  insert into public.backtest_reconstructed_states (org_id, backtest_project_id, entity_type, entity_external_id, reconstruction_timestamp_utc, state_snapshot, state_hash)
  select p_org_id, v_b, 'component', 'SKY-CMP-' || g, now() - ((g * 2) || ' days')::interval,
    jsonb_build_object('finding_severity', case when g % 3 = 0 then 'major' else 'minor' end, 'signal_category', 'engine_borescope'),
    md5('skyb' || g::text) from generate_series(1, 30) g;
  insert into public.backtest_actual_events (org_id, backtest_project_id, actual_event_type, actual_event_time_utc, entity_external_id, event_description, severity_at_occurrence)
  select p_org_id, v_b, 'unscheduled_component_removal', now() - ((g * 5) || ' days')::interval, 'SKY-CMP-' || (g * 3), 'Removal — SKY-CMP-' || (g * 3), 'high'
  from generate_series(1, 8) g;
  update public.backtest_projects set status = 'ready_to_run', updated_at_utc = now() where id = v_b;

  -- ── Project C — empty draft ──
  insert into public.backtest_projects (org_id, project_name, customer_organization_name, purpose, status, created_by_user_id, notes)
  values (p_org_id, 'Internal Validation — Home Fleet', null, 'internal_validation', 'draft', p_user_id, 'Reserved for an internal validation replay.')
  returning id into v_c;
end $$;
grant execute on function public.seed_demo_backtest(uuid, uuid) to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Wire into signup + backfill.
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
    if r.user_id is not null then
      perform public.seed_demo_backtest(r.org_id, r.user_id);
    end if;
  end loop;
end $$;
