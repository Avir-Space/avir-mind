-- Phase 2.5 — flight_schedules
-- Seeded (not live) schedule data powering the Command Center operational
-- timeline. No real ingestion this phase; source_system defaults to 'avir'.

create table public.flight_schedules (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  aircraft_id             uuid not null references public.aircraft (id) on delete cascade,
  flight_number           text,
  origin_station          text not null,
  destination_station     text not null,
  scheduled_departure_utc timestamptz not null,
  scheduled_arrival_utc   timestamptz not null,
  status                  text not null default 'scheduled'
                            check (status in ('scheduled', 'boarding', 'departed', 'en_route', 'arrived', 'cancelled', 'delayed')),
  delay_minutes           int not null default 0,
  source_system           text not null default 'avir'
                            check (source_system in ('fr', 'ops_system', 'manual', 'avir')),
  created_at_utc          timestamptz not null default now(),
  updated_at_utc          timestamptz not null default now()
);

create index flight_schedules_org_idx on public.flight_schedules (org_id);
create index flight_schedules_aircraft_idx on public.flight_schedules (aircraft_id);
create index flight_schedules_departure_idx on public.flight_schedules (scheduled_departure_utc);

alter table public.flight_schedules enable row level security;

create policy "flight_schedules visible within org"
  on public.flight_schedules for select using (public.is_org_member(org_id));
create policy "flight_schedules insertable within org"
  on public.flight_schedules for insert with check (public.is_org_member(org_id));
create policy "flight_schedules updatable within org"
  on public.flight_schedules for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "flight_schedules deletable within org"
  on public.flight_schedules for delete using (public.is_org_member(org_id));

-- Realtime: full row images so the timeline can react to status/delay changes.
alter table public.flight_schedules replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'flight_schedules'
  ) then
    alter publication supabase_realtime add table public.flight_schedules;
  end if;
end
$$;
