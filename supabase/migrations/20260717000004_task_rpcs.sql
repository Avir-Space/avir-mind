-- 0104: task RPCs.
-- All SECURITY INVOKER so RLS applies with the caller's identity. Each mutation
-- RPC appends the appropriate task_events row (audit thesis). Read RPCs return
-- jsonb shaped for the frontend.

-- ─────────────────────────────────────────────────────────────────────────────
-- task_severity — derives a 5-level display severity from risk + flags.
--   critical = AOG, or dispatch-blocking + high risk
--   high/medium/low = risk_band
-- 'info' is reserved for future informational signals (Phase 3).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.task_severity(p_risk text, p_blocking boolean, p_aog boolean)
returns text language sql immutable as $$
  select case
    when coalesce(p_aog, false) then 'critical'
    when coalesce(p_blocking, false) and p_risk = 'high' then 'critical'
    when p_risk = 'high' then 'high'
    when p_risk = 'medium' then 'medium'
    else 'low'
  end;
$$;

-- ── create_task ──────────────────────────────────────────────────────────────
create or replace function public.create_task(
  p_aircraft_id uuid,
  p_title text,
  p_why_summary text,
  p_parent_type text,
  p_sub_type text,
  p_risk_band text default 'medium',
  p_station_code text default null,
  p_facility text default null,
  p_due_at_utc timestamptz default null,
  p_dispatch_blocking boolean default false,
  p_aog boolean default false,
  p_source_system text default 'avir',
  p_source_reference_id text default null,
  p_estimated_duration_hours int default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_org_id uuid;
  v_task_id uuid;
begin
  select org_id into v_org_id from public.aircraft where id = p_aircraft_id;
  if v_org_id is null then
    raise exception 'create_task: aircraft % not found or not visible', p_aircraft_id;
  end if;

  insert into public.tasks (
    org_id, aircraft_id, title, why_summary, parent_type, sub_type,
    risk_band, station_code, facility, due_at_utc, dispatch_blocking, aog,
    reporter_user_id, estimated_duration_hours, board_rank
  ) values (
    v_org_id, p_aircraft_id, p_title, p_why_summary, p_parent_type, p_sub_type,
    coalesce(p_risk_band, 'medium'), p_station_code, p_facility, p_due_at_utc,
    coalesce(p_dispatch_blocking, false), coalesce(p_aog, false),
    auth.uid(), p_estimated_duration_hours, extract(epoch from now())
  )
  returning id into v_task_id;

  insert into public.task_sources (task_id, source_system, source_reference_id)
  values (v_task_id, coalesce(p_source_system, 'avir'), p_source_reference_id);

  insert into public.task_events (org_id, task_id, actor_user_id, event_type, event_payload)
  values (v_org_id, v_task_id, auth.uid(), 'task_created',
          jsonb_build_object('title', p_title, 'parent_type', p_parent_type,
                             'sub_type', p_sub_type, 'source_system', coalesce(p_source_system, 'avir')));

  return v_task_id;
end;
$$;

-- ── move_task_status ─────────────────────────────────────────────────────────
create or replace function public.move_task_status(
  p_task_id uuid, p_new_status text, p_new_rank numeric default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_old_status text;
  v_org_id uuid;
begin
  select status, org_id into v_old_status, v_org_id from public.tasks where id = p_task_id;
  if v_org_id is null then
    raise exception 'move_task_status: task % not found or not visible', p_task_id;
  end if;

  update public.tasks
  set status = p_new_status,
      board_rank = coalesce(p_new_rank, board_rank),
      started_at_utc = case
        when p_new_status = 'in_progress' and started_at_utc is null then now()
        else started_at_utc end
  where id = p_task_id;

  if v_old_status is distinct from p_new_status then
    insert into public.task_events (org_id, task_id, actor_user_id, event_type, event_payload)
    values (v_org_id, p_task_id, auth.uid(), 'status_change',
            jsonb_build_object('from', v_old_status, 'to', p_new_status));
  end if;
end;
$$;

-- ── create_task_event ────────────────────────────────────────────────────────
create or replace function public.create_task_event(
  p_task_id uuid, p_event_type text, p_body text default null, p_event_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_org_id uuid;
  v_id uuid;
begin
  select org_id into v_org_id from public.tasks where id = p_task_id;
  if v_org_id is null then
    raise exception 'create_task_event: task % not found or not visible', p_task_id;
  end if;
  insert into public.task_events (org_id, task_id, actor_user_id, event_type, body, event_payload)
  values (v_org_id, p_task_id, auth.uid(), p_event_type, p_body, coalesce(p_event_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ── acknowledge_task ─────────────────────────────────────────────────────────
create or replace function public.acknowledge_task(p_task_id uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare v_org_id uuid;
begin
  select org_id into v_org_id from public.tasks where id = p_task_id;
  if v_org_id is null then
    raise exception 'acknowledge_task: task % not found or not visible', p_task_id;
  end if;
  insert into public.task_acknowledgements (task_id, user_id)
  values (p_task_id, auth.uid())
  on conflict (task_id, user_id) do update set acknowledged_at_utc = now();

  insert into public.task_events (org_id, task_id, actor_user_id, event_type)
  values (v_org_id, p_task_id, auth.uid(), 'acknowledged');
end;
$$;

-- ── assign_task ──────────────────────────────────────────────────────────────
create or replace function public.assign_task(p_task_id uuid, p_assignee_user_id uuid)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_org_id uuid;
  v_old uuid;
begin
  select org_id, assignee_user_id into v_org_id, v_old from public.tasks where id = p_task_id;
  if v_org_id is null then
    raise exception 'assign_task: task % not found or not visible', p_task_id;
  end if;
  update public.tasks set assignee_user_id = p_assignee_user_id where id = p_task_id;

  insert into public.task_events (org_id, task_id, actor_user_id, event_type, event_payload)
  values (v_org_id, p_task_id, auth.uid(),
          case when p_assignee_user_id is null then 'unassigned' else 'assigned' end,
          jsonb_build_object('from', v_old, 'to', p_assignee_user_id));
end;
$$;

-- ── log_work ─────────────────────────────────────────────────────────────────
create or replace function public.log_work(
  p_task_id uuid, p_time_spent_minutes int, p_description text, p_work_date date default current_date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_org_id uuid;
  v_id uuid;
begin
  select org_id into v_org_id from public.tasks where id = p_task_id;
  if v_org_id is null then
    raise exception 'log_work: task % not found or not visible', p_task_id;
  end if;
  insert into public.task_work_logs (org_id, task_id, user_id, time_spent_minutes, description, work_date)
  values (v_org_id, p_task_id, auth.uid(), p_time_spent_minutes, p_description, coalesce(p_work_date, current_date))
  returning id into v_id;

  insert into public.task_events (org_id, task_id, actor_user_id, event_type, event_payload)
  values (v_org_id, p_task_id, auth.uid(), 'work_logged',
          jsonb_build_object('minutes', p_time_spent_minutes, 'work_date', coalesce(p_work_date, current_date)));
  return v_id;
end;
$$;

-- ── get_command_center_queue ─────────────────────────────────────────────────
create or replace function public.get_command_center_queue(
  p_severity text[] default null,
  p_categories text[] default null,
  p_source_systems text[] default null,
  p_time_window_hours int default null,
  p_assigned_to_me boolean default false,
  p_limit int default 100
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid;
  v_result jsonb;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;

  with filtered as (
    select
      t.id, t.aircraft_id, ac.tail_number, t.title, t.why_summary, t.parent_type,
      t.sub_type, t.status, t.risk_band, t.dispatch_blocking, t.aog, t.station_code,
      t.facility, t.due_at_utc, t.created_at_utc, t.updated_at_utc, t.assignee_user_id,
      public.task_severity(t.risk_band, t.dispatch_blocking, t.aog) as severity,
      row_number() over (
        order by
          t.aog desc,
          (t.dispatch_blocking and t.risk_band = 'high') desc,
          t.dispatch_blocking desc,
          (t.risk_band = 'high') desc,
          t.due_at_utc asc nulls last,
          t.created_at_utc asc
      ) as rn
    from public.tasks t
    join public.aircraft ac on ac.id = t.aircraft_id
    where t.status <> 'done'
      and (p_severity is null or public.task_severity(t.risk_band, t.dispatch_blocking, t.aog) = any(p_severity))
      and (p_categories is null or t.parent_type = any(p_categories))
      and (p_time_window_hours is null or t.created_at_utc >= now() - make_interval(hours => p_time_window_hours))
      and (coalesce(p_assigned_to_me, false) = false or t.assignee_user_id = auth.uid())
      and (p_source_systems is null or exists (
            select 1 from public.task_sources s
            where s.task_id = t.id and s.source_system = any(p_source_systems)))
    order by rn
    limit coalesce(p_limit, 100)
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'active_signals', (select count(*) from public.tasks where org_id = v_org and status <> 'done'),
      'blocking_dispatch', (select count(*) from public.tasks where org_id = v_org and dispatch_blocking and status <> 'done'),
      'aog_aircraft', (select count(distinct aircraft_id) from public.tasks where org_id = v_org and aog and status <> 'done'),
      'team_load', (select count(*) from public.tasks where org_id = v_org and assignee_user_id is not null and status <> 'done')
    ),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_id', f.id, 'aircraft_id', f.aircraft_id, 'tail_number', f.tail_number,
        'title', f.title, 'why_summary', f.why_summary, 'parent_type', f.parent_type,
        'sub_type', f.sub_type, 'status', f.status, 'risk_band', f.risk_band,
        'severity', f.severity, 'dispatch_blocking', f.dispatch_blocking, 'aog', f.aog,
        'station_code', f.station_code, 'facility', f.facility, 'due_at_utc', f.due_at_utc,
        'created_at_utc', f.created_at_utc, 'updated_at_utc', f.updated_at_utc,
        'assignee_user_id', f.assignee_user_id,
        'sources', coalesce((select jsonb_agg(jsonb_build_object(
            'source_system', s.source_system, 'source_reference_id', s.source_reference_id, 'source_url', s.source_url))
          from public.task_sources s where s.task_id = f.id), '[]'::jsonb),
        'acknowledged_by_me', exists(
          select 1 from public.task_acknowledgements a where a.task_id = f.id and a.user_id = auth.uid()),
        'recent_events', coalesce((select jsonb_agg(ev order by ev.created_at_utc desc) from (
            select jsonb_build_object('event_type', e.event_type, 'body', e.body,
              'created_at_utc', e.created_at_utc, 'actor_user_id', e.actor_user_id) as ev,
              e.created_at_utc
            from public.task_events e where e.task_id = f.id
            order by e.created_at_utc desc limit 3) sub), '[]'::jsonb)
        ) order by f.rn)
      from filtered f), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ── get_fleet_board ──────────────────────────────────────────────────────────
create or replace function public.get_fleet_board(
  p_fleet_id uuid default null,
  p_station_codes text[] default null,
  p_aircraft_types text[] default null,
  p_risk_bands text[] default null,
  p_parent_types text[] default null,
  p_search text default null
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_result jsonb;
begin
  with base_ac as (
    select ac.id, ac.tail_number, ac.aircraft_type, ac.base_station,
      st.state, st.current_station,
      -- fold the rare 'unknown' state into on_ground so every aircraft lands in a column
      case coalesce(st.state, 'unknown')
        when 'under_maintenance' then 'under_maintenance'
        when 'in_air' then 'in_air'
        when 'stationed' then 'stationed'
        else 'on_ground'
      end as grp
    from public.aircraft ac
    left join public.aircraft_state st on st.aircraft_id = ac.id
    where (p_fleet_id is null or exists (
            select 1 from public.fleet_aircraft fa where fa.aircraft_id = ac.id and fa.fleet_id = p_fleet_id))
      and (p_station_codes is null or ac.base_station = any(p_station_codes))
      and (p_aircraft_types is null or ac.aircraft_type = any(p_aircraft_types))
  ),
  act as (
    select t.*, public.task_severity(t.risk_band, t.dispatch_blocking, t.aog) as severity,
      case public.task_severity(t.risk_band, t.dispatch_blocking, t.aog)
        when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end as sev_rank
    from public.tasks t
    where t.status <> 'done'
      and (p_risk_bands is null or t.risk_band = any(p_risk_bands))
      and (p_parent_types is null or t.parent_type = any(p_parent_types))
  ),
  ranked as (
    select a.*, row_number() over (
      partition by a.aircraft_id
      order by a.sev_rank desc, a.dispatch_blocking desc, a.due_at_utc asc nulls last, a.created_at_utc asc
    ) as rn
    from act a
  ),
  cards as (
    select
      b.id as aircraft_id, b.tail_number, b.aircraft_type, b.base_station,
      coalesce(b.current_station, b.base_station) as station_code, b.state, b.grp,
      (select count(*) from act a where a.aircraft_id = b.id) as task_count,
      (select count(*) from act a where a.aircraft_id = b.id and a.risk_band = 'high') as high_count,
      (select count(*) from act a where a.aircraft_id = b.id and a.risk_band = 'medium') as medium_count,
      (select count(*) from act a where a.aircraft_id = b.id and a.risk_band = 'low') as low_count,
      (select bool_or(a.dispatch_blocking) from act a where a.aircraft_id = b.id) as any_blocking,
      (select bool_or(a.aog) from act a where a.aircraft_id = b.id) as any_aog,
      pt.id as pt_id, pt.title as pt_title, pt.why_summary as pt_why, pt.parent_type as pt_parent,
      pt.sub_type as pt_sub, pt.risk_band as pt_risk, pt.severity as pt_severity,
      pt.dispatch_blocking as pt_blocking, pt.aog as pt_aog, pt.facility as pt_facility
    from base_ac b
    left join ranked pt on pt.aircraft_id = b.id and pt.rn = 1
    where (p_search is null or p_search = ''
           or b.tail_number ilike '%' || p_search || '%'
           or exists (select 1 from act a where a.aircraft_id = b.id and a.title ilike '%' || p_search || '%'))
  ),
  card_json as (
    select c.grp, jsonb_build_object(
      'aircraft_id', c.aircraft_id, 'tail_number', c.tail_number, 'aircraft_type', c.aircraft_type,
      'station_code', c.station_code, 'state', c.state, 'task_count', c.task_count,
      'dispatch_blocking', coalesce(c.any_blocking, false), 'aog', coalesce(c.any_aog, false),
      'severity_summary', jsonb_build_object('high', c.high_count, 'medium', c.medium_count, 'low', c.low_count),
      'primary_task', case when c.pt_id is null then null else jsonb_build_object(
        'task_id', c.pt_id, 'title', c.pt_title, 'why_summary', c.pt_why, 'parent_type', c.pt_parent,
        'sub_type', c.pt_sub, 'risk_band', c.pt_risk, 'severity', c.pt_severity,
        'dispatch_blocking', c.pt_blocking, 'aog', c.pt_aog, 'facility', c.pt_facility,
        'sources', coalesce((select jsonb_agg(jsonb_build_object(
            'source_system', s.source_system, 'source_reference_id', s.source_reference_id, 'source_url', s.source_url))
          from public.task_sources s where s.task_id = c.pt_id), '[]'::jsonb)
      ) end
    ) as card,
    (case when c.pt_severity = 'critical' then 4 when c.pt_severity = 'high' then 3
          when c.pt_severity = 'medium' then 2 when c.pt_severity = 'low' then 1 else 0 end) as card_rank
    from cards c
  )
  select jsonb_build_object(
    'columns', jsonb_build_object(
      'under_maintenance', coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'under_maintenance'), '[]'::jsonb),
      'in_air',           coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'in_air'), '[]'::jsonb),
      'on_ground',        coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'on_ground'), '[]'::jsonb),
      'stationed',        coalesce((select jsonb_agg(card order by card_rank desc) from card_json where grp = 'stationed'), '[]'::jsonb)
    ),
    'insights', (
      with a as (select t.* , public.task_severity(t.risk_band,t.dispatch_blocking,t.aog) sev from public.tasks t where t.status <> 'done')
      select jsonb_build_array(
        jsonb_build_object('category','dispatch','severity','critical','title','Dispatch Blocking',
          'one_liner', (select count(*) from a where a.dispatch_blocking)::text || ' active blocking tasks'
            || coalesce(', concentrated at ' || (select station_code from a where a.dispatch_blocking group by station_code order by count(*) desc limit 1), ''),
          'aircraft_count', (select count(distinct aircraft_id) from a where a.dispatch_blocking)),
        jsonb_build_object('category','risk','severity','high','title','High Risk Cluster',
          'one_liner', (select count(*) from (select aircraft_id from a where a.risk_band='high' group by aircraft_id having count(*) >= 2) z)::text || ' aircraft with 2+ high-risk tasks',
          'aircraft_count', (select count(*) from (select aircraft_id from a where a.risk_band='high' group by aircraft_id having count(*) >= 2) z)),
        jsonb_build_object('category','tail','severity','medium','title','Tail Requires Attention',
          'one_liner', coalesce((select ac.tail_number || ' — ' || count(*)::text || ' active tasks' from a join public.aircraft ac on ac.id=a.aircraft_id group by ac.tail_number order by count(*) desc limit 1), 'No active tasks'),
          'aircraft_count', 1),
        jsonb_build_object('category','station','severity','info','title','Station Workload',
          'one_liner', coalesce((select station_code || ' — ' || count(*)::text || ' active tasks' from a where station_code is not null group by station_code order by count(*) desc limit 1), 'No active work'),
          'aircraft_count', (select count(distinct aircraft_id) from a where station_code = (select station_code from a where station_code is not null group by station_code order by count(*) desc limit 1)))
      )
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ── get_task_detail ──────────────────────────────────────────────────────────
create or replace function public.get_task_detail(p_task_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'task', jsonb_build_object(
      'task_id', t.id, 'org_id', t.org_id, 'aircraft_id', t.aircraft_id, 'tail_number', ac.tail_number,
      'aircraft_type', ac.aircraft_type, 'title', t.title, 'why_summary', t.why_summary,
      'parent_type', t.parent_type, 'sub_type', t.sub_type, 'status', t.status, 'risk_band', t.risk_band,
      'severity', public.task_severity(t.risk_band, t.dispatch_blocking, t.aog),
      'dispatch_blocking', t.dispatch_blocking, 'aog', t.aog, 'station_code', t.station_code,
      'facility', t.facility, 'due_at_utc', t.due_at_utc, 'started_at_utc', t.started_at_utc,
      'assignee_user_id', t.assignee_user_id, 'reporter_user_id', t.reporter_user_id,
      'pinned', t.pinned, 'estimated_duration_hours', t.estimated_duration_hours,
      'created_at_utc', t.created_at_utc, 'updated_at_utc', t.updated_at_utc,
      'acknowledged_by_me', exists(select 1 from public.task_acknowledgements a where a.task_id = t.id and a.user_id = auth.uid())
    ),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'source_system', s.source_system, 'source_reference_id', s.source_reference_id,
        'source_url', s.source_url, 'first_seen_at_utc', s.first_seen_at_utc, 'last_seen_at_utc', s.last_seen_at_utc))
      from public.task_sources s where s.task_id = t.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'body', e.body, 'event_payload', e.event_payload,
        'actor_user_id', e.actor_user_id, 'created_at_utc', e.created_at_utc) order by e.created_at_utc desc)
      from public.task_events e where e.task_id = t.id), '[]'::jsonb),
    'acknowledgements', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', k.user_id, 'acknowledged_at_utc', k.acknowledged_at_utc))
      from public.task_acknowledgements k where k.task_id = t.id), '[]'::jsonb),
    'work_logs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'user_id', w.user_id, 'time_spent_minutes', w.time_spent_minutes,
        'description', w.description, 'work_date', w.work_date, 'created_at_utc', w.created_at_utc) order by w.work_date desc)
      from public.task_work_logs w where w.task_id = t.id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', at.id, 'filename', at.filename, 'file_size_bytes', at.file_size_bytes,
        'mime_type', at.mime_type, 'storage_path', at.storage_path,
        'uploaded_by_user_id', at.uploaded_by_user_id, 'created_at_utc', at.created_at_utc) order by at.created_at_utc desc)
      from public.task_attachments at where at.task_id = t.id), '[]'::jsonb),
    'dependencies', jsonb_build_object(
      'blocks', coalesce((select jsonb_agg(jsonb_build_object('task_id', dt.id, 'title', dt.title, 'status', dt.status))
        from public.task_dependencies d join public.tasks dt on dt.id = d.to_task_id
        where d.from_task_id = t.id), '[]'::jsonb),
      'blocked_by', coalesce((select jsonb_agg(jsonb_build_object('task_id', dt.id, 'title', dt.title, 'status', dt.status))
        from public.task_dependencies d join public.tasks dt on dt.id = d.from_task_id
        where d.to_task_id = t.id), '[]'::jsonb)
    )
  ) into v_result
  from public.tasks t
  join public.aircraft ac on ac.id = t.aircraft_id
  where t.id = p_task_id;

  return v_result;
end;
$$;

-- Execution grants for API roles.
grant execute on function public.task_severity(text, boolean, boolean) to authenticated, anon;
grant execute on function public.create_task(uuid, text, text, text, text, text, text, text, timestamptz, boolean, boolean, text, text, int) to authenticated;
grant execute on function public.move_task_status(uuid, text, numeric) to authenticated;
grant execute on function public.create_task_event(uuid, text, text, jsonb) to authenticated;
grant execute on function public.acknowledge_task(uuid) to authenticated;
grant execute on function public.assign_task(uuid, uuid) to authenticated;
grant execute on function public.log_work(uuid, int, text, date) to authenticated;
grant execute on function public.get_command_center_queue(text[], text[], text[], int, boolean, int) to authenticated;
grant execute on function public.get_fleet_board(uuid, text[], text[], text[], text[], text) to authenticated;
grant execute on function public.get_task_detail(uuid) to authenticated;
