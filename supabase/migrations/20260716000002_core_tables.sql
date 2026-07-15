-- 0002: core tenancy + fleet/aircraft tables
-- RLS is enabled here at creation; policies are added in 0006 once the
-- membership helper functions exist.

-- ─────────────────────────────────────────────────────────────────────────────
-- orgs — the tenant boundary. Every row of every other table hangs off an org.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan       text not null default 'free',
  created_at timestamptz not null default now()
);
alter table public.orgs enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- org_members — user ↔ org with role. Composite PK.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.org_members (
  org_id     uuid not null references public.orgs (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
alter table public.org_members enable row level security;
create index org_members_user_id_idx on public.org_members (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- fleets — logical groupings of aircraft within an org.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.fleets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs (id) on delete cascade,
  name                 text not null,
  aircraft_type_focus  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.fleets enable row level security;
create index fleets_org_id_idx on public.fleets (org_id);
create trigger fleets_set_updated_at
  before update on public.fleets
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- aircraft — the core asset.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.aircraft (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  tail_number    text not null,
  aircraft_type  text not null,
  serial_number  text,
  base_station   text,
  ownership_type text check (ownership_type in ('owned', 'leased', 'managed')),
  delivery_date  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, tail_number)
);
alter table public.aircraft enable row level security;
create index aircraft_org_id_idx on public.aircraft (org_id);
create trigger aircraft_set_updated_at
  before update on public.aircraft
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- fleet_aircraft — many-to-many between fleets and aircraft. Composite PK.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.fleet_aircraft (
  fleet_id    uuid not null references public.fleets (id) on delete cascade,
  aircraft_id uuid not null references public.aircraft (id) on delete cascade,
  primary key (fleet_id, aircraft_id)
);
alter table public.fleet_aircraft enable row level security;
create index fleet_aircraft_aircraft_id_idx on public.fleet_aircraft (aircraft_id);
