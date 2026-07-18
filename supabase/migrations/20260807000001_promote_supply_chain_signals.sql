-- Bug D: promote supply-chain (inventory) signals to tasks so they appear on
-- /signals. The /signals queue is built from TASKS (get_command_center_queue,
-- filtered by task parent_type). Supply-chain signals live only in the signals
-- table — categories inventory_shortage / alternate_part_opportunity /
-- stock_transfer_opportunity / supplier_risk (see INVENTORY_SIGNAL_CATEGORIES) —
-- and were never converted to tasks, so users never saw them.
--
-- Option A (DB trigger): on INSERT of an inventory-category observation signal,
-- create a matching Inventory task (parent_type='inventory'), linked back via
-- source_signal_id (Bug F pattern), so it naturally shows under the Inventory
-- category filter.
--
-- Two wrinkles this migration has to handle that a naive "call create_task on
-- insert" would get wrong:
--   1. tasks.aircraft_id is NOT NULL, but stock_transfer_opportunity /
--      supplier_risk signals are fleet-wide (aircraft_id = null). We resolve a
--      fallback aircraft in the signal's org; if the org has none, we skip
--      (there is nothing to attach the task to).
--   2. generate_inventory_signals_for_org DELETEs + re-INSERTs its signals on
--      every refresh (fresh UUIDs each time). source_signal_id idempotency alone
--      would therefore mint a new task on every refresh. We add a stable
--      natural-key guard: dedup on (org_id, parent_type='inventory', title). The
--      derived title is deterministic from the underlying part/supplier data, so
--      a repeat refresh relinks the existing task to the new signal id instead of
--      duplicating.

-- ─────────────────────────────────────────────────────────────────────────────
-- Worker: promote a single inventory signal to a task. Returns the task id
-- (existing or newly created), or null if it could not be promoted. SECURITY
-- DEFINER so it runs regardless of who/what inserted the signal (the inventory
-- engine runs SECURITY DEFINER; scheduled runs may have no auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.promote_inventory_signal_to_task(p_signal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s            public.signals%rowtype;
  v_ac         uuid;
  v_sub_type   text;
  v_risk       text;
  v_title      text;
  v_why        text;
  v_existing   uuid;
  v_task_id    uuid;
begin
  select * into s from public.signals where id = p_signal_id;
  if s.id is null then return null; end if;

  -- Only supply-chain observation signals become tasks.
  if s.category not in ('inventory_shortage', 'alternate_part_opportunity',
                        'stock_transfer_opportunity', 'supplier_risk') then
    return null;
  end if;
  if coalesce(s.signal_class, 'observation') <> 'observation' then return null; end if;

  -- Map signal category → Inventory task sub_type (task_type_catalog).
  v_sub_type := case s.category
    when 'inventory_shortage'          then 'stock_out_risk'
    when 'alternate_part_opportunity'  then 'alternate_part_needed'
    when 'stock_transfer_opportunity'  then 'stock_out_risk'
    when 'supplier_risk'               then 'supplier_delay'
  end;

  -- Map signal severity → task risk_band (task risk_band is high/medium/low).
  v_risk := case s.severity
    when 'critical' then 'high'
    when 'high'     then 'high'
    when 'medium'   then 'medium'
    else 'low'
  end;

  v_title := s.title;
  -- why_summary derived from the signal's evidence/narrative + recommendation.
  v_why := s.narrative;
  if s.recommendation is not null and length(trim(s.recommendation)) > 0 then
    v_why := v_why || E'\n\nRecommended: ' || s.recommendation;
  end if;

  -- Resolve the aircraft to attach to (tasks.aircraft_id is NOT NULL). Fleet-wide
  -- inventory signals (aircraft_id null) fall back to any aircraft in the org.
  v_ac := s.aircraft_id;
  if v_ac is null then
    select id into v_ac from public.aircraft where org_id = s.org_id
      order by created_at asc nulls last limit 1;
  end if;
  if v_ac is null then return null; end if;  -- org has no aircraft — nothing to attach.

  -- Idempotency. First, is this exact signal already promoted?
  select id into v_existing from public.tasks
    where source_signal_id = p_signal_id order by created_at_utc asc limit 1;
  if v_existing is not null then return v_existing; end if;

  -- Stable natural-key guard: an Inventory task with the same title already
  -- represents this recommendation (survives the engine's delete+recreate churn).
  -- Relink it to the current signal id (so get_task_for_signal / "View task"
  -- resolves for the fresh signal) and reuse it instead of duplicating.
  select id into v_existing from public.tasks
    where org_id = s.org_id and parent_type = 'inventory' and title = v_title
    order by created_at_utc asc limit 1;
  if v_existing is not null then
    update public.tasks set source_signal_id = p_signal_id
      where id = v_existing and source_signal_id is distinct from p_signal_id;
    return v_existing;
  end if;

  -- Create the task. Mirrors create_task's writes (tasks + task_sources +
  -- task_events) rather than calling the RPC: create_task is SECURITY INVOKER +
  -- write-gated and would fail in the no-auth scheduled-generation path.
  insert into public.tasks (
    org_id, aircraft_id, title, why_summary, parent_type, sub_type,
    risk_band, reporter_user_id, board_rank, source_signal_id
  ) values (
    s.org_id, v_ac, v_title, v_why, 'inventory', v_sub_type,
    v_risk, auth.uid(), extract(epoch from s.generated_at_utc), p_signal_id
  )
  returning id into v_task_id;

  insert into public.task_sources (task_id, source_system, source_reference_id)
  values (v_task_id, 'avir', p_signal_id::text);

  insert into public.task_events (org_id, task_id, actor_user_id, event_type, event_payload)
  values (s.org_id, v_task_id, auth.uid(), 'task_created',
          jsonb_build_object('title', v_title, 'parent_type', 'inventory',
                             'sub_type', v_sub_type, 'source_system', 'avir',
                             'source_signal_id', p_signal_id));

  return v_task_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger wrapper: never let a promotion failure abort the signal insert.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_promote_inventory_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.promote_inventory_signal_to_task(new.id);
  exception when others then
    raise warning 'promote_inventory_signal_to_task failed for signal %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists signals_promote_inventory on public.signals;
create trigger signals_promote_inventory
  after insert on public.signals
  for each row
  when (new.category in ('inventory_shortage', 'alternate_part_opportunity',
                         'stock_transfer_opportunity', 'supplier_risk')
        and coalesce(new.signal_class, 'observation') = 'observation'
        and new.is_active)
  execute function public.trg_promote_inventory_signal();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: promote inventory signals that already exist (seeded before this
-- migration) so they appear immediately without waiting for a re-generation.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select id from public.signals
    where category in ('inventory_shortage', 'alternate_part_opportunity',
                       'stock_transfer_opportunity', 'supplier_risk')
      and coalesce(signal_class, 'observation') = 'observation'
      and is_active
    order by generated_at_utc asc
  loop
    perform public.promote_inventory_signal_to_task(r.id);
  end loop;
end $$;
