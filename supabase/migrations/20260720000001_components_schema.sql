-- Phase 3 — Component substrate + predictive-signal extension.
-- Components are the atomic unit of aviation value; component_events become the
-- genealogy in Phase 4.

create table public.components (
  id                             uuid primary key default gen_random_uuid(),
  org_id                         uuid not null references public.orgs (id) on delete cascade,
  aircraft_id                    uuid references public.aircraft (id) on delete set null,
  component_type                 text not null
                                   check (component_type in ('engine', 'apu', 'landing_gear_main', 'landing_gear_nose',
                                     'propeller', 'avionics_unit', 'environmental_control', 'battery', 'other')),
  part_number                    text not null,
  serial_number                  text not null,
  position_code                  text,
  manufacturer                   text,
  installed_at_utc               timestamptz,
  removed_at_utc                 timestamptz,
  current_cycles                 int default 0,
  current_flight_hours           numeric(12,2) default 0,
  cycles_since_new               int default 0,
  flight_hours_since_new         numeric(12,2) default 0,
  cycles_since_overhaul          int default 0,
  flight_hours_since_overhaul    numeric(12,2) default 0,
  limit_cycles                   int,
  limit_flight_hours             numeric(12,2),
  overhaul_interval_cycles       int,
  overhaul_interval_hours        numeric(12,2),
  next_scheduled_event_type      text,
  next_scheduled_event_due_cycles int,
  next_scheduled_event_due_hours numeric(12,2),
  next_scheduled_event_due_date  date,
  status                         text not null default 'on_wing'
                                   check (status in ('on_wing', 'off_wing_inventory', 'off_wing_repair', 'scrapped')),
  health_score                   int check (health_score between 0 and 100),
  health_score_updated_at_utc    timestamptz,
  created_at_utc                 timestamptz not null default now(),
  updated_at_utc                 timestamptz not null default now(),
  unique (org_id, part_number, serial_number)
);

create index components_aircraft_idx on public.components (org_id, aircraft_id, status);
create index components_type_idx on public.components (org_id, component_type, status);

create table public.component_events (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  component_id            uuid not null references public.components (id) on delete cascade,
  aircraft_id             uuid references public.aircraft (id) on delete set null,
  event_type              text not null
                            check (event_type in ('installed', 'removed', 'cycle_recorded', 'hours_recorded',
                              'finding_recorded', 'borescope', 'overhaul', 'repair', 'functional_test',
                              'oil_analysis', 'vibration_survey', 'incident_recorded', 'warranty_claim', 'quality_escape')),
  event_date_utc          date not null,
  cycles_at_event         int,
  flight_hours_at_event   numeric(12,2),
  finding_severity        text check (finding_severity in ('nil', 'minor', 'moderate', 'major', 'critical')),
  finding_description     text,
  station                 text,
  facility                text,
  performed_by            text,
  documentation_reference text,
  cost_usd                numeric(12,2),
  linked_task_id          uuid references public.tasks (id) on delete set null,
  linked_signal_id        uuid references public.signals (id) on delete set null,
  source_system           text not null default 'avir'
                            check (source_system in ('amos', 'trax', 'sap', 'avir', 'manual')),
  source_reference_id     text,
  event_payload           jsonb,
  created_at_utc          timestamptz not null default now()
);

create index component_events_component_idx on public.component_events (component_id, event_date_utc desc);
create index component_events_type_idx on public.component_events (org_id, event_type, event_date_utc desc);
create index component_events_aircraft_idx on public.component_events (aircraft_id, event_date_utc desc);

create table public.component_health_history (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  component_id      uuid not null references public.components (id) on delete cascade,
  health_score      int not null,
  score_contributors jsonb,
  computed_at_utc   timestamptz not null default now()
);

create index component_health_history_idx on public.component_health_history (component_id, computed_at_utc desc);

-- Predictive-signal extension to the Phase 2 signals table.
alter table public.signals
  add column signal_class text not null default 'observation'
    check (signal_class in ('observation', 'prediction', 'insufficient_data')),
  add column component_id uuid references public.components (id) on delete set null,
  add column prediction_horizon jsonb,
  add column predicted_event_type text,
  add column historical_baseline jsonb,
  add column accuracy_measured_at_utc timestamptz,
  add column accuracy_result text not null default 'pending'
    check (accuracy_result in ('correct', 'partial', 'incorrect', 'pending')),
  add column accuracy_notes text;

create index signals_class_idx on public.signals (org_id, signal_class, is_active);
create index signals_component_idx on public.signals (component_id) where component_id is not null;

-- RLS: direct org gate, mirroring the Phase 1/2 style.
alter table public.components enable row level security;
alter table public.component_events enable row level security;
alter table public.component_health_history enable row level security;

create policy "components visible within org"   on public.components for select using (public.is_org_member(org_id));
create policy "components insertable within org" on public.components for insert with check (public.is_org_member(org_id));
create policy "components updatable within org"  on public.components for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "components deletable within org"  on public.components for delete using (public.is_org_member(org_id));

create policy "component_events visible within org"   on public.component_events for select using (public.is_org_member(org_id));
create policy "component_events insertable within org" on public.component_events for insert with check (public.is_org_member(org_id));
create policy "component_events updatable within org"  on public.component_events for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "component_events deletable within org"  on public.component_events for delete using (public.is_org_member(org_id));

create policy "component_health visible within org"   on public.component_health_history for select using (public.is_org_member(org_id));
create policy "component_health insertable within org" on public.component_health_history for insert with check (public.is_org_member(org_id));

-- Realtime for two-user updates on component events + components.
alter table public.components replica identity full;
alter table public.component_events replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'components') then
    alter publication supabase_realtime add table public.components;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'component_events') then
    alter publication supabase_realtime add table public.component_events;
  end if;
end
$$;
