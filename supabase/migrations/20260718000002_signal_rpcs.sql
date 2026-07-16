-- 0202: signal RPCs.
--
-- generate_signals_for_aircraft prepares a run (cache check + cost guards) and
-- returns {run_id, cached, status}. The Edge Function performs the actual
-- Anthropic call — a deliberate deviation from "the RPC calls the function":
-- Postgres shouldn't make long, blocking LLM HTTP calls, and the client already
-- orchestrates invoke(). If not cached, the client invokes generate-signals
-- with the returned run_id.

-- ── context hash ─────────────────────────────────────────────────────────────
-- SHA256 over the aircraft's current state + its active task set. Any change to
-- state or an active task changes the hash and invalidates the 6-hour cache.
create or replace function public.signal_context_hash(p_aircraft_id uuid)
returns text language sql stable security invoker set search_path = public, extensions as $$
  select encode(digest(
    coalesce((
      select a.tail_number || '|' || coalesce(s.state, '') || '|' || coalesce(s.state_source, '') || '|'
             || coalesce(s.current_station, '') || '|' || coalesce(s.next_event_type, '')
      from public.aircraft a left join public.aircraft_state s on s.aircraft_id = a.id
      where a.id = p_aircraft_id), '')
    || '#TASKS#' ||
    coalesce((
      select string_agg(t.id::text || ':' || t.status || ':' || t.risk_band || ':'
                        || t.dispatch_blocking::text || ':' || t.aog::text, ',' order by t.id)
      from public.tasks t where t.aircraft_id = p_aircraft_id and t.status <> 'done'), ''),
    'sha256'), 'hex');
$$;

-- ── generate_signals_for_aircraft ────────────────────────────────────────────
create or replace function public.generate_signals_for_aircraft(
  p_aircraft_id uuid, p_run_type text default 'manual', p_force_regenerate boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid; v_hash text; v_existing uuid; v_run_id uuid;
  v_failures int; v_concurrent int; v_spend numeric;
begin
  select org_id into v_org from public.aircraft where id = p_aircraft_id;
  if v_org is null then
    raise exception 'generate_signals_for_aircraft: aircraft not found or not visible';
  end if;

  v_hash := public.signal_context_hash(p_aircraft_id);

  -- Cache: a completed run with the same context hash in the last 6 hours.
  if not coalesce(p_force_regenerate, false) then
    select id into v_existing
    from public.signal_generation_runs
    where org_id = v_org and aircraft_id = p_aircraft_id and generation_context_hash = v_hash
      and status = 'completed' and completed_at_utc > now() - interval '6 hours'
    order by completed_at_utc desc limit 1;
    if v_existing is not null then
      return jsonb_build_object('run_id', v_existing, 'cached', true, 'status', 'completed');
    end if;
  end if;

  -- Circuit breaker: 3+ failures in the last 5 minutes for this org.
  select count(*) into v_failures from public.signal_generation_runs
  where org_id = v_org and status = 'failed' and started_at_utc > now() - interval '5 minutes';
  if v_failures >= 3 then
    raise exception 'signal generation paused: 3+ failures in the last 5 minutes (circuit breaker)';
  end if;

  -- Concurrency: max 10 in-flight generations per org.
  select count(*) into v_concurrent from public.signal_generation_runs
  where org_id = v_org and status = 'started' and started_at_utc > now() - interval '5 minutes';
  if v_concurrent >= 10 then
    raise exception 'signal generation paused: too many concurrent generations (max 10)';
  end if;

  -- Soft cost cap: > $50 spent on generation in the last 24 hours.
  select coalesce(sum(total_cost_usd), 0) into v_spend from public.signal_generation_runs
  where org_id = v_org and started_at_utc > now() - interval '24 hours';
  if v_spend > 50 and not coalesce(p_force_regenerate, false) then
    raise exception 'signal generation paused: over $50 spent in the last 24h (soft cap)';
  end if;

  insert into public.signal_generation_runs
    (org_id, aircraft_id, run_type, trigger_reference, generation_context_hash, status)
  values (v_org, p_aircraft_id, coalesce(p_run_type, 'manual'), p_run_type, v_hash, 'started')
  returning id into v_run_id;

  return jsonb_build_object('run_id', v_run_id, 'cached', false, 'status', 'started');
end;
$$;

-- ── get_signals_for_aircraft ─────────────────────────────────────────────────
create or replace function public.get_signals_for_aircraft(
  p_aircraft_id uuid, p_include_resolved boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'aircraft_id', s.aircraft_id, 'category', s.category, 'severity', s.severity,
        'title', s.title, 'narrative', s.narrative, 'recommendation', s.recommendation,
        'confidence', s.confidence, 'confidence_reasoning', s.confidence_reasoning,
        'evidence_refs', s.evidence_refs, 'suggested_actions', s.suggested_actions,
        'is_active', s.is_active, 'generated_at_utc', s.generated_at_utc, 'generated_by_model', s.generated_by_model,
        'my_last_action', (select a.action_type from public.signal_actions a
                           where a.signal_id = s.id and a.actor_user_id = auth.uid()
                           order by a.created_at_utc desc limit 1),
        'action_counts', coalesce((select jsonb_object_agg(t.action_type, t.c) from (
          select action_type, count(*) c from public.signal_actions a where a.signal_id = s.id group by action_type
        ) t), '{}'::jsonb)
      ) order by
        case s.severity when 'critical' then 6 when 'high' then 5 when 'medium' then 4
          when 'low' then 3 when 'info' then 2 else 1 end desc,
        s.generated_at_utc desc)
      from public.signals s
      where s.aircraft_id = p_aircraft_id and (coalesce(p_include_resolved, false) or s.is_active)
    ), '[]'::jsonb),
    'latest_run', (
      select jsonb_build_object('id', r.id, 'status', r.status, 'generated_at_utc', r.completed_at_utc,
                                'started_at_utc', r.started_at_utc, 'signals_generated', r.signals_generated,
                                'error', r.error)
      from public.signal_generation_runs r
      where r.aircraft_id = p_aircraft_id order by r.started_at_utc desc limit 1),
    'next_regeneration_available_at', (
      select r.completed_at_utc + interval '6 hours'
      from public.signal_generation_runs r
      where r.aircraft_id = p_aircraft_id and r.status = 'completed'
      order by r.completed_at_utc desc limit 1)
  ) into v_result;
  return v_result;
end;
$$;

-- ── act_on_signal ────────────────────────────────────────────────────────────
create or replace function public.act_on_signal(
  p_signal_id uuid, p_action_type text, p_action_payload jsonb default '{}'::jsonb,
  p_outcome_task_id uuid default null, p_dismissal_reason text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.signals where id = p_signal_id;
  if v_org is null then raise exception 'act_on_signal: signal not found or not visible'; end if;

  if p_action_type = 'create_task' and p_outcome_task_id is not null then
    if not exists (select 1 from public.tasks where id = p_outcome_task_id and org_id = v_org) then
      raise exception 'act_on_signal: outcome task not found in this org';
    end if;
  end if;

  insert into public.signal_actions
    (org_id, signal_id, action_type, action_payload, outcome_task_id, dismissal_reason, actor_user_id)
  values (v_org, p_signal_id, p_action_type, coalesce(p_action_payload, '{}'::jsonb),
          p_outcome_task_id, p_dismissal_reason, auth.uid())
  returning id into v_id;

  if p_action_type in ('dismissed', 'marked_incorrect') then
    update public.signals
    set is_active = false, resolved_at_utc = now(), resolution_note = p_dismissal_reason
    where id = p_signal_id;
  end if;

  return v_id;
end;
$$;

-- ── get_command_center_insights ──────────────────────────────────────────────
-- Real fleet-wide patterns over active signals (+ suppressed counts from runs).
create or replace function public.get_command_center_insights(
  p_severity text[] default null, p_limit int default 4
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_result jsonb;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;

  with active as (
    select s.*, ac.base_station, ac.tail_number
    from public.signals s
    left join public.aircraft ac on ac.id = s.aircraft_id
    where s.org_id = v_org and s.is_active
      and (p_severity is null or s.severity = any(p_severity))
  ),
  hi as (select * from active where severity in ('critical', 'high'))
  select jsonb_agg(x order by x.rank) into v_result from (
    -- 1. Category cluster
    select 1 as rank, jsonb_build_object(
      'category', c.category, 'severity', 'high',
      'title', 'Category cluster',
      'one_liner', c.ac_count || ' tail' || case when c.ac_count = 1 then '' else 's' end
        || ' showing ' || replace(c.category, '_', ' ') || ' signals',
      'aircraft_count', c.ac_count, 'signal_count', c.sig_count,
      'drill_in_query', jsonb_build_object('category', c.category)
    ) as x
    from (select category, count(distinct aircraft_id) ac_count, count(*) sig_count
          from hi where category is not null group by category order by count(*) desc limit 1) c
    where c.sig_count > 0

    union all
    -- 2. Aircraft with 3+ high/critical signals
    select 2, jsonb_build_object(
      'category', 'fleet_pattern', 'severity', 'critical',
      'title', 'High-risk aircraft',
      'one_liner', z.n || ' aircraft with 3+ high-severity signals',
      'aircraft_count', z.n, 'signal_count', null,
      'drill_in_query', jsonb_build_object('severity', array['critical', 'high'])
    )
    from (select count(*) n from (select aircraft_id from hi group by aircraft_id having count(*) >= 3) q) z
    where z.n > 0

    union all
    -- 3. Insufficient-data / suppressed
    select 3, jsonb_build_object(
      'category', 'insufficient_data', 'severity', 'info',
      'title', 'Needs more data',
      'one_liner', (
        (select count(*) from active where severity = 'insufficient_data')
        + coalesce((select sum(signals_suppressed) from public.signal_generation_runs
                    where org_id = v_org and started_at_utc > now() - interval '24 hours'), 0)
      )::int || ' signals limited by insufficient data',
      'aircraft_count', (select count(distinct aircraft_id) from active where severity = 'insufficient_data'),
      'signal_count', (select count(*) from active where severity = 'insufficient_data'),
      'drill_in_query', jsonb_build_object('severity', array['insufficient_data'])
    )
    where exists (select 1 from active where severity = 'insufficient_data')
       or exists (select 1 from public.signal_generation_runs
                  where org_id = v_org and signals_suppressed > 0 and started_at_utc > now() - interval '24 hours')

    union all
    -- 4. Station concentration
    select 4, jsonb_build_object(
      'category', 'ground_ops', 'severity', 'medium',
      'title', 'Station concentration',
      'one_liner', 'Station ' || st.base_station || ' has ' || st.n || ' high-severity signals',
      'aircraft_count', st.ac, 'signal_count', st.n,
      'drill_in_query', jsonb_build_object('station', st.base_station)
    )
    from (select base_station, count(*) n, count(distinct aircraft_id) ac
          from hi where base_station is not null group by base_station order by count(*) desc limit 1) st
    where st.n > 0
  ) sub
  where x is not null;

  -- Trim to p_limit and guarantee a value.
  return coalesce((select jsonb_agg(e) from (
    select e from jsonb_array_elements(coalesce(v_result, '[]'::jsonb)) e limit coalesce(p_limit, 4)
  ) z), '[]'::jsonb);
end;
$$;

grant execute on function public.signal_context_hash(uuid) to authenticated;
grant execute on function public.generate_signals_for_aircraft(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.get_signals_for_aircraft(uuid, boolean) to authenticated;
grant execute on function public.act_on_signal(uuid, text, jsonb, uuid, text) to authenticated;
grant execute on function public.get_command_center_insights(text[], int) to authenticated;
