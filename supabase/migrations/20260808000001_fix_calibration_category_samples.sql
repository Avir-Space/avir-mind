-- Bug 5a: calibration category detail always showed CORRECT (0) / PARTIAL (0) /
-- INCORRECT (0). The `samples` field was built with jsonb_agg(row_to_json(t)),
-- which wraps the single (no GROUP BY) aggregate row in a ONE-ELEMENT ARRAY:
--   [{ "correct": [...], "partial": [...], "incorrect": [...] }]
-- but the frontend reads samples.correct / .partial / .incorrect as an OBJECT
-- (src/types/calibration.ts), so every list resolved to undefined → empty.
-- Fix: return the single row as an object via to_jsonb(t). Frontend unchanged.
-- (The seed already creates per-signal marked_correct/marked_incorrect actions,
-- so the lists populate once the shape is right.)

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
      -- FIX: to_jsonb of the single row → object (was jsonb_agg → 1-element array).
      select coalesce(to_jsonb(t), '{}'::jsonb) from (
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
