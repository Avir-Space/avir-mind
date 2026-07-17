-- AVIR Mind — Phase 9: calibration seed.
-- 0903: build an HONEST prediction history (spread over 365 days, with a real
-- calibration curve — well-calibrated categories, one overconfident category, one
-- insufficient-sample category), attach outcomes + actions, emit calibration_events,
-- compute snapshots across dates/windows, refresh cross-tenant, and generate a
-- sample (unpublished) scoreboard. Seed signals are inactive so they don't flood
-- the live inbox. Tagged generation_context_hash='calseed:*' for idempotency.

-- Corrective redefinition: 0902 shipped generate_calibration_scoreboard with
-- is_published in the INSERT column list but no value (default applies). Fixed
-- here so already-migrated databases pick it up before the seed calls it.
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

  select coalesce(jsonb_agg(signal_category || ' — ' || acc || '% at ' || confidence_level || ' confidence (n=' || tot || ')'), '[]'::jsonb) into v_strengths from (
    select signal_category, confidence_level, round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),0) acc, sum(total_signals) tot
    from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date
    group by signal_category, confidence_level
    having sum(total_signals) >= 30 and (100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0)) >= 70 order by acc desc limit 5) x;

  select coalesce(jsonb_agg(signal_category || ' — only ' || acc || '% correct at ' || confidence_level || ' confidence (n=' || tot || ')' ||
      case when confidence_level='high' and acc < 65 then ' — overconfident; recommend recalibration' else '' end), '[]'::jsonb) into v_improve from (
    select signal_category, confidence_level, round(100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0),0) acc, sum(total_signals) tot
    from public.calibration_snapshots where org_id=v_org and window_days=p_window_days and snapshot_date=v_date
    group by signal_category, confidence_level
    having sum(total_signals) >= 30 and ((100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0)) < 55 or (confidence_level='high' and (100.0*sum(correct_count)/nullif(sum(signals_with_outcome),0)) < 65))
    order by acc asc limit 5) x;

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

create or replace function public.seed_demo_calibration(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg record; v_ac uuid; v_sev text; v_pet text; d date; w int; k int;
begin
  -- Calibration seeding writes signal_actions (actor NOT NULL) — skip orgs
  -- without an owning user.
  if p_org_id is null or p_user_id is null then return; end if;

  -- Idempotency: remove prior calibration seed for this org.
  delete from public.calibration_events where org_id = p_org_id;
  delete from public.calibration_snapshots where org_id = p_org_id;
  delete from public.calibration_scoreboards where org_id = p_org_id;
  delete from public.signals where org_id = p_org_id and generation_context_hash like 'calseed:%';

  -- Config: (category, class, model, confidence, n, correct_pct, partial_pct).
  for cfg in
    select * from (values
      -- predictions (calibration curve; opus vs haiku split)
      ('engine_borescope','prediction','claude-haiku-4-5-20251001','high',60,74,12),
      ('engine_borescope','prediction','claude-haiku-4-5-20251001','medium',40,58,15),
      ('engine_borescope','prediction','claude-haiku-4-5-20251001','low',22,40,15),
      ('landing_gear_service','prediction','claude-haiku-4-5-20251001','high',50,70,10),
      ('landing_gear_service','prediction','claude-haiku-4-5-20251001','medium',32,55,12),
      ('apu_health','prediction','claude-opus-4-8','high',45,68,12),
      ('apu_health','prediction','claude-opus-4-8','medium',30,52,14),
      ('avionics_fault','prediction','claude-haiku-4-5-20251001','high',40,52,10),   -- overconfident
      ('avionics_fault','prediction','claude-haiku-4-5-20251001','medium',28,46,12),
      ('brake_wear','prediction','claude-opus-4-8','high',38,72,8),
      ('hydraulic_leak','prediction','claude-haiku-4-5-20251001','high',8,50,0),      -- insufficient sample
      -- observations (real categories; outcomes applied via marked_correct/incorrect below)
      ('weather_impact','observation','ops-engine','high',44,80,0),
      ('delay_pattern','observation','ops-engine','medium',30,62,0),
      ('ad_deadline_approaching','observation','compliance-engine','high',34,76,0),
      ('mel_extension_risk','observation','compliance-engine','high',22,68,0),
      ('llp_approaching_limit','observation','compliance-engine','high',26,82,0)
    ) as t(category, sclass, model, conf, n, correct_pct, partial_pct)
  loop
    select id into v_ac from public.aircraft where org_id = p_org_id order by random() limit 1;
    v_sev := case cfg.conf when 'high' then 'high' when 'medium' then 'medium' else 'low' end;
    v_pet := case when cfg.sclass = 'prediction' then cfg.category else null end;

    insert into public.signals (
      org_id, aircraft_id, category, severity, title, narrative, recommendation, confidence, confidence_reasoning,
      evidence_refs, suggested_actions, is_active, signal_class, generated_by_model, generation_context_hash,
      generated_at_utc, predicted_event_type, prediction_horizon, accuracy_result, accuracy_measured_at_utc, accuracy_notes)
    select
      p_org_id, v_ac, cfg.category, v_sev,
      left(initcap(replace(cfg.category,'_',' ')) || ' — ' || cfg.conf || ' confidence', 200),
      'Historical ' || cfg.sclass || ' for ' || replace(cfg.category,'_',' ') || ', retained for calibration measurement.',
      'Calibration record.', cfg.conf,
      'Seeded calibration history at ' || cfg.conf || ' confidence.',
      '{}'::jsonb, '[]'::jsonb, false, cfg.sclass, cfg.model, 'calseed:' || md5(random()::text || g::text),
      now() - ((g::numeric / cfg.n) * 350 || ' days')::interval,
      v_pet,
      case when cfg.sclass = 'prediction' then jsonb_build_object(
        'lower_bound_date', (now() - ((g::numeric / cfg.n) * 350 || ' days')::interval + interval '10 days')::date,
        'upper_bound_date', (now() - ((g::numeric / cfg.n) * 350 || ' days')::interval + interval '30 days')::date) else null end,
      case when cfg.sclass = 'prediction' then
        case when g <= round(cfg.n * cfg.correct_pct / 100.0) then 'correct'
             when g <= round(cfg.n * (cfg.correct_pct + cfg.partial_pct) / 100.0) then 'partial'
             when g <= round(cfg.n * 0.95) then 'incorrect'
             else 'pending' end
        else 'pending' end,
      case when cfg.sclass = 'prediction' and g <= round(cfg.n * 0.95)
        then now() - ((g::numeric / cfg.n) * 350 || ' days')::interval + interval '20 days' else null end,
      -- stash the observation target correct% so the action pass can hit it
      case when cfg.sclass = 'observation' then cfg.correct_pct::text else null end
    from generate_series(1, cfg.n) g;
  end loop;

  -- Observation outcomes: mark the first correct_pct% (by age) correct, rest incorrect.
  insert into public.signal_actions (org_id, signal_id, action_type, actor_user_id, created_at_utc)
  select p_org_id, id,
    case when rn <= round(cnt * (accuracy_notes::numeric) / 100.0) then 'marked_correct' else 'marked_incorrect' end,
    p_user_id, generated_at_utc + interval '18 days'
  from (
    select id, generated_at_utc, accuracy_notes,
      row_number() over (partition by category, confidence order by generated_at_utc) rn,
      count(*) over (partition by category, confidence) cnt
    from public.signals
    where org_id = p_org_id and generation_context_hash like 'calseed:%' and signal_class = 'observation' and accuracy_notes ~ '^\d+$'
  ) q;

  -- Engagement actions across the seed history (feeds action_rate / dismissal_rate).
  insert into public.signal_actions (org_id, signal_id, action_type, actor_user_id, created_at_utc)
  select p_org_id, id, 'create_task', p_user_id, generated_at_utc + interval '1 day'
  from (select id, generated_at_utc, row_number() over (order by generated_at_utc) rn from public.signals
        where org_id = p_org_id and generation_context_hash like 'calseed:%') q where rn % 4 = 0;
  insert into public.signal_actions (org_id, signal_id, action_type, actor_user_id, created_at_utc)
  select p_org_id, id, 'dismissed', p_user_id, generated_at_utc + interval '2 days'
  from (select id, generated_at_utc, row_number() over (order by generated_at_utc) rn from public.signals
        where org_id = p_org_id and generation_context_hash like 'calseed:%') q where rn % 9 = 0;

  -- Calibration events ledger (accuracy_marked from matured predictions + actions).
  insert into public.calibration_events (org_id, signal_id, ai_decision_record_id, calibration_event_type, signal_class, signal_category, confidence_level, accuracy_result, event_at_utc)
  select s.org_id, s.id, (select id from public.ai_decision_records r where r.linked_signal_id = s.id limit 1),
    'accuracy_marked', s.signal_class, s.category, s.confidence, s.accuracy_result, coalesce(s.accuracy_measured_at_utc, s.generated_at_utc)
  from public.signals s where s.org_id = p_org_id and s.generation_context_hash like 'calseed:%'
    and s.signal_class = 'prediction' and s.accuracy_result <> 'pending';

  insert into public.calibration_events (org_id, signal_id, calibration_event_type, signal_class, signal_category, confidence_level, event_at_utc)
  select a.org_id, a.signal_id, case a.action_type when 'create_task' then 'action_taken' else 'dismissal_recorded' end,
    s.signal_class, s.category, s.confidence, a.created_at_utc
  from public.signal_actions a join public.signals s on s.id = a.signal_id
  where a.org_id = p_org_id and s.generation_context_hash like 'calseed:%' and a.action_type in ('create_task','dismissed');

  -- Compute snapshots: today (all windows) + weekly trend points (30/90d).
  foreach w in array array[7,30,90,180,365] loop
    perform public.compute_calibration_snapshot(p_org_id, w, current_date);
  end loop;
  for k in 1..12 loop
    d := current_date - (k * 7);
    perform public.compute_calibration_snapshot(p_org_id, 30, d);
    perform public.compute_calibration_snapshot(p_org_id, 90, d);
  end loop;

  -- Cross-tenant refresh (participating_org_count = 1 for now).
  perform public.refresh_cross_tenant_calibration(current_date);

  -- Sample internal scoreboard (unpublished), 180d.
  perform public.generate_calibration_scoreboard('tenant_internal', 180, 'balanced', p_org_id);
end $$;
grant execute on function public.seed_demo_calibration(uuid, uuid) to authenticated, anon, service_role;

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
      -- calibration last: aggregates all signals + its own honest history.
      perform public.seed_demo_calibration(v_org, new.id);
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
      perform public.seed_demo_calibration(r.org_id, r.user_id);
    end if;
  end loop;
end $$;
