-- Phase 6 — Crew module. FTL rules-as-configuration, per-qualification currency,
-- duty periods, and roster assignments.

create table public.crew_members (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  employee_id         text not null,
  first_name          text not null,
  last_name           text not null,
  email               text,
  phone               text,
  role                text check (role in ('captain', 'first_officer', 'cabin_crew', 'loadmaster', 'engineer', 'ground_operations', 'dispatcher', 'other')),
  home_base_station   text,
  date_of_birth       date,
  hire_date           date,
  primary_jurisdiction text,
  seniority_number    int,
  employment_status   text default 'active' check (employment_status in ('active', 'leave', 'suspended', 'terminated')),
  notes               text,
  created_at_utc      timestamptz not null default now(),
  updated_at_utc      timestamptz not null default now(),
  unique (org_id, employee_id)
);
create index crew_members_role_idx on public.crew_members (org_id, role, employment_status);
create index crew_members_base_idx on public.crew_members (org_id, home_base_station);

create table public.qualifications (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  qualification_code        text not null,
  qualification_name        text not null,
  qualification_type        text check (qualification_type in ('type_rating', 'endorsement', 'medical', 'license', 'recurrent_training', 'line_check', 'route_qual', 'station_qual', 'aircraft_familiarization', 'ground_school')),
  applicable_roles          text[],
  applicable_aircraft_types text[],
  validity_duration_days    int,
  issuing_authority         text,
  created_at_utc            timestamptz not null default now(),
  unique (org_id, qualification_code)
);

create table public.crew_qualifications (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  crew_member_id          uuid not null references public.crew_members (id) on delete cascade,
  qualification_id        uuid not null references public.qualifications (id) on delete cascade,
  issued_date             date not null,
  expiry_date             date,
  issuing_reference       text,
  status                  text default 'valid' check (status in ('valid', 'expired', 'suspended', 'under_recurrent')),
  last_currency_event_date date,
  currency_details        jsonb,
  created_at_utc          timestamptz not null default now(),
  updated_at_utc          timestamptz not null default now()
);
create index crew_qualifications_cm_idx on public.crew_qualifications (crew_member_id, qualification_id);
create index crew_qualifications_expiry_idx on public.crew_qualifications (org_id, expiry_date) where expiry_date is not null;

create table public.duty_periods (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  crew_member_id            uuid not null references public.crew_members (id) on delete cascade,
  duty_type                 text check (duty_type in ('flight', 'standby_airport', 'standby_home', 'ground_duty', 'training', 'deadhead', 'positioning', 'reserve')),
  start_utc                 timestamptz not null,
  end_utc                   timestamptz not null,
  report_utc                timestamptz,
  release_utc               timestamptz,
  flight_time_minutes       int,
  station_from              text,
  station_to                text,
  augmented_crew            boolean default false,
  night_operations          boolean default false,
  crossing_time_zones       int default 0,
  linked_flight_schedule_ids uuid[],
  status                    text default 'planned' check (status in ('planned', 'published', 'actual', 'cancelled')),
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now()
);
create index duty_periods_cm_idx on public.duty_periods (crew_member_id, start_utc desc);
create index duty_periods_org_idx on public.duty_periods (org_id, start_utc);

create table public.rule_configurations (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  rule_config_name          text not null,
  regulator                 text not null check (regulator in ('faa_part_117', 'faa_part_121', 'faa_part_135', 'easa_ftl', 'uk_caa_ftl', 'casa_cao_481', 'dgca_car_7', 'transport_canada_602', 'other')),
  cba_overlay_name          text,
  rule_stack                jsonb not null,
  applicable_roles          text[],
  applicable_aircraft_types text[],
  effective_from            date not null,
  effective_to              date,
  is_active                 boolean default true,
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now()
);

create table public.rule_check_results (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  crew_member_id    uuid not null references public.crew_members (id) on delete cascade,
  duty_period_id    uuid references public.duty_periods (id) on delete set null,
  rule_config_id    uuid references public.rule_configurations (id) on delete set null,
  check_type        text check (check_type in ('pre_publish', 'actual_recorded', 'what_if_projection')),
  overall_result    text check (overall_result in ('compliant', 'warning', 'violation')),
  rule_evaluations  jsonb,
  warnings          text[],
  violations        text[],
  fatigue_score     int,
  evaluated_at_utc  timestamptz not null default now()
);
create index rule_check_results_cm_idx on public.rule_check_results (crew_member_id, evaluated_at_utc desc);

create table public.assignments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  crew_member_id      uuid not null references public.crew_members (id) on delete cascade,
  flight_schedule_id  uuid not null references public.flight_schedules (id) on delete cascade,
  role_on_flight      text check (role_on_flight in ('pic', 'sic', 'relief_pic', 'relief_sic', 'purser', 'cabin_crew', 'jumpseat')),
  assignment_status   text default 'proposed' check (assignment_status in ('proposed', 'assigned', 'confirmed', 'cancelled')),
  assigned_by_user_id uuid references auth.users (id) on delete set null,
  assigned_at_utc     timestamptz not null default now(),
  created_at_utc      timestamptz not null default now()
);
create index assignments_flight_idx on public.assignments (flight_schedule_id);
create index assignments_cm_idx on public.assignments (crew_member_id, assigned_at_utc desc);

-- Admin helper (rule editing + override permission).
create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- RLS (standard org gate).
do $$
declare t text;
begin
  foreach t in array array['crew_members', 'qualifications', 'crew_qualifications', 'duty_periods', 'rule_configurations', 'rule_check_results', 'assignments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s read" on public.%1$s for select using (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert with check (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s update" on public.%1$s for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s delete" on public.%1$s for delete using (public.is_org_member(org_id))', t);
  end loop;
end
$$;

-- Realtime on the live-changing crew tables.
alter table public.duty_periods replica identity full;
alter table public.assignments replica identity full;
alter table public.crew_qualifications replica identity full;
do $$
declare t text;
begin
  foreach t in array array['duty_periods', 'assignments', 'crew_qualifications']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
