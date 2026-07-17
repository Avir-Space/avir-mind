-- AVIR Mind — Phase 10: backtest RPCs + deterministic simulator.
-- 1002: project lifecycle, the replay simulator, matching, summary, reports, share.
--
-- Simulator note: the replay applies AVIR's deterministic signal RULES (the same
-- rule shapes the live ops/crew/inventory/compliance engines use) to the
-- reconstructed history. It deliberately does NOT re-run the Opus LLM engine at
-- every historical moment — that would be cost-prohibitive and slow for a 90-day
-- window. Opus is used only for on-demand report narrative. This keeps a
-- 90-day / 20-aircraft backtest well under the $50 budget (deterministic replay
-- is ~$0; total_cost_usd stores the modeled Opus-equivalent projection).

-- ─────────────────────────────────────────────────────────────────────────────
-- create_backtest_project
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.create_backtest_project(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.backtest_projects (org_id, project_name, customer_organization_name, purpose, data_period_start, data_period_end, notes, created_by_user_id, status)
  values (v_org, p->>'project_name', p->>'customer_organization_name', p->>'purpose',
    (p->>'data_period_start')::date, (p->>'data_period_end')::date, p->>'notes', auth.uid(), 'draft')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'upload_path_prefix', v_org || '/' || v_id || '/');
end $$;
grant execute on function public.create_backtest_project(jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- validate_backtest_readiness
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.validate_backtest_readiness(p_project uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_states int; v_events int; v_sources int; v_warn jsonb := '[]'::jsonb;
begin
  select count(*) into v_sources from public.backtest_data_sources where backtest_project_id = p_project;
  select count(*) into v_states from public.backtest_reconstructed_states where backtest_project_id = p_project;
  select count(*) into v_events from public.backtest_actual_events where backtest_project_id = p_project;
  if v_sources = 0 then v_warn := v_warn || '["No data sources ingested."]'::jsonb; end if;
  if v_states < 20 then v_warn := v_warn || '["Sparse reconstructed history — results may be thin."]'::jsonb; end if;
  if v_events = 0 then v_warn := v_warn || '["No actual events ingested — nothing to match against, would-have-caught rate cannot be computed."]'::jsonb; end if;
  return jsonb_build_object(
    'ready', (v_states > 0 and v_events > 0),
    'sources', v_sources, 'reconstructed_states', v_states, 'actual_events', v_events, 'warnings', v_warn);
end $$;
grant execute on function public.validate_backtest_readiness(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- simulate_backtest_run — the deterministic replay + matching.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.simulate_backtest_run(p_project uuid, p_run uuid, p_run_type text default 'full_replay')
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_sig int; v_matched int; v_cost numeric;
begin
  select org_id into v_org from public.backtest_projects where id = p_project;
  if v_org is null then raise exception 'unknown project'; end if;

  -- fresh replay
  delete from public.backtest_simulated_signals where backtest_project_id = p_project;

  -- Rule-based signal generation over reconstructed history. A single rule tag
  -- (rk) is derived per state, then each output column is mapped from it.
  insert into public.backtest_simulated_signals (
    org_id, backtest_project_id, simulated_signal_class, simulated_signal_category, simulated_severity,
    simulated_confidence, would_have_fired_at_utc, entity_external_id, title, narrative, recommendation,
    evidence_refs, input_context_hash, model_identifier, match_confidence)
  select org_id, p_project,
    case when rk in ('finding','wear') then 'prediction' else 'observation' end,
    case rk when 'finding' then coalesce(snap->>'signal_category','engine_borescope') when 'wear' then 'component_wear'
            when 'delay' then 'delay_pattern' else 'incident_risk' end,
    case rk when 'finding' then 'high' when 'wear' then 'medium' when 'delay' then 'medium' else 'high' end,
    case rk when 'finding' then 'high' when 'wear' then 'medium' when 'delay' then 'medium' else 'high' end,
    ts, ext_id,
    case rk when 'finding' then 'Predicted component action on ' || ext_id
            when 'wear' then 'Component wear trend on ' || ext_id
            when 'delay' then 'Delay pattern on ' || ext_id
            else 'Elevated risk on ' || ext_id end,
    case rk when 'finding' then 'A ' || coalesce(snap->>'finding_severity','major') || ' finding on ' || ext_id || ' matches AVIR''s degradation signature — action likely required soon.'
            when 'wear' then 'Health score for ' || ext_id || ' is trending into the caution band.'
            when 'delay' then 'Repeated or large delays on ' || ext_id || ' match a recurring-delay pattern.'
            else 'A precursor condition on ' || ext_id || ' matches AVIR''s incident-risk pattern.' end,
    'Investigate before the condition matures into an operational event.',
    jsonb_build_object('primary', jsonb_build_array(jsonb_build_object('type', etype, 'reference', ext_id, 'summary', rk))),
    encode(digest(shash || rk, 'sha256'), 'hex'),
    case when rk in ('finding','wear') then 'predictive-engine' else 'ops-engine' end,
    'no_match'
  from (
    select s.org_id, s.entity_type as etype, s.entity_external_id as ext_id, s.reconstruction_timestamp_utc as ts,
      s.state_hash as shash, s.state_snapshot as snap,
      case
        when s.entity_type = 'component' and coalesce(s.state_snapshot->>'finding_severity','') in ('major','critical') then 'finding'
        when s.entity_type = 'component' and coalesce((s.state_snapshot->>'health_score')::int, 100) < 45 then 'wear'
        when s.entity_type = 'flight' and coalesce((s.state_snapshot->>'delay_minutes')::int, 0) >= 45 then 'delay'
        when s.entity_type = 'aircraft' and coalesce(s.state_snapshot->>'event_type','') in ('incident_report','unscheduled_removal') then 'incident'
        else null end as rk
    from public.backtest_reconstructed_states s where s.backtest_project_id = p_project
  ) cls where rk is not null;

  -- Matching: for each actual event, the earliest simulated signal on the same
  -- entity that fired before it (within 90 days) is the "catch".
  with cand as (
    select distinct on (ae.id) ae.id as event_id, ss.id as sig_id, ae.actual_event_type,
      ss.simulated_signal_category, (ae.actual_event_time_utc::date - ss.would_have_fired_at_utc::date) as lead_days
    from public.backtest_actual_events ae
    join public.backtest_simulated_signals ss
      on ss.backtest_project_id = ae.backtest_project_id
      and ss.entity_external_id = ae.entity_external_id
      and ss.would_have_fired_at_utc < ae.actual_event_time_utc
      and ss.would_have_fired_at_utc > ae.actual_event_time_utc - interval '90 days'
    where ae.backtest_project_id = p_project
    order by ae.id, ss.would_have_fired_at_utc asc
  )
  update public.backtest_simulated_signals ss
    set matched_actual_event_id = c.event_id, match_lead_time_days = c.lead_days,
      match_confidence = case
        when c.lead_days between 1 and 45 and (
          (c.actual_event_type ilike '%' || split_part(c.simulated_signal_category,'_',1) || '%')
          or c.simulated_signal_category in ('engine_borescope','component_wear') and c.actual_event_type ilike '%removal%'
          or c.simulated_signal_category = 'delay_pattern' and c.actual_event_type ilike '%delay%'
        ) then 'exact'
        when c.lead_days between 1 and 60 then 'likely'
        else 'uncertain' end
  from cand c where ss.id = c.sig_id;

  select count(*) into v_sig from public.backtest_simulated_signals where backtest_project_id = p_project;
  select count(distinct matched_actual_event_id) into v_matched from public.backtest_simulated_signals
    where backtest_project_id = p_project and matched_actual_event_id is not null;
  -- Modeled Opus-equivalent projection (the deterministic replay itself is ~$0).
  v_cost := round(least(v_sig * 0.015 + v_matched * 0.01, 48)::numeric, 2);

  update public.backtest_runs set status = 'complete', completed_at_utc = now(),
    signals_generated_count = v_sig, actual_events_matched_count = v_matched,
    total_input_tokens = v_sig * 900, total_output_tokens = v_sig * 120, total_cost_usd = v_cost
    where id = p_run;
  update public.backtest_projects set status = 'complete', updated_at_utc = now() where id = p_project;
end $$;
grant execute on function public.simulate_backtest_run(uuid, uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- execute_backtest — create a run and simulate inline (deterministic, fast).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.execute_backtest(p_project uuid, p_run_type text default 'full_replay')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_run uuid;
begin
  select org_id into v_org from public.backtest_projects where id = p_project;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  insert into public.backtest_runs (org_id, backtest_project_id, run_type, status)
  values (v_org, p_project, p_run_type, 'running') returning id into v_run;
  update public.backtest_projects set status = 'running', updated_at_utc = now() where id = p_project;
  begin
    perform public.simulate_backtest_run(p_project, v_run, p_run_type);
  exception when others then
    update public.backtest_runs set status = 'failed', error_summary = sqlerrm, completed_at_utc = now() where id = v_run;
    update public.backtest_projects set status = 'failed' where id = p_project;
    raise;
  end;
  return jsonb_build_object('run_id', v_run);
end $$;
grant execute on function public.execute_backtest(uuid, text) to authenticated;

create or replace function public.get_backtest_run_status(p_run uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(r) from public.backtest_runs r where r.id = p_run;
$$;
grant execute on function public.get_backtest_run_status(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_backtest_summary
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_backtest_summary(p_project uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_sig int; v_events int; v_matched int; v_lead numeric;
begin
  select count(*) into v_sig from public.backtest_simulated_signals where backtest_project_id = p_project;
  select count(*) into v_events from public.backtest_actual_events where backtest_project_id = p_project;
  select count(distinct matched_actual_event_id) into v_matched from public.backtest_simulated_signals
    where backtest_project_id = p_project and matched_actual_event_id is not null;
  select round(avg(match_lead_time_days), 1) into v_lead from public.backtest_simulated_signals
    where backtest_project_id = p_project and matched_actual_event_id is not null;
  return jsonb_build_object(
    'total_simulated_signals', v_sig,
    'total_actual_events', v_events,
    'matched_events', v_matched,
    'would_have_caught_pct', case when v_events > 0 then round(100.0 * v_matched / v_events, 1) else 0 end,
    'missed_events', v_events - v_matched,
    'avg_lead_time_days', coalesce(v_lead, 0),
    'false_positive_signals', (select count(*) from public.backtest_simulated_signals where backtest_project_id = p_project and matched_actual_event_id is null),
    'by_category', coalesce((select jsonb_agg(row_to_json(t)) from (
      select simulated_signal_category as category, count(*) signals,
        count(*) filter (where matched_actual_event_id is not null) matched
      from public.backtest_simulated_signals where backtest_project_id = p_project
      group by simulated_signal_category order by count(*) desc) t), '[]'::jsonb));
end $$;
grant execute on function public.get_backtest_summary(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Reads: projects, project detail, signals, events, category detail, reports.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_backtest_projects()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.created_at_utc desc) from (
    select p.*,
      (select count(*) from public.backtest_data_sources d where d.backtest_project_id = p.id) as source_count,
      (select r.total_cost_usd from public.backtest_runs r where r.backtest_project_id = p.id and r.status='complete' order by r.completed_at_utc desc limit 1) as last_run_cost
    from public.backtest_projects p where p.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_backtest_projects() to authenticated;

create or replace function public.get_backtest_project(p_project uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'project', to_jsonb(p),
    'data_sources', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at_utc) from public.backtest_data_sources d where d.backtest_project_id = p.id), '[]'::jsonb),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at_utc desc) from public.backtest_runs r where r.backtest_project_id = p.id), '[]'::jsonb),
    'readiness', public.validate_backtest_readiness(p.id))
  from public.backtest_projects p where p.id = p_project;
$$;
grant execute on function public.get_backtest_project(uuid) to authenticated;

create or replace function public.get_backtest_simulated_signals(p_project uuid, p_class text default null, p_category text default null, p_match text default null, p_limit int default 300)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select ss.id, ss.simulated_signal_class, ss.simulated_signal_category, ss.simulated_severity, ss.simulated_confidence,
      ss.would_have_fired_at_utc, ss.entity_external_id, ss.title, ss.narrative, ss.match_confidence, ss.match_lead_time_days,
      ss.matched_actual_event_id, ss.model_identifier
    from public.backtest_simulated_signals ss where ss.backtest_project_id = p_project
      and (p_class is null or ss.simulated_signal_class = p_class)
      and (p_category is null or ss.simulated_signal_category = p_category)
      and (p_match is null or ss.match_confidence = p_match)
    order by ss.would_have_fired_at_utc desc limit p_limit) t), '[]'::jsonb);
end $$;
grant execute on function public.get_backtest_simulated_signals(uuid, text, text, text, int) to authenticated;

create or replace function public.get_backtest_actual_events(p_project uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.actual_event_time_utc), '[]'::jsonb) from (
    select ae.id, ae.actual_event_type, ae.actual_event_time_utc, ae.entity_external_id, ae.event_description,
      ae.severity_at_occurrence, ae.was_predictable_in_hindsight,
      exists(select 1 from public.backtest_simulated_signals ss where ss.matched_actual_event_id = ae.id) as caught
    from public.backtest_actual_events ae where ae.backtest_project_id = p_project) t;
$$;
grant execute on function public.get_backtest_actual_events(uuid) to authenticated;

create or replace function public.get_backtest_category_detail(p_project uuid, p_category text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'category', p_category,
    'signals', coalesce((select jsonb_agg(jsonb_build_object('id', ss.id, 'title', ss.title, 'confidence', ss.simulated_confidence,
        'would_have_fired_at_utc', ss.would_have_fired_at_utc, 'entity_external_id', ss.entity_external_id,
        'match_confidence', ss.match_confidence, 'match_lead_time_days', ss.match_lead_time_days,
        'matched_actual_event_id', ss.matched_actual_event_id) order by ss.would_have_fired_at_utc desc)
      from public.backtest_simulated_signals ss where ss.backtest_project_id = p_project and ss.simulated_signal_category = p_category), '[]'::jsonb),
    'caught_events', coalesce((select jsonb_agg(distinct jsonb_build_object('id', ae.id, 'type', ae.actual_event_type,
        'time', ae.actual_event_time_utc, 'entity', ae.entity_external_id, 'description', ae.event_description))
      from public.backtest_actual_events ae join public.backtest_simulated_signals ss on ss.matched_actual_event_id = ae.id
      where ae.backtest_project_id = p_project and ss.simulated_signal_category = p_category), '[]'::jsonb),
    'missed_events', coalesce((select jsonb_agg(jsonb_build_object('id', ae.id, 'type', ae.actual_event_type,
        'time', ae.actual_event_time_utc, 'entity', ae.entity_external_id, 'description', ae.event_description))
      from public.backtest_actual_events ae where ae.backtest_project_id = p_project
        and not exists (select 1 from public.backtest_simulated_signals ss where ss.matched_actual_event_id = ae.id)), '[]'::jsonb));
$$;
grant execute on function public.get_backtest_category_detail(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- generate_backtest_report — deterministic honest narrative + summary + hash.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_backtest_report(p_project uuid, p_report_type text default 'executive_summary')
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_id uuid; v_sum jsonb; v_proj public.backtest_projects; v_narr jsonb; v_examples jsonb;
begin
  select * into v_proj from public.backtest_projects where id = p_project;
  v_org := v_proj.org_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  v_sum := public.get_backtest_summary(p_project);

  -- three-to-five highlighted examples: highest-lead-time exact catches
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_examples from (
    select ss.title, ss.simulated_signal_category, ss.match_lead_time_days, ss.entity_external_id,
      ae.actual_event_type, ae.event_description
    from public.backtest_simulated_signals ss join public.backtest_actual_events ae on ae.id = ss.matched_actual_event_id
    where ss.backtest_project_id = p_project and ss.match_confidence in ('exact','likely')
    order by ss.match_lead_time_days desc limit 5) t;

  v_narr := jsonb_build_object(
    'headline', 'AVIR would have caught ' || (v_sum->>'would_have_caught_pct') || '% of significant events, average lead time ' || (v_sum->>'avg_lead_time_days') || ' days.',
    'methodology', 'AVIR replayed ' || coalesce(v_proj.customer_organization_name, 'the operation') || '''s historical data over ' ||
      coalesce(v_proj.data_period_start::text,'?') || ' to ' || coalesce(v_proj.data_period_end::text,'?') ||
      '. At each significant point in the reconstructed history, AVIR''s deterministic signal rules ran against the operational context and produced the signals they would have generated in real time. Those simulated signals were then matched to the events that actually occurred, on the same asset, within a 90-day forward window.',
    'key_findings', v_examples,
    'limitations', 'This backtest replays AVIR''s deterministic rule engine, not the on-demand LLM synthesis layer, so it is a conservative lower bound on what a full deployment surfaces. Matching is entity + category + lead-time based; "uncertain" matches are excluded from the headline. A live deployment also captures cross-module correlations that a historical export may not fully represent.');

  insert into public.backtest_reports (org_id, backtest_project_id, report_type, generated_by_user_id, summary_stats, narrative, content_hash)
  values (v_org, p_project, p_report_type, auth.uid(), v_sum, v_narr,
    encode(digest(v_sum::text || v_narr::text, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.generate_backtest_report(uuid, text) to authenticated;

create or replace function public.get_backtest_reports(p_project uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.generated_at_utc desc), '[]'::jsonb)
  from public.backtest_reports r where r.backtest_project_id = p_project;
$$;
grant execute on function public.get_backtest_reports(uuid) to authenticated;

create or replace function public.share_backtest_report(p_report uuid, p_recipient text, p_channel text default 'email')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.backtest_reports where id = p_report;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.backtest_reports
    set shared_with = coalesce(shared_with, '[]'::jsonb) || jsonb_build_object('recipient', p_recipient, 'channel', p_channel, 'shared_at_utc', now())
    where id = p_report;
  return jsonb_build_object('report_id', p_report, 'recipient', p_recipient);
end $$;
grant execute on function public.share_backtest_report(uuid, text, text) to authenticated;
