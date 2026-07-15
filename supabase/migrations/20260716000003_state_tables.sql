-- 0003: live state, state history, and audit trail
-- These encode AVIR's data-trust model: every state carries a source and a
-- confidence, and every transition is appended to an immutable history.

-- ─────────────────────────────────────────────────────────────────────────────
-- aircraft_state — one live row per aircraft (PK == FK to aircraft).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.aircraft_state (
  aircraft_id        uuid primary key references public.aircraft (id) on delete cascade,
  state              text not null default 'unknown'
                       check (state in ('under_maintenance', 'in_air', 'on_ground', 'stationed', 'unknown')),
  state_source       text not null default 'manual'
                       check (state_source in ('telemetry', 'ops_system', 'manual')),
  state_confidence   text not null default 'low'
                       check (state_confidence in ('high', 'medium', 'low')),
  current_station    text,
  last_transition_at timestamptz,
  next_event_at      timestamptz,
  next_event_type    text,
  updated_at         timestamptz not null default now()
);
alter table public.aircraft_state enable row level security;
create trigger aircraft_state_set_updated_at
  before update on public.aircraft_state
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- aircraft_state_history — append-only log of state transitions.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.aircraft_state_history (
  id              uuid primary key default gen_random_uuid(),
  aircraft_id     uuid not null references public.aircraft (id) on delete cascade,
  org_id          uuid not null references public.orgs (id) on delete cascade,
  state           text not null,
  previous_state  text,
  state_source    text,
  transitioned_at timestamptz not null default now(),
  note            text,
  created_at      timestamptz not null default now()
);
alter table public.aircraft_state_history enable row level security;
create index aircraft_state_history_aircraft_id_idx
  on public.aircraft_state_history (aircraft_id, transitioned_at desc);
create index aircraft_state_history_org_id_idx
  on public.aircraft_state_history (org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- audit_events — generic audit trail across the product.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  entity_type   text not null,
  entity_id     uuid,
  event_type    text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.audit_events enable row level security;
create index audit_events_org_id_idx on public.audit_events (org_id, created_at desc);
