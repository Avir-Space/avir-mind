-- 0103: RLS policies for task tables.
-- Org-scoped tables gate on is_org_member(org_id). Join tables without org_id
-- (task_sources, task_acknowledgements) gate through their parent task's org.
-- task_type_catalog is global read-only reference data.

-- ── task_type_catalog — everyone signed in may read; nobody may write via API ──
create policy "task types are readable"
  on public.task_type_catalog for select
  using (true);

-- ── tasks ────────────────────────────────────────────────────────────────────
create policy "tasks visible within org"
  on public.tasks for select using (public.is_org_member(org_id));
create policy "tasks insertable within org"
  on public.tasks for insert with check (public.is_org_member(org_id));
create policy "tasks updatable within org"
  on public.tasks for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "tasks deletable within org"
  on public.tasks for delete using (public.is_org_member(org_id));

-- ── task_sources (gate through parent task) ──────────────────────────────────
create policy "task_sources visible within org"
  on public.task_sources for select
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_member(t.org_id)));
create policy "task_sources insertable within org"
  on public.task_sources for insert
  with check (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_member(t.org_id)));
create policy "task_sources updatable within org"
  on public.task_sources for update
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_member(t.org_id)));
create policy "task_sources deletable within org"
  on public.task_sources for delete
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_member(t.org_id)));

-- ── task_events ──────────────────────────────────────────────────────────────
create policy "task_events visible within org"
  on public.task_events for select using (public.is_org_member(org_id));
create policy "task_events insertable within org"
  on public.task_events for insert with check (public.is_org_member(org_id));

-- ── task_acknowledgements (gate through parent task) ─────────────────────────
create policy "task_acks visible within org"
  on public.task_acknowledgements for select
  using (exists (select 1 from public.tasks t where t.id = task_id and public.is_org_member(t.org_id)));
create policy "task_acks insertable within org"
  on public.task_acknowledgements for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and public.is_org_member(t.org_id))
  );
create policy "task_acks deletable within org"
  on public.task_acknowledgements for delete
  using (user_id = auth.uid());

-- ── task_work_logs ───────────────────────────────────────────────────────────
create policy "work_logs visible within org"
  on public.task_work_logs for select using (public.is_org_member(org_id));
create policy "work_logs insertable within org"
  on public.task_work_logs for insert with check (public.is_org_member(org_id) and user_id = auth.uid());
create policy "work_logs updatable by author"
  on public.task_work_logs for update using (public.is_org_member(org_id) and user_id = auth.uid());
create policy "work_logs deletable by author"
  on public.task_work_logs for delete using (public.is_org_member(org_id) and user_id = auth.uid());

-- ── task_attachments ─────────────────────────────────────────────────────────
create policy "attachments visible within org"
  on public.task_attachments for select using (public.is_org_member(org_id));
create policy "attachments insertable within org"
  on public.task_attachments for insert with check (public.is_org_member(org_id) and uploaded_by_user_id = auth.uid());
create policy "attachments deletable within org"
  on public.task_attachments for delete using (public.is_org_member(org_id));

-- ── task_dependencies ────────────────────────────────────────────────────────
create policy "dependencies visible within org"
  on public.task_dependencies for select using (public.is_org_member(org_id));
create policy "dependencies insertable within org"
  on public.task_dependencies for insert with check (public.is_org_member(org_id));
create policy "dependencies deletable within org"
  on public.task_dependencies for delete using (public.is_org_member(org_id));
