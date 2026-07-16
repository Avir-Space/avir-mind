-- AVIR Mind — Phase 1: Task & Workflow substrate
-- 0101: core task tables
--
-- Task is the atomic unit of AVIR Mind. Every downstream module (Signals,
-- Predictive Maintenance, Inventory, Crew, Compliance, Simulation) produces
-- tasks. Two theses are encoded here:
--   1. Routing  — every task carries its source-system provenance (task_sources)
--   2. Audit    — every state change appends a task_events row (nothing is lost)
--
-- RLS is enabled at creation; policies live in 0103 once helpers exist.

-- updated_at maintainer for the *_utc column convention used by task tables.
create or replace function public.set_updated_at_utc()
returns trigger
language plpgsql
as $$
begin
  new.updated_at_utc = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- task_type_catalog — global task taxonomy (reference data, not org-scoped).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_type_catalog (
  parent_type  text not null,
  sub_type     text not null,
  display_name text not null,
  sort_rank    int not null default 0,
  active       boolean not null default true,
  primary key (parent_type, sub_type)
);
alter table public.task_type_catalog enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks — the core entity.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.tasks (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  aircraft_id              uuid not null references public.aircraft (id) on delete cascade,
  title                    text not null,
  why_summary              text,
  parent_type              text not null,
  sub_type                 text not null,
  status                   text not null default 'queued'
                             check (status in ('queued', 'in_progress', 'blocked', 'monitoring', 'done')),
  risk_band                text not null default 'medium'
                             check (risk_band in ('high', 'medium', 'low')),
  dispatch_blocking        boolean not null default false,
  aog                      boolean not null default false,
  station_code             text,
  facility                 text,
  due_at_utc               timestamptz,
  started_at_utc           timestamptz,
  assignee_user_id         uuid references auth.users (id) on delete set null,
  reporter_user_id         uuid references auth.users (id) on delete set null,
  board_rank               numeric,
  pinned                   boolean not null default false,
  canonical_group_id       uuid,
  estimated_duration_hours int,
  created_at_utc           timestamptz not null default now(),
  updated_at_utc           timestamptz not null default now(),
  foreign key (parent_type, sub_type)
    references public.task_type_catalog (parent_type, sub_type)
);
alter table public.tasks enable row level security;

create index tasks_org_aircraft_idx on public.tasks (org_id, aircraft_id);
create index tasks_org_status_idx on public.tasks (org_id, status);
create index tasks_org_station_idx on public.tasks (org_id, station_code);
create index tasks_org_dispatch_blocking_idx on public.tasks (org_id)
  where dispatch_blocking = true;
create index tasks_org_aog_idx on public.tasks (org_id)
  where aog = true;
create index tasks_assignee_idx on public.tasks (org_id, assignee_user_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at_utc();

-- ─────────────────────────────────────────────────────────────────────────────
-- task_sources — provenance (the routing thesis made visible).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_sources (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references public.tasks (id) on delete cascade,
  source_system       text not null check (source_system in ('amos', 'trax', 'sap', 'fr', 'avir')),
  source_reference_id text,
  source_url          text,
  first_seen_at_utc   timestamptz not null default now(),
  last_seen_at_utc    timestamptz not null default now(),
  unique (task_id, source_system, source_reference_id)
);
alter table public.task_sources enable row level security;
create index task_sources_task_idx on public.task_sources (task_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- task_events — the audit stream.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  task_id        uuid not null references public.tasks (id) on delete cascade,
  actor_user_id  uuid references auth.users (id) on delete set null,
  event_type     text not null check (event_type in (
                   'comment', 'field_change', 'acknowledged', 'status_change',
                   'assigned', 'unassigned', 'pinned', 'unpinned', 'source_added',
                   'work_logged', 'attachment_added', 'task_created', 'task_deleted')),
  event_payload  jsonb not null default '{}'::jsonb,
  body           text,
  created_at_utc timestamptz not null default now()
);
alter table public.task_events enable row level security;
create index task_events_task_created_idx on public.task_events (task_id, created_at_utc desc);
create index task_events_org_actor_idx on public.task_events (org_id, actor_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- task_acknowledgements — which users acknowledged which tasks.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_acknowledgements (
  task_id             uuid not null references public.tasks (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  acknowledged_at_utc timestamptz not null default now(),
  primary key (task_id, user_id)
);
alter table public.task_acknowledgements enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- task_work_logs — time tracking.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_work_logs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  task_id            uuid not null references public.tasks (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  time_spent_minutes int not null,
  description        text,
  work_date          date not null,
  created_at_utc     timestamptz not null default now(),
  updated_at_utc     timestamptz not null default now()
);
alter table public.task_work_logs enable row level security;
create index task_work_logs_task_idx on public.task_work_logs (task_id);
create trigger task_work_logs_set_updated_at
  before update on public.task_work_logs
  for each row execute function public.set_updated_at_utc();

-- ─────────────────────────────────────────────────────────────────────────────
-- task_attachments — file references (Supabase Storage).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_attachments (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs (id) on delete cascade,
  task_id              uuid not null references public.tasks (id) on delete cascade,
  uploaded_by_user_id  uuid not null references auth.users (id) on delete cascade,
  filename             text not null,
  file_size_bytes      bigint not null,
  mime_type            text not null,
  storage_path         text not null,
  created_at_utc       timestamptz not null default now()
);
alter table public.task_attachments enable row level security;
create index task_attachments_task_idx on public.task_attachments (task_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- task_dependencies — blocks / depends-on graph edges.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.task_dependencies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  from_task_id    uuid not null references public.tasks (id) on delete cascade,
  to_task_id      uuid not null references public.tasks (id) on delete cascade,
  dependency_type text not null default 'blocks',
  created_at_utc  timestamptz not null default now(),
  unique (from_task_id, to_task_id),
  check (from_task_id <> to_task_id)
);
alter table public.task_dependencies enable row level security;
create index task_dependencies_from_idx on public.task_dependencies (from_task_id);
create index task_dependencies_to_idx on public.task_dependencies (to_task_id);
