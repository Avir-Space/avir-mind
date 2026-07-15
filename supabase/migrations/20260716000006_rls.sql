-- 0006: Row Level Security policies
--
-- Every table is gated by org membership. Tables that carry org_id gate on it
-- directly; join tables (fleet_aircraft, aircraft_state) gate through their
-- parent aircraft's org_id. The seed function and signup trigger are
-- SECURITY DEFINER and therefore bypass these policies during provisioning.

-- ── orgs ─────────────────────────────────────────────────────────────────────
create policy "orgs are visible to members"
  on public.orgs for select
  using (public.is_org_member(id));
create policy "orgs are updatable by members"
  on public.orgs for update
  using (public.is_org_member(id))
  with check (public.is_org_member(id));
create policy "orgs are insertable by members"
  on public.orgs for insert
  with check (public.is_org_member(id));
create policy "orgs are deletable by members"
  on public.orgs for delete
  using (public.is_org_member(id));

-- ── org_members ──────────────────────────────────────────────────────────────
create policy "members visible within org"
  on public.org_members for select
  using (public.is_org_member(org_id));
create policy "members insertable within org"
  on public.org_members for insert
  with check (public.is_org_member(org_id));
create policy "members updatable within org"
  on public.org_members for update
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));
create policy "members deletable within org"
  on public.org_members for delete
  using (public.is_org_member(org_id));

-- ── fleets ───────────────────────────────────────────────────────────────────
create policy "fleets visible within org"
  on public.fleets for select using (public.is_org_member(org_id));
create policy "fleets insertable within org"
  on public.fleets for insert with check (public.is_org_member(org_id));
create policy "fleets updatable within org"
  on public.fleets for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "fleets deletable within org"
  on public.fleets for delete using (public.is_org_member(org_id));

-- ── aircraft ─────────────────────────────────────────────────────────────────
create policy "aircraft visible within org"
  on public.aircraft for select using (public.is_org_member(org_id));
create policy "aircraft insertable within org"
  on public.aircraft for insert with check (public.is_org_member(org_id));
create policy "aircraft updatable within org"
  on public.aircraft for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "aircraft deletable within org"
  on public.aircraft for delete using (public.is_org_member(org_id));

-- ── fleet_aircraft (gate through aircraft.org_id) ────────────────────────────
create policy "fleet_aircraft visible within org"
  on public.fleet_aircraft for select
  using (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));
create policy "fleet_aircraft insertable within org"
  on public.fleet_aircraft for insert
  with check (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));
create policy "fleet_aircraft deletable within org"
  on public.fleet_aircraft for delete
  using (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));

-- ── aircraft_state (gate through aircraft.org_id) ────────────────────────────
create policy "aircraft_state visible within org"
  on public.aircraft_state for select
  using (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));
create policy "aircraft_state insertable within org"
  on public.aircraft_state for insert
  with check (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));
create policy "aircraft_state updatable within org"
  on public.aircraft_state for update
  using (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)))
  with check (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));
create policy "aircraft_state deletable within org"
  on public.aircraft_state for delete
  using (exists (select 1 from public.aircraft a where a.id = aircraft_id and public.is_org_member(a.org_id)));

-- ── aircraft_state_history ───────────────────────────────────────────────────
create policy "state history visible within org"
  on public.aircraft_state_history for select using (public.is_org_member(org_id));
create policy "state history insertable within org"
  on public.aircraft_state_history for insert with check (public.is_org_member(org_id));

-- ── audit_events ─────────────────────────────────────────────────────────────
create policy "audit visible within org"
  on public.audit_events for select using (public.is_org_member(org_id));
create policy "audit insertable within org"
  on public.audit_events for insert with check (public.is_org_member(org_id));
