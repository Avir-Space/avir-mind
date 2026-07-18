-- Signals surface bug: /signals renders the TASKS queue (get_command_center_queue),
-- so active OBSERVATION signals with no linked task are invisible — including the
-- most operationally important ones (AOG recovery risk, crew rest violation,
-- dispatch-blocking stalls, maintenance clusters, overdue tasks, …). Bug D already
-- promotes inventory signals to tasks; this generalizes that to promote the
-- actionable (critical + high) non-inventory observation signals too, under a new
-- operational task taxonomy so they show in the queue and under a category filter.
--
-- Scope decision (flagged for review): only severity critical/high observation
-- signals are promoted to tasks — those are discrete, actionable alerts. Lower-
-- severity insight/correlation signals stay as raw signals (now browsable under
-- the Signals page "Observations" tab) rather than flooding the task board.

-- ── New operational task taxonomy (tasks.parent_type/sub_type FK targets) ─────
insert into public.task_type_catalog (parent_type, sub_type, display_name, sort_rank) values
  ('dispatch',        'aog_recovery',       'AOG Recovery',        10),
  ('dispatch',        'dispatch_risk',      'Dispatch Risk',       20),
  ('maintenance',     'maintenance_cluster','Maintenance Cluster', 10),
  ('maintenance',     'deferred_work',      'Deferred Work',       20),
  ('maintenance',     'recurring_fault',    'Recurring Fault',     30),
  ('task_management', 'overdue',            'Overdue',             10),
  ('task_management', 'operational_alert',  'Operational Alert',   20),
  ('crew',            'crew_alert',         'Crew Alert',          50),
  ('compliance',      'compliance_alert',   'Compliance Alert',    50)
on conflict (parent_type, sub_type) do update
  set display_name = excluded.display_name, sort_rank = excluded.sort_rank, active = true;

-- ── Worker: promote one operational observation signal to a task ─────────────
create or replace function public.promote_operational_signal_to_task(p_signal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s          public.signals%rowtype;
  v_ac       uuid;
  v_parent   text;
  v_sub      text;
  v_risk     text;
  v_why      text;
  v_existing uuid;
  v_task_id  uuid;
begin
  select * into s from public.signals where id = p_signal_id;
  if s.id is null then return null; end if;

  -- Only actionable observation signals. Inventory categories are handled by the
  -- Bug D trigger (promote_inventory_signal_to_task); skip them here.
  if coalesce(s.signal_class, 'observation') <> 'observation' then return null; end if;
  if not s.is_active then return null; end if;
  if s.severity not in ('critical', 'high') then return null; end if;
  if s.category in ('inventory_shortage', 'alternate_part_opportunity',
                    'stock_transfer_opportunity', 'supplier_risk') then return null; end if;

  -- Map signal category → operational task parent_type.
  v_parent := case
    when s.category in ('aog_recovery_risk', 'dispatch_risk') then 'dispatch'
    when s.category in ('crew_rest_violation', 'crew_fatigue_risk', 'qualification_expiring_soon') then 'crew'
    when s.category in ('compliance_risk', 'compliance_overdue', 'mel_extension_risk',
                        'llp_approaching_limit', 'sb_recommendation_open') then 'compliance'
    when s.category in ('powerplant_maintenance_cluster', 'powerplant_cluster', 'powerplant_risk',
                        'maintenance_scheduling', 'maintenance_risk', 'maintenance_window',
                        'deferred_work_compounding', 'deferred_work_pattern',
                        'recurring_defect', 'recurring_fault', 'avionics_recurring_fault',
                        'correlated_avionics_pattern', 'avionics_reliability', 'structural_monitoring') then 'maintenance'
    else 'task_management'
  end;

  v_sub := case v_parent
    when 'dispatch' then case when s.category = 'aog_recovery_risk' then 'aog_recovery' else 'dispatch_risk' end
    when 'crew' then 'crew_alert'
    when 'compliance' then 'compliance_alert'
    when 'maintenance' then case
        when s.category in ('recurring_defect', 'recurring_fault', 'avionics_recurring_fault',
                            'correlated_avionics_pattern', 'avionics_reliability') then 'recurring_fault'
        when s.category in ('deferred_work_compounding', 'deferred_work_pattern') then 'deferred_work'
        else 'maintenance_cluster' end
    else case when s.category = 'overdue_task' then 'overdue' else 'operational_alert' end
  end;

  v_risk := case s.severity when 'critical' then 'high' when 'high' then 'high' else 'medium' end;

  v_why := s.narrative;
  if s.recommendation is not null and length(trim(s.recommendation)) > 0 then
    v_why := v_why || E'\n\nRecommended: ' || s.recommendation;
  end if;

  -- tasks.aircraft_id is NOT NULL; fleet-wide signals (crew, DS.AI, …) fall back
  -- to any aircraft in the org.
  v_ac := s.aircraft_id;
  if v_ac is null then
    select id into v_ac from public.aircraft where org_id = s.org_id order by created_at asc nulls last limit 1;
  end if;
  if v_ac is null then return null; end if;

  -- Idempotency: exact signal already promoted?
  select id into v_existing from public.tasks where source_signal_id = p_signal_id order by created_at_utc asc limit 1;
  if v_existing is not null then return v_existing; end if;

  -- Stable natural-key guard (survives signal regeneration): same org + title.
  select id into v_existing from public.tasks
    where org_id = s.org_id and title = s.title order by created_at_utc asc limit 1;
  if v_existing is not null then
    update public.tasks set source_signal_id = p_signal_id
      where id = v_existing and source_signal_id is distinct from p_signal_id;
    return v_existing;
  end if;

  insert into public.tasks (
    org_id, aircraft_id, title, why_summary, parent_type, sub_type,
    risk_band, reporter_user_id, board_rank, source_signal_id
  ) values (
    s.org_id, v_ac, s.title, v_why, v_parent, v_sub,
    v_risk, auth.uid(), extract(epoch from s.generated_at_utc), p_signal_id
  ) returning id into v_task_id;

  insert into public.task_sources (task_id, source_system, source_reference_id)
  values (v_task_id, 'avir', p_signal_id::text);

  insert into public.task_events (org_id, task_id, actor_user_id, event_type, event_payload)
  values (s.org_id, v_task_id, auth.uid(), 'task_created',
          jsonb_build_object('title', s.title, 'parent_type', v_parent, 'sub_type', v_sub,
                             'source_system', 'avir', 'source_signal_id', p_signal_id, 'signal_category', s.category));
  return v_task_id;
end;
$$;

-- ── Trigger: never let a promotion failure abort the signal insert ───────────
create or replace function public.trg_promote_operational_signal()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.promote_operational_signal_to_task(new.id);
  exception when others then
    raise warning 'promote_operational_signal_to_task failed for signal %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists signals_promote_operational on public.signals;
create trigger signals_promote_operational
  after insert on public.signals
  for each row
  when (new.severity in ('critical', 'high')
        and coalesce(new.signal_class, 'observation') = 'observation'
        and new.is_active
        and new.category not in ('inventory_shortage', 'alternate_part_opportunity',
                                 'stock_transfer_opportunity', 'supplier_risk'))
  execute function public.trg_promote_operational_signal();

-- ── Backfill existing actionable observation signals ─────────────────────────
do $$
declare r record;
begin
  for r in
    select id from public.signals
    where severity in ('critical', 'high')
      and coalesce(signal_class, 'observation') = 'observation'
      and is_active
      and category not in ('inventory_shortage', 'alternate_part_opportunity',
                           'stock_transfer_opportunity', 'supplier_risk')
    order by (severity = 'critical') desc, generated_at_utc asc
  loop
    perform public.promote_operational_signal_to_task(r.id);
  end loop;
end $$;
