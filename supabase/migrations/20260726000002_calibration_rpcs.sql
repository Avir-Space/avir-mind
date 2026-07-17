-- AVIR Mind — Phase 9: calibration RPCs.
-- 0902: compute snapshots, generate scoreboards (deterministic honest narrative),
-- tenant dashboard + drill-downs, badge map for signal cards, mark outcomes,
-- publish, and export. Compute/generate are SECURITY DEFINER; reads are INVOKER.

-- ═════════════════════════════════════════════════════════════════════════════
-- compute_calibration_snapshot — aggregate one (org, window, date) into rows at
-- the (class × category × confidence × model) grain. Idempotent per key.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.compute_calibration_snapshot(p_org_id uuid, p_window_days int, p_snapshot_date date default current_date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows int; v_start timestamptz; v_end timestamptz;
begin
  v_end := (p_snapshot_date + 1)::timestamptz;
  v_start := v_end - (p_window_days || ' days')::interval;

  delete from public.calibration_snapshots
    where org_id = p_org_id and snapshot_date = p_snapshot_date and window_days = p_window_days and snapshot_scope = 'tenant';

  with base as (
    select s.id, s.signal_class, s.category, s.confidence, coalesce(s.generated_by_model,'unknown') as model,
      s.accuracy_result,
      exists(select 1 from public.signal_actions a where a.signal_id = s.id and a.action_type = 'marked_correct') as mk_correct,
      exists(select 1 from public.signal_actions a where a.signal_id = s.id and a.action_type = 'marked_incorrect') as mk_incorrect,
      exists(select 1 from public.signal_actions a where a.signal_id = s.id and a.action_type = 'dismissed') as dismissed,
      exists(select 1 from public.signal_actions a where a.signal_id = s.id and a.action_type = 'create_task') as actioned
    from public.signals s
    where s.org_id = p_org_id and s.generated_at_utc >= v_start and s.generated_at_utc < v_end
      and s.confidence in ('high','medium','low')
  ),
  resolved as (
    select b.*,
      case when signal_class = 'prediction' then (accuracy_result is not null and accuracy_result <> 'pending')
           else (mk_correct or mk_incorrect) end as has_outcome,
      case when signal_class = 'prediction' then accuracy_result
           when mk_correct then 'correct' when mk_incorrect then 'incorrect' else 'pending' end as outcome
    from base b
  ),
  ins as (
    insert into public.calibration_snapshots (
      org_id, snapshot_date, snapshot_scope, signal_class, signal_category, confidence_level, model_identifier, window_days,
      total_signals, signals_with_outcome, correct_count, partial_count, incorrect_count,
      accuracy_pct, weighted_accuracy_pct, coverage_pct, dismissal_rate, action_rate, sample_size_status)
    select p_org_id, p_snapshot_date, 'tenant', signal_class, category, confidence, model, p_window_days,
      count(*),
      count(*) filter (where has_outcome),
      count(*) filter (where outcome = 'correct'),
      count(*) filter (where outcome = 'partial'),
      count(*) filter (where outcome = 'incorrect'),
      round(100.0 * count(*) filter (where outcome = 'correct') / nullif(count(*) filter (where has_outcome), 0), 2),
      round(100.0 * (count(*) filter (where outcome = 'correct') + 0.5 * count(*) filter (where outcome = 'partial')) / nullif(count(*) filter (where has_outcome), 0), 2),
      round(100.0 * count(*) filter (where has_outcome) / nullif(count(*), 0), 2),
      round(100.0 * count(*) filter (where dismissed) / nullif(count(*), 0), 2),
      round(100.0 * count(*) filter (where actioned) / nullif(count(*), 0), 2),
      case when count(*) >= 30 then 'sufficient' when count(*) >= 10 then 'marginal' else 'insufficient' end
    from resolved
    group by signal_class, category, confidence, model
    returning 1)
  select count(*) into v_rows from ins;

  return jsonb_build_object('org_id', p_org_id, 'window_days', p_window_days, 'snapshot_date', p_snapshot_date, 'rows', v_rows);
end $$;
grant execute on function public.compute_calibration_snapshot(uuid, int, date) to authenticated, service_role;

-- Refresh cross-tenant aggregate from tenant snapshots for a date (privacy
-- threshold enforced on read/publish; rows stored with participating_org_count).
create or replace function public.refresh_cross_tenant_calibration(p_snapshot_date date default current_date)
returns int language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  delete from public.cross_tenant_calibration_snapshots where snapshot_date = p_snapshot_date;
  with ins as (
    insert into public.cross_tenant_calibration_snapshots (
      snapshot_date, signal_class, signal_category, confidence_level, model_identifier, window_days,
      participating_org_count, total_signals, signals_with_outcome, correct_count, partial_count, incorrect_count,
      accuracy_pct, weighted_accuracy_pct)
    select snapshot_date, signal_class, signal_category, confidence_level, model_identifier, window_days,
      count(distinct org_id), sum(total_signals), sum(signals_with_outcome), sum(correct_count), sum(partial_count), sum(incorrect_count),
      round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome), 0), 2),
      round(100.0 * (sum(correct_count) + 0.5 * sum(partial_count)) / nullif(sum(signals_with_outcome), 0), 2)
    from public.calibration_snapshots
    where snapshot_scope = 'tenant' and snapshot_date = p_snapshot_date and org_id is not null
    group by snapshot_date, signal_class, signal_category, confidence_level, model_identifier, window_days
    returning 1)
  select count(*) into v_rows from ins;
  return v_rows;
end $$;
grant execute on function public.refresh_cross_tenant_calibration(date) to authenticated, service_role;

-- Nightly job: recompute all windows for the caller's org + cross-tenant refresh.
create or replace function public.recompute_all_calibration(p_org_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := coalesce(p_org_id, public._caller_org()); w int; v_total int := 0;
begin
  if v_org is null then return '{}'::jsonb; end if;
  foreach w in array array[7,30,90,180,365] loop
    perform public.compute_calibration_snapshot(v_org, w, current_date);
    v_total := v_total + 1;
  end loop;
  perform public.refresh_cross_tenant_calibration(current_date);
  return jsonb_build_object('windows_computed', v_total);
end $$;
grant execute on function public.recompute_all_calibration(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Latest snapshot set helper (aggregate across models) → jsonb rows.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public._latest_cal_date(p_org uuid, p_window int)
returns date language sql stable security invoker set search_path = public as $$
  select max(snapshot_date) from public.calibration_snapshots
    where org_id = p_org and window_days = p_window and snapshot_scope = 'tenant';
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- get_tenant_calibration_dashboard — the /calibration page payload.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.get_tenant_calibration_dashboard(p_window_days int default 180)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org(); v_date date; v_prior date;
begin
  if v_org is null then return '{}'::jsonb; end if;
  v_date := public._latest_cal_date(v_org, p_window_days);
  if v_date is null then return jsonb_build_object('has_data', false); end if;
  -- prior comparison point ~30 days earlier for the delta
  select max(snapshot_date) into v_prior from public.calibration_snapshots
    where org_id = v_org and window_days = p_window_days and snapshot_scope = 'tenant' and snapshot_date <= v_date - 20;

  return jsonb_build_object(
    'has_data', true, 'window_days', p_window_days, 'snapshot_date', v_date,
    'stats', (
      select jsonb_build_object(
        'overall_accuracy_pct', round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome), 0), 1),
        'weighted_accuracy_pct', round(100.0 * (sum(correct_count) + 0.5 * sum(partial_count)) / nullif(sum(signals_with_outcome), 0), 1),
        'total_measured', sum(signals_with_outcome),
        'total_signals', sum(total_signals),
        'coverage_pct', round(100.0 * sum(signals_with_outcome) / nullif(sum(total_signals), 0), 1),
        'action_rate_pct', round(100.0 * sum(round(action_rate * total_signals / 100.0)) / nullif(sum(total_signals), 0), 1),
        'dismissal_rate_pct', round(100.0 * sum(round(dismissal_rate * total_signals / 100.0)) / nullif(sum(total_signals), 0), 1))
      from public.calibration_snapshots where org_id = v_org and window_days = p_window_days and snapshot_date = v_date),
    'delta_vs_prior', (
      case when v_prior is null then null else (
        select round((select (100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0)) from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date)
                   - (select (100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0)) from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_prior), 1)) end),
    'by_category', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.signal_category), '[]'::jsonb) from (
        select signal_category, sum(total_signals) total_signals, sum(signals_with_outcome) measured,
          sum(correct_count) correct, sum(partial_count) partial, sum(incorrect_count) incorrect,
          round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0), 1) accuracy_pct,
          case when sum(total_signals) >= 30 then 'sufficient' when sum(total_signals) >= 10 then 'marginal' else 'insufficient' end sample_size_status
        from public.calibration_snapshots where org_id = v_org and window_days = p_window_days and snapshot_date = v_date
        group by signal_category) t),
    'by_confidence', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select confidence_level, sum(total_signals) total_signals, sum(signals_with_outcome) measured,
          sum(correct_count) correct, sum(incorrect_count) incorrect,
          round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0), 1) accuracy_pct
        from public.calibration_snapshots where org_id = v_org and window_days = p_window_days and snapshot_date = v_date
        group by confidence_level order by case confidence_level when 'high' then 1 when 'medium' then 2 else 3 end) t),
    'by_model', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.model_identifier), '[]'::jsonb) from (
        select model_identifier, sum(total_signals) total_signals, sum(signals_with_outcome) measured,
          sum(correct_count) correct, round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0), 1) accuracy_pct
        from public.calibration_snapshots where org_id = v_org and window_days = p_window_days and snapshot_date = v_date
        group by model_identifier) t),
    'by_class', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select signal_class, sum(total_signals) total_signals, sum(signals_with_outcome) measured,
          round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0), 1) accuracy_pct,
          round(100.0 * sum(signals_with_outcome) / nullif(sum(total_signals),0), 1) coverage_pct
        from public.calibration_snapshots where org_id = v_org and window_days = p_window_days and snapshot_date = v_date
        group by signal_class) t),
    'grid', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.signal_category, t.confidence_level), '[]'::jsonb) from (
        select signal_category, confidence_level, sum(total_signals) total_signals, sum(signals_with_outcome) measured,
          sum(correct_count) correct, sum(partial_count) partial, sum(incorrect_count) incorrect,
          round(100.0 * sum(correct_count) / nullif(sum(signals_with_outcome),0), 1) accuracy_pct,
          case when sum(total_signals) >= 30 then 'sufficient' when sum(total_signals) >= 10 then 'marginal' else 'insufficient' end sample_size_status
        from public.calibration_snapshots where org_id = v_org and window_days = p_window_days and snapshot_date = v_date
        group by signal_category, confidence_level) t));
end $$;
grant execute on function public.get_tenant_calibration_dashboard(int) to authenticated;

-- Category drill-down: history + sample signals with outcomes + model comparison.
create or replace function public.get_calibration_category_detail(p_category text, p_window_days int default 180)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org(); v_end timestamptz := (current_date + 1)::timestamptz; v_start timestamptz;
begin
  if v_org is null then return '{}'::jsonb; end if;
  v_start := v_end - (p_window_days || ' days')::interval;
  return jsonb_build_object(
    'category', p_category, 'window_days', p_window_days,
    'history', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.snapshot_date), '[]'::jsonb) from (
        select snapshot_date, sum(signals_with_outcome) measured, round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),1) accuracy_pct
        from public.calibration_snapshots where org_id=v_org and signal_category=p_category and window_days=30 and snapshot_scope='tenant'
        group by snapshot_date) t),
    'by_model', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select model_identifier, sum(signals_with_outcome) measured, round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),1) accuracy_pct
        from public.calibration_snapshots where org_id=v_org and signal_category=p_category and window_days=p_window_days
          and snapshot_date=public._latest_cal_date(v_org,p_window_days) group by model_identifier) t),
    'samples', (
      select coalesce(jsonb_agg(row_to_json(t)), '{}'::jsonb) from (
        select
          coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'confidence',confidence,'generated_at_utc',generated_at_utc)) filter (where outcome='correct'), '[]'::jsonb) as correct,
          coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'confidence',confidence,'generated_at_utc',generated_at_utc)) filter (where outcome='partial'), '[]'::jsonb) as partial,
          coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'confidence',confidence,'generated_at_utc',generated_at_utc)) filter (where outcome='incorrect'), '[]'::jsonb) as incorrect
        from (
          select s.id, s.title, s.confidence, s.generated_at_utc,
            case when s.signal_class='prediction' then s.accuracy_result
                 when exists(select 1 from public.signal_actions a where a.signal_id=s.id and a.action_type='marked_correct') then 'correct'
                 when exists(select 1 from public.signal_actions a where a.signal_id=s.id and a.action_type='marked_incorrect') then 'incorrect'
                 else 'pending' end as outcome
          from public.signals s where s.org_id=v_org and s.category=p_category and s.generated_at_utc>=v_start
          order by s.generated_at_utc desc limit 200) q
        where outcome in ('correct','partial','incorrect')) t));
end $$;
grant execute on function public.get_calibration_category_detail(text, int) to authenticated;

-- Trend series (rolling 30d window over available snapshot dates).
create or replace function public.get_calibration_trends()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.snapshot_date) from (
    select snapshot_date,
      round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),1) accuracy_pct,
      round(100.0*sum(correct_count) filter (where confidence_level='high')/nullif(sum(signals_with_outcome) filter (where confidence_level='high'),0),1) high_conf_accuracy_pct,
      sum(signals_with_outcome) measured
    from public.calibration_snapshots where org_id=v_org and window_days=30 and snapshot_scope='tenant'
    group by snapshot_date) t), '[]'::jsonb);
end $$;
grant execute on function public.get_calibration_trends() to authenticated;

-- Badge map for signal cards: category|confidence → accuracy + sample status
-- (180d window, latest snapshot, only where sample is not insufficient).
create or replace function public.get_calibration_badge_map()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org(); v_date date;
begin
  if v_org is null then return '{}'::jsonb; end if;
  v_date := public._latest_cal_date(v_org, 180);
  if v_date is null then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(key, val) from (
    select signal_category || '|' || confidence_level as key,
      jsonb_build_object('accuracy_pct', round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),0),
        'measured', sum(signals_with_outcome),
        'sample_size_status', case when sum(total_signals) >= 30 then 'sufficient' when sum(total_signals) >= 10 then 'marginal' else 'insufficient' end) as val
    from public.calibration_snapshots
    where org_id=v_org and window_days=180 and snapshot_date=v_date
    group by signal_category, confidence_level
    having sum(signals_with_outcome) > 0 and sum(total_signals) >= 10) q), '{}'::jsonb);
end $$;
grant execute on function public.get_calibration_badge_map() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- generate_calibration_scoreboard — compile snapshots + a deterministic, honest
-- narrative. The Opus edge function can later enrich narrative on demand.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.generate_calibration_scoreboard(p_scoreboard_type text default 'tenant_internal', p_window_days int default 180, p_narrative_style text default 'balanced', p_org_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := coalesce(p_org_id, public._caller_org()); v_date date; v_id uuid; v_ids uuid[];
  v_overall numeric; v_measured int; v_total int; v_high numeric;
  v_strengths jsonb; v_improve jsonb; v_cat_narr jsonb; v_summary jsonb;
begin
  if v_org is null then raise exception 'no org'; end if;
  v_date := public._latest_cal_date(v_org, p_window_days);
  if v_date is null then raise exception 'no calibration data for window'; end if;

  select array_agg(id) into v_ids from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date;
  select round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),1), sum(signals_with_outcome), sum(total_signals)
    into v_overall, v_measured, v_total from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date;
  select round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),1) into v_high
    from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date and confidence_level='high';

  -- strengths: sufficient sample + accuracy >= 70
  select coalesce(jsonb_agg(signal_category || ' — ' || acc || '% at ' || confidence_level || ' confidence (n=' || tot || ')'), '[]'::jsonb) into v_strengths from (
    select signal_category, confidence_level, round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),0) acc, sum(total_signals) tot
    from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date
    group by signal_category, confidence_level
    having sum(total_signals) >= 30 and (100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0)) >= 70 order by acc desc limit 5) x;

  -- improvements: sufficient sample + (accuracy < 55, or high-confidence but < 65 = overconfident)
  select coalesce(jsonb_agg(signal_category || ' — only ' || acc || '% correct at ' || confidence_level || ' confidence (n=' || tot || ')' ||
      case when confidence_level='high' and acc < 65 then ' — overconfident; recommend recalibration' else '' end), '[]'::jsonb) into v_improve from (
    select signal_category, confidence_level, round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),0) acc, sum(total_signals) tot
    from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date
    group by signal_category, confidence_level
    having sum(total_signals) >= 30 and ((100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0)) < 55 or (confidence_level='high' and (100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0)) < 65))
    order by acc asc limit 5) x;

  -- per-category narratives (honest, grounded)
  select coalesce(jsonb_object_agg(signal_category, narr), '{}'::jsonb) into v_cat_narr from (
    select signal_category,
      'High-confidence predictions in this category were correct ' ||
      coalesce(round(100.0*sum(correct_count) filter (where confidence_level='high')/nullif(sum(signals_with_outcome) filter (where confidence_level='high'),0),0)::text,'—') ||
      '% of the time (n=' || coalesce(sum(total_signals) filter (where confidence_level='high'),0) || '). Overall accuracy across all confidence levels was ' ||
      coalesce(round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),0)::text,'—') || '% over ' || sum(signals_with_outcome) || ' measured outcomes.' as narr
    from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date
    group by signal_category) x;

  v_summary := jsonb_build_object('overall_accuracy_pct', v_overall, 'high_confidence_accuracy_pct', v_high,
    'total_measured', v_measured, 'total_signals', v_total, 'window_days', p_window_days, 'snapshot_date', v_date);

  insert into public.calibration_scoreboards (scoreboard_name, scoreboard_type, org_id, window_days, snapshot_ids, summary_stats, narrative, confidence_notes)
  values (
    'Calibration ' || p_window_days || 'd — ' || to_char(v_date, 'YYYY-MM-DD'), p_scoreboard_type,
    case when p_scoreboard_type = 'tenant_internal' then v_org else null end,
    p_window_days, coalesce(v_ids,'{}'), v_summary,
    jsonb_build_object(
      'overall_narrative', 'AVIR''s predictions were correct ' || coalesce(v_high::text,'—') || '% of the time at high confidence over ' || p_window_days ||
        ' days, computed against N=' || v_measured || ' measured outcomes (of ' || v_total || ' total signals). Across all confidence levels, accuracy was ' || coalesce(v_overall::text,'—') || '%.',
      'category_narratives', v_cat_narr,
      'areas_of_strength', v_strengths,
      'areas_needing_improvement', v_improve,
      'methodology_notes', 'Accuracy = correct / measured outcomes. Predictions count as measured once accuracy_result leaves ''pending''; observations once a human marks them correct/incorrect. Categories with n<30 are flagged marginal/insufficient and should be read with caution. This narrative is generated deterministically from the snapshots; an Opus-authored narrative can be regenerated on demand.'),
    jsonb_build_object('generated_by', 'deterministic', 'style', p_narrative_style))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.generate_calibration_scoreboard(text, int, text, uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- mark_prediction_outcome — human observes the outcome directly.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.mark_prediction_outcome(p_signal_id uuid, p_accuracy_result text, p_notes text default null, p_component_event_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.signals; v_delta int;
begin
  select * into s from public.signals where id = p_signal_id;
  if s.id is null or not public.is_org_member(s.org_id) then raise exception 'not authorized'; end if;
  if p_accuracy_result not in ('correct','partial','incorrect') then raise exception 'invalid accuracy_result'; end if;

  update public.signals set accuracy_result = p_accuracy_result, accuracy_measured_at_utc = now(),
    accuracy_notes = coalesce(p_notes, accuracy_notes) where id = p_signal_id;

  if s.prediction_horizon ? 'lower_bound_date' and s.prediction_horizon ? 'upper_bound_date' then
    v_delta := (current_date - (((s.prediction_horizon->>'lower_bound_date')::date + ((s.prediction_horizon->>'upper_bound_date')::date - (s.prediction_horizon->>'lower_bound_date')::date)/2)));
  end if;

  insert into public.calibration_events (org_id, signal_id, ai_decision_record_id, calibration_event_type, signal_class, signal_category, confidence_level, accuracy_result, matched_component_event_id, horizon_delta_days, notes)
  values (s.org_id, s.id, (select id from public.ai_decision_records where linked_signal_id = s.id limit 1),
    'accuracy_marked', s.signal_class, s.category, s.confidence, p_accuracy_result, p_component_event_id, v_delta, p_notes);

  return jsonb_build_object('signal_id', p_signal_id, 'accuracy_result', p_accuracy_result, 'horizon_delta_days', v_delta);
end $$;
grant execute on function public.mark_prediction_outcome(uuid, text, text, uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- publish_scoreboard — admin-only, requires content-hash confirmation.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.publish_scoreboard(p_scoreboard_id uuid, p_channel text, p_content_hash text, p_url text default null, p_metadata jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare b public.calibration_scoreboards; v_hash text; v_pub_id uuid;
begin
  select * into b from public.calibration_scoreboards where id = p_scoreboard_id;
  if b.id is null then raise exception 'scoreboard not found'; end if;
  if b.org_id is not null and not public.is_org_admin(b.org_id) then raise exception 'only tenant admins may publish'; end if;

  v_hash := encode(digest(coalesce(b.narrative::text,'') || coalesce(b.summary_stats::text,''), 'sha256'), 'hex');
  if p_content_hash <> v_hash then
    raise exception 'content hash mismatch — the scoreboard changed since preview (expected %)', v_hash;
  end if;

  update public.calibration_scoreboards set is_published = true, published_at_utc = now() where id = p_scoreboard_id;
  insert into public.calibration_publications (scoreboard_id, publication_channel, published_by_user_id, publication_content_hash, publication_url, publication_metadata)
  values (p_scoreboard_id, p_channel, auth.uid(), v_hash, p_url, p_metadata)
  returning id into v_pub_id;
  return jsonb_build_object('publication_id', v_pub_id, 'content_hash', v_hash, 'channel', p_channel);
end $$;
grant execute on function public.publish_scoreboard(uuid, text, text, text, jsonb) to authenticated;

-- Content hash for the publish confirmation (frontend reads this before publishing).
create or replace function public.get_scoreboard_content_hash(p_scoreboard_id uuid)
returns text language sql stable security definer set search_path = public, extensions as $$
  select encode(digest(coalesce(narrative::text,'') || coalesce(summary_stats::text,''), 'sha256'), 'hex')
  from public.calibration_scoreboards where id = p_scoreboard_id;
$$;
grant execute on function public.get_scoreboard_content_hash(uuid) to authenticated;

-- Scoreboard reads.
create or replace function public.get_calibration_scoreboards()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.generated_at_utc desc) from (
    select b.id, b.scoreboard_name, b.scoreboard_type, b.window_days, b.summary_stats, b.is_published, b.published_at_utc, b.generated_at_utc
    from public.calibration_scoreboards b where b.org_id = v_org or b.is_published) t), '[]'::jsonb);
end $$;
grant execute on function public.get_calibration_scoreboards() to authenticated;

create or replace function public.get_scoreboard(p_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select to_jsonb(b) from public.calibration_scoreboards b where b.id = p_id;
$$;
grant execute on function public.get_scoreboard(uuid) to authenticated;

create or replace function public.get_calibration_publications()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.published_at_utc desc) from (
    select p.id, p.scoreboard_id, b.scoreboard_name, b.window_days, p.publication_channel, p.published_at_utc, p.publication_content_hash, p.publication_url
    from public.calibration_publications p join public.calibration_scoreboards b on b.id = p.scoreboard_id
    where b.org_id = v_org or b.is_published) t), '[]'::jsonb);
end $$;
grant execute on function public.get_calibration_publications() to authenticated;

-- Export a tenant calibration report (JSON payload; frontend renders/downloads).
create or replace function public.export_calibration_report(p_window_days int default 180)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org(); v_date date;
begin
  if v_org is null then return '{}'::jsonb; end if;
  v_date := public._latest_cal_date(v_org, p_window_days);
  return jsonb_build_object(
    'report_metadata', jsonb_build_object('org_id', v_org, 'org_name', (select name from public.orgs where id=v_org),
      'window_days', p_window_days, 'snapshot_date', v_date, 'generated_at_utc', now(),
      'methodology', 'Accuracy = correct / measured outcomes over the window. Sample flags: sufficient n>=30, marginal n>=10, insufficient n<10.'),
    'dashboard', public.get_tenant_calibration_dashboard(p_window_days),
    'trends', public.get_calibration_trends(),
    'snapshots', coalesce((select jsonb_agg(to_jsonb(cs)) from public.calibration_snapshots cs where cs.org_id=v_org and cs.window_days=p_window_days and cs.snapshot_date=v_date), '[]'::jsonb));
end $$;
grant execute on function public.export_calibration_report(int) to authenticated;
