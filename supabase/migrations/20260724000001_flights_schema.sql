-- Phase 7 — Flight Ops. Promote flight_schedules to a first-class `flights`
-- entity with operational depth, and add the dispatch / weather / events /
-- delay / briefing substrate. A security_invoker compat view keeps the six
-- existing reader functions (incl. the Command Center snapshot) working.

alter table public.flight_schedules rename to flights;

-- Relax the enums we are widening.
alter table public.flights drop constraint if exists flight_schedules_status_check;
alter table public.flights drop constraint if exists flight_schedules_source_system_check;

-- Map legacy status values to the richer operational vocabulary.
update public.flights set status = case status
  when 'departed' then 'airborne' when 'en_route' then 'airborne' else status end;

alter table public.flights
  add column if not exists flight_date date,
  add column if not exists alternate_stations text[],
  add column if not exists estimated_departure_utc timestamptz,
  add column if not exists estimated_arrival_utc timestamptz,
  add column if not exists actual_out_utc timestamptz,
  add column if not exists actual_off_utc timestamptz,
  add column if not exists actual_on_utc timestamptz,
  add column if not exists actual_in_utc timestamptz,
  add column if not exists delay_codes text[],
  add column if not exists cancellation_reason text,
  add column if not exists diversion_station text,
  add column if not exists planned_route text,
  add column if not exists planned_flight_level int,
  add column if not exists planned_block_time_minutes int,
  add column if not exists actual_block_time_minutes int,
  add column if not exists planned_fuel_kg int,
  add column if not exists actual_fuel_kg int,
  add column if not exists passenger_count int,
  add column if not exists cargo_kg int,
  add column if not exists source_reference_id text;

update public.flights set flight_date = coalesce(flight_date, scheduled_departure_utc::date),
  planned_block_time_minutes = coalesce(planned_block_time_minutes, round(extract(epoch from (scheduled_arrival_utc - scheduled_departure_utc)) / 60));
alter table public.flights alter column flight_date set not null;

alter table public.flights add constraint flights_status_check check (status in
  ('planned', 'scheduled', 'dispatched', 'boarding', 'taxiing', 'airborne', 'arrived', 'delayed', 'cancelled', 'diverted', 'returned'));
alter table public.flights add constraint flights_source_system_check check (source_system in ('fr', 'ops_system', 'sita', 'manual', 'avir'));

create index if not exists flights_date_ac_idx on public.flights (org_id, flight_date, aircraft_id);
create index if not exists flights_status_idx on public.flights (org_id, status);
create index if not exists flights_ac_dep_idx on public.flights (aircraft_id, scheduled_departure_utc desc);

-- Read-compat view for the pre-Phase-7 functions that still query flight_schedules.
create or replace view public.flight_schedules with (security_invoker = true) as
  select id, org_id, flight_number, aircraft_id, origin_station, destination_station,
    scheduled_departure_utc, scheduled_arrival_utc, status, delay_minutes, source_system, source_reference_id,
    created_at_utc, updated_at_utc
  from public.flights;

-- ── New tables ───────────────────────────────────────────────────────────────
create table public.dispatch_releases (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  flight_id                uuid not null references public.flights (id) on delete cascade,
  release_number           text not null,
  dispatcher_user_id       uuid references auth.users (id) on delete set null,
  released_at_utc          timestamptz not null default now(),
  valid_until_utc          timestamptz,
  status                   text default 'draft' check (status in ('draft', 'pending_captain', 'captain_accepted', 'revoked', 'superseded')),
  planned_route_detail     jsonb,
  fuel_plan                jsonb,
  weather_summary          jsonb,
  notam_summary            jsonb,
  mel_items                jsonb,
  weight_and_balance       jsonb,
  performance_data         jsonb,
  captain_signature_utc    timestamptz,
  captain_notes            text,
  superseded_by_release_id uuid references public.dispatch_releases (id) on delete set null,
  created_at_utc           timestamptz not null default now()
);
create index dispatch_releases_flight_idx on public.dispatch_releases (flight_id);
create index dispatch_releases_status_idx on public.dispatch_releases (org_id, status);

create table public.weather_observations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid references public.orgs (id) on delete cascade,
  station_code       text not null,
  observation_type   text check (observation_type in ('metar', 'taf', 'sigmet', 'airmet', 'pirep', 'forecast')),
  observation_time_utc timestamptz not null,
  valid_from_utc     timestamptz,
  valid_until_utc    timestamptz,
  raw_text           text,
  parsed_data        jsonb,
  flight_category    text check (flight_category in ('vfr', 'mvfr', 'ifr', 'lifr')),
  source             text default 'avir' check (source in ('avwx', 'noaa', 'aviationstack', 'manual', 'avir')),
  created_at_utc     timestamptz not null default now()
);
create index weather_station_idx on public.weather_observations (station_code, observation_time_utc desc);
create index weather_type_idx on public.weather_observations (observation_type, observation_time_utc desc);

create table public.flight_events (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  flight_id          uuid not null references public.flights (id) on delete cascade,
  event_type         text check (event_type in ('release_issued', 'boarding_started', 'boarding_completed', 'doors_closed',
                       'pushback', 'taxi_out', 'takeoff', 'top_of_climb', 'cruise_deviation', 'top_of_descent', 'landing',
                       'taxi_in', 'doors_open', 'deplaning_completed', 'delay_recorded', 'delay_code_applied',
                       'alternate_declared', 'emergency_declared', 'diversion_executed', 'cancellation', 'crew_change',
                       'aircraft_swap', 'fuel_uplift', 'incident_report')),
  event_time_utc     timestamptz not null,
  reported_by_user_id uuid references auth.users (id) on delete set null,
  source_system      text check (source_system in ('sita', 'acars', 'manual', 'ops_system', 'avir')),
  source_reference_id text,
  event_payload      jsonb,
  created_at_utc     timestamptz not null default now()
);
create index flight_events_flight_idx on public.flight_events (flight_id, event_time_utc);
create index flight_events_org_idx on public.flight_events (org_id, event_time_utc desc);

create table public.delay_attribution (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  flight_id           uuid not null references public.flights (id) on delete cascade,
  delay_code          text not null,
  delay_code_category text not null,
  delay_minutes       int not null,
  delay_reason        text,
  responsibility_org  text,
  created_at_utc      timestamptz not null default now()
);
create index delay_attribution_flight_idx on public.delay_attribution (flight_id);
create index delay_attribution_cat_idx on public.delay_attribution (org_id, delay_code_category);

create table public.flight_briefings (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  flight_id               uuid not null references public.flights (id) on delete cascade,
  generated_at_utc        timestamptz not null default now(),
  briefing_type           text check (briefing_type in ('dispatch_release_package', 'weather_brief', 'notam_brief', 'fuel_brief', 'alternates_brief', 'full_package')),
  content_json            jsonb,
  content_pdf_storage_path text,
  issued_to_crew_ids      uuid[],
  acknowledged_by_crew_ids uuid[],
  created_at_utc          timestamptz not null default now()
);
create index flight_briefings_flight_idx on public.flight_briefings (flight_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['dispatch_releases', 'flight_events', 'delay_attribution', 'flight_briefings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s read" on public.%1$s for select using (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert with check (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s update" on public.%1$s for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s delete" on public.%1$s for delete using (public.is_org_member(org_id))', t);
  end loop;
end $$;

-- Weather: org-scoped or shared (null org).
alter table public.weather_observations enable row level security;
create policy "weather read" on public.weather_observations for select using (org_id is null or public.is_org_member(org_id));
create policy "weather insert" on public.weather_observations for insert with check (public.is_org_member(org_id));
create policy "weather update" on public.weather_observations for update using (public.is_org_member(org_id));
create policy "weather delete" on public.weather_observations for delete using (public.is_org_member(org_id));

-- Realtime on flights + flight_events.
alter table public.flights replica identity full;
alter table public.flight_events replica identity full;
do $$
declare t text;
begin
  foreach t in array array['flights', 'flight_events']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
