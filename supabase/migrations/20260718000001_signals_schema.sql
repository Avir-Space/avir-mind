-- AVIR Mind — Phase 2: Signals Engine (real Claude-powered AI)
-- 0201: signals, signal_actions, signal_generation_runs
--
-- Distinction: a TASK is a commitment to do work; a SIGNAL is an AI observation
-- or recommendation about an aircraft that MAY become a task. Two theses:
--   1. Grounded — every signal carries evidence_refs pointing to real data;
--      "insufficient_data" is a valid signal type (Mind refuses to hallucinate).
--   2. Calibrated — signal_actions track outcomes (acted on / dismissed / right
--      or wrong), the record Phase 9 publishes as the moat.
--
-- Note on generation_context_hash: stored on both signals (provenance) and
-- signal_generation_runs (the 6-hour cache lookup). It is NOT unique on signals
-- because one run legitimately produces several signals sharing one input hash;
-- dedup/caching is enforced at the run level.

-- ─────────────────────────────────────────────────────────────────────────────
-- signals
-- ─────────────────────────────────────────────────────────────────────────────
create table public.signals (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  aircraft_id               uuid references public.aircraft (id) on delete cascade,  -- null = fleet-wide
  category                  text not null,  -- task parent_types + fleet_pattern / cross_module / insufficient_data
  severity                  text not null
                              check (severity in ('critical', 'high', 'medium', 'low', 'info', 'insufficient_data')),
  title                     text not null,
  narrative                 text not null,
  recommendation            text,           -- null for insufficient_data
  confidence                text not null check (confidence in ('high', 'medium', 'low')),
  confidence_reasoning      text not null,
  evidence_refs             jsonb not null default '{}'::jsonb,
  suggested_actions         jsonb default '[]'::jsonb,
  is_active                 boolean not null default true,
  superseded_by_signal_id   uuid references public.signals (id) on delete set null,
  resolved_at_utc           timestamptz,
  resolution_note           text,
  generated_at_utc          timestamptz not null default now(),
  generated_by_model        text not null,
  generation_context_hash   text not null,
  input_tokens              int,
  output_tokens             int,
  generation_ms             int,
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now()
);
alter table public.signals enable row level security;

create index signals_org_aircraft_active_idx on public.signals (org_id, aircraft_id, is_active);
create index signals_org_severity_active_idx on public.signals (org_id, severity) where is_active;
create index signals_context_hash_idx on public.signals (generation_context_hash);

create trigger signals_set_updated_at
  before update on public.signals
  for each row execute function public.set_updated_at_utc();

-- ─────────────────────────────────────────────────────────────────────────────
-- signal_actions — the calibration record.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.signal_actions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  signal_id       uuid not null references public.signals (id) on delete cascade,
  action_type     text not null check (action_type in (
                    'viewed', 'acknowledged', 'create_task', 'dismissed',
                    'what_if_explored', 'marked_incorrect', 'marked_correct')),
  action_payload  jsonb default '{}'::jsonb,
  outcome_task_id uuid references public.tasks (id) on delete set null,
  dismissal_reason text,
  actor_user_id   uuid not null references auth.users (id) on delete cascade,
  created_at_utc  timestamptz not null default now()
);
alter table public.signal_actions enable row level security;
create index signal_actions_signal_idx on public.signal_actions (signal_id, created_at_utc desc);
create index signal_actions_org_actor_idx on public.signal_actions (org_id, actor_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- signal_generation_runs — observability for AI operations.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.signal_generation_runs (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  aircraft_id             uuid references public.aircraft (id) on delete cascade,
  run_type                text check (run_type in ('scheduled', 'manual', 'triggered_by_event')),
  trigger_reference       text,
  generation_context_hash text,   -- added for the 6-hour cache lookup (see header)
  signals_generated       int default 0,
  signals_suppressed      int default 0,
  model_used              text,
  input_tokens            int,
  output_tokens           int,
  total_cost_usd          numeric(10, 4),
  duration_ms             int,
  error                   text,
  status                  text check (status in ('started', 'completed', 'failed')) default 'started',
  started_at_utc          timestamptz not null default now(),
  completed_at_utc        timestamptz
);
alter table public.signal_generation_runs enable row level security;
create index sig_runs_org_aircraft_idx on public.signal_generation_runs (org_id, aircraft_id, started_at_utc desc);
create index sig_runs_hash_idx on public.signal_generation_runs (org_id, generation_context_hash, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — org-scoped on all three.
-- ─────────────────────────────────────────────────────────────────────────────
create policy "signals visible within org" on public.signals for select using (public.is_org_member(org_id));
create policy "signals insertable within org" on public.signals for insert with check (public.is_org_member(org_id));
create policy "signals updatable within org" on public.signals for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "signals deletable within org" on public.signals for delete using (public.is_org_member(org_id));

create policy "signal_actions visible within org" on public.signal_actions for select using (public.is_org_member(org_id));
create policy "signal_actions insertable within org" on public.signal_actions for insert
  with check (public.is_org_member(org_id) and actor_user_id = auth.uid());

create policy "sig_runs visible within org" on public.signal_generation_runs for select using (public.is_org_member(org_id));
create policy "sig_runs insertable within org" on public.signal_generation_runs for insert with check (public.is_org_member(org_id));
create policy "sig_runs updatable within org" on public.signal_generation_runs for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime — signals (INSERT/UPDATE), signal_generation_runs (INSERT/UPDATE),
-- signal_actions (INSERT).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.signals replica identity full;
alter table public.signal_generation_runs replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='signals') then
    alter publication supabase_realtime add table public.signals;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='signal_generation_runs') then
    alter publication supabase_realtime add table public.signal_generation_runs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='signal_actions') then
    alter publication supabase_realtime add table public.signal_actions;
  end if;
end
$$;
