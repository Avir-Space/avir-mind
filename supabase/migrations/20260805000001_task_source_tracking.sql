-- Task source tracking + idempotent creation from signals/predictions.
--   Bug F: creating a task from a signal/prediction repeatedly made duplicates.
--   Adds source_signal_id / source_prediction_id to tasks (a prediction is a
--   signal with signal_class='prediction'); create_task now routes the source by
--   class and returns an EXISTING task for the same source instead of duplicating.

alter table public.tasks add column if not exists source_signal_id uuid references public.signals (id) on delete set null;
alter table public.tasks add column if not exists source_prediction_id uuid references public.signals (id) on delete set null;
create index if not exists tasks_source_signal_idx on public.tasks (source_signal_id) where source_signal_id is not null;
create index if not exists tasks_source_prediction_idx on public.tasks (source_prediction_id) where source_prediction_id is not null;

-- Backfill existing links from signal_actions (so idempotency has history to check).
update public.tasks t set source_signal_id = sa.signal_id
  from public.signal_actions sa
  join public.signals s on s.id = sa.signal_id
  where sa.action_type = 'create_task' and sa.outcome_task_id = t.id
    and coalesce(s.signal_class, 'observation') <> 'prediction'
    and t.source_signal_id is null;
update public.tasks t set source_prediction_id = sa.signal_id
  from public.signal_actions sa
  join public.signals s on s.id = sa.signal_id
  where sa.action_type = 'create_task' and sa.outcome_task_id = t.id
    and s.signal_class = 'prediction'
    and t.source_prediction_id is null;

-- Recreate create_task with source routing + idempotency. reporter_user_id
-- (= created_by_user_id) is already set to auth.uid().
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
  p_estimated_duration_hours int default null,
  p_source_signal_id uuid default null,
  p_source_prediction_id uuid default null
) returns uuid
language plpgsql
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_task_id uuid;
  v_existing uuid;
  v_class text;
  v_sig uuid := p_source_signal_id;
  v_pred uuid := p_source_prediction_id;
begin
  select org_id into v_org_id from public.aircraft where id = p_aircraft_id;
  if v_org_id is null then
    raise exception 'create_task: aircraft % not found or not visible', p_aircraft_id;
  end if;

  -- Route the source by signal class (a prediction is a signal).
  if v_sig is not null then
    select signal_class into v_class from public.signals where id = v_sig;
    if v_class = 'prediction' then v_pred := v_sig; v_sig := null; end if;
  end if;

  -- Idempotency: reuse the existing task created from the same signal/prediction.
  if v_sig is not null or v_pred is not null then
    select id into v_existing from public.tasks
      where org_id = v_org_id
        and ((v_sig is not null and source_signal_id = v_sig)
          or (v_pred is not null and source_prediction_id = v_pred))
      order by created_at_utc asc
      limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;

  insert into public.tasks (
    org_id, aircraft_id, title, why_summary, parent_type, sub_type,
    risk_band, station_code, facility, due_at_utc, dispatch_blocking, aog,
    reporter_user_id, estimated_duration_hours, board_rank,
    source_signal_id, source_prediction_id
  ) values (
    v_org_id, p_aircraft_id, p_title, p_why_summary, p_parent_type, p_sub_type,
    coalesce(p_risk_band, 'medium'), p_station_code, p_facility, p_due_at_utc,
    coalesce(p_dispatch_blocking, false), coalesce(p_aog, false),
    auth.uid(), p_estimated_duration_hours, extract(epoch from now()),
    v_sig, v_pred
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
$function$;

-- Look up the task already created from a given signal/prediction (for the UI to
-- show "View task" instead of a duplicate "Create Task"). RLS-scoped (invoker).
create or replace function public.get_task_for_signal(p_signal_id uuid)
returns uuid language sql stable security invoker set search_path = public as $$
  select id from public.tasks
    where source_signal_id = p_signal_id or source_prediction_id = p_signal_id
    order by created_at_utc asc
    limit 1;
$$;
grant execute on function public.get_task_for_signal(uuid) to authenticated;
