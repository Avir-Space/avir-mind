-- Security fix: the viewer role could write tasks/signals. All write RPCs are
-- SECURITY INVOKER, but the RLS write policies used is_org_member(org_id), which
-- is true for EVERY member including 'viewer'. Add an is_org_editor() gate
-- (owner/admin/editor) and require it on writes so read-only users are blocked
-- at the database layer (create_task, acknowledge, log work, status change,
-- signal actions, signal dismiss all go through these tables).

create or replace function public.is_org_editor(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'editor')
  );
$$;
grant execute on function public.is_org_editor(uuid) to authenticated;

-- ── tasks ────────────────────────────────────────────────────────────────────
drop policy if exists "tasks insertable within org" on public.tasks;
create policy "tasks insertable within org" on public.tasks
  for insert with check (public.is_org_editor(org_id));

drop policy if exists "tasks updatable within org" on public.tasks;
create policy "tasks updatable within org" on public.tasks
  for update using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

-- ── task_sources ─────────────────────────────────────────────────────────────
drop policy if exists "task_sources insertable within org" on public.task_sources;
create policy "task_sources insertable within org" on public.task_sources
  for insert with check (exists (
    select 1 from public.tasks t where t.id = task_sources.task_id and public.is_org_editor(t.org_id)));

-- ── task_events ──────────────────────────────────────────────────────────────
drop policy if exists "task_events insertable within org" on public.task_events;
create policy "task_events insertable within org" on public.task_events
  for insert with check (public.is_org_editor(org_id));

-- ── task_acknowledgements ────────────────────────────────────────────────────
drop policy if exists "task_acks insertable within org" on public.task_acknowledgements;
create policy "task_acks insertable within org" on public.task_acknowledgements
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_acknowledgements.task_id and public.is_org_editor(t.org_id)));

-- ── task_work_logs ───────────────────────────────────────────────────────────
drop policy if exists "work_logs insertable within org" on public.task_work_logs;
create policy "work_logs insertable within org" on public.task_work_logs
  for insert with check (public.is_org_editor(org_id) and user_id = auth.uid());

-- ── signals ──────────────────────────────────────────────────────────────────
drop policy if exists "signals insertable within org" on public.signals;
create policy "signals insertable within org" on public.signals
  for insert with check (public.is_org_editor(org_id));

drop policy if exists "signals updatable within org" on public.signals;
create policy "signals updatable within org" on public.signals
  for update using (public.is_org_editor(org_id)) with check (public.is_org_editor(org_id));

-- ── signal_actions ───────────────────────────────────────────────────────────
-- Viewers may still log a passive 'viewed' action, but not any mutating action
-- (create_task, dismissed, marked_correct/incorrect, what_if_explored).
drop policy if exists "signal_actions insertable within org" on public.signal_actions;
create policy "signal_actions insertable within org" on public.signal_actions
  for insert with check (
    actor_user_id = auth.uid()
    and (public.is_org_editor(org_id) or action_type = 'viewed'));
