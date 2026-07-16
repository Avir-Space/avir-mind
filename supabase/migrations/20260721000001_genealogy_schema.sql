-- Phase 4 — Component Genealogy Vault.
-- Genealogy is per manufacturer-serial (durable), independent of component_id
-- (an AVIR accounting artifact). genealogy_records is an append-only, hash-
-- chained ledger. The (manufacturer, part_number, serial_number) identity is
-- the key the cross-tenant network will match on later.

create table public.serial_genealogies (
  id                        uuid primary key default gen_random_uuid(),
  manufacturer              text not null,
  part_number               text not null,
  serial_number             text not null,
  component_type            text not null,
  birth_certificate_date    date,
  birth_manufacturer_facility text,
  birth_certificate_reference text,
  current_owner_org_id      uuid references public.orgs (id) on delete set null,
  current_component_id      uuid references public.components (id) on delete set null,
  lifetime_cycles           int default 0,
  lifetime_flight_hours     numeric(12,2) default 0,
  total_installations       int default 0,
  total_overhauls           int default 0,
  total_findings            int default 0,
  last_verified_at_utc      timestamptz,
  verification_state        text not null default 'unverified'
                              check (verification_state in ('unverified', 'tenant_verified', 'cross_verified')),
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now(),
  unique (manufacturer, part_number, serial_number)
);

create index serial_genealogies_pn_idx on public.serial_genealogies (manufacturer, part_number);
create index serial_genealogies_owner_idx on public.serial_genealogies (current_owner_org_id);
create index serial_genealogies_serial_idx on public.serial_genealogies (serial_number);

create table public.genealogy_records (
  id                     uuid primary key default gen_random_uuid(),
  serial_genealogy_id    uuid not null references public.serial_genealogies (id) on delete cascade,
  record_type            text not null check (record_type in (
                           'birth_certificate', 'installation', 'removal', 'overhaul', 'repair', 'finding',
                           'cycle_snapshot', 'hours_snapshot', 'ownership_transfer', 'documentation_upload',
                           'incident', 'warranty_claim', 'return_to_service', 'sale', 'lease')),
  record_date_utc        date not null,
  source_org_id          uuid references public.orgs (id) on delete set null,
  source_component_event_id uuid references public.component_events (id) on delete set null,
  source_component_id    uuid references public.components (id) on delete set null,
  source_aircraft_id     uuid references public.aircraft (id) on delete set null,
  record_payload         jsonb not null,
  attachments            jsonb default '[]'::jsonb,
  content_hash           text not null,
  previous_record_hash   text,
  record_seq             int not null default 0,   -- per-serial chain index (Phase 4 addition; robust chaining)
  confidence             text not null default 'self_reported'
                           check (confidence in ('verified', 'self_reported', 'inferred')),
  verification_source    text,
  created_at_utc         timestamptz not null default now()
);

create index genealogy_records_serial_idx on public.genealogy_records (serial_genealogy_id, record_date_utc desc);
create index genealogy_records_serial_seq_idx on public.genealogy_records (serial_genealogy_id, record_seq);
create index genealogy_records_source_idx on public.genealogy_records (source_org_id, record_date_utc desc);
create index genealogy_records_type_idx on public.genealogy_records (record_type, record_date_utc desc);

create table public.genealogy_ownership_history (
  id                        uuid primary key default gen_random_uuid(),
  serial_genealogy_id       uuid not null references public.serial_genealogies (id) on delete cascade,
  from_org_id               uuid references public.orgs (id) on delete set null,
  to_org_id                 uuid not null references public.orgs (id) on delete cascade,
  transfer_type             text check (transfer_type in ('initial_ownership', 'sale', 'lease',
                              'return_from_lease', 'transfer_within_group', 'warranty_return')),
  transfer_date_utc         date not null,
  transfer_reference        text,
  transfer_documentation_refs jsonb default '[]'::jsonb,
  created_at_utc            timestamptz not null default now()
);

create index genealogy_ownership_serial_idx on public.genealogy_ownership_history (serial_genealogy_id, transfer_date_utc desc);

create table public.genealogy_exports (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs (id) on delete cascade,
  serial_genealogy_id    uuid not null references public.serial_genealogies (id) on delete cascade,
  exported_by_user_id    uuid not null references auth.users (id) on delete cascade,
  export_format          text check (export_format in ('pdf', 'json', 'portable_bundle')),
  export_purpose         text,
  export_recipient       text,
  export_snapshot_hash   text not null,
  export_downloaded_at_utc timestamptz,
  created_at_utc         timestamptz not null default now()
);

create index genealogy_exports_org_idx on public.genealogy_exports (org_id, created_at_utc desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.serial_genealogies enable row level security;
alter table public.genealogy_records enable row level security;
alter table public.genealogy_ownership_history enable row level security;
alter table public.genealogy_exports enable row level security;

-- serial_genealogies: readable by current owner OR any org in its ownership history.
create policy "serial_genealogies readable by owner or historical owner"
  on public.serial_genealogies for select using (
    (current_owner_org_id is not null and public.is_org_member(current_owner_org_id))
    or exists (
      select 1 from public.genealogy_ownership_history h
      where h.serial_genealogy_id = id
        and (public.is_org_member(h.to_org_id) or (h.from_org_id is not null and public.is_org_member(h.from_org_id)))
    )
  );
-- Writes only via SECURITY DEFINER functions (trigger, transfer RPC) — no user policy.

-- genealogy_records: readable if you contributed it OR you currently own the serial.
create policy "genealogy_records readable by contributor or owner"
  on public.genealogy_records for select using (
    (source_org_id is not null and public.is_org_member(source_org_id))
    or exists (
      select 1 from public.serial_genealogies sg
      where sg.id = serial_genealogy_id
        and sg.current_owner_org_id is not null and public.is_org_member(sg.current_owner_org_id)
    )
  );
-- Append-only ledger: explicitly block all user UPDATE/DELETE. (The verify RPC
-- is SECURITY DEFINER and is the only sanctioned confidence mutation.)
create policy "genealogy_records no update" on public.genealogy_records for update using (false) with check (false);
create policy "genealogy_records no delete" on public.genealogy_records for delete using (false);

create policy "genealogy_ownership readable within involved orgs"
  on public.genealogy_ownership_history for select using (
    public.is_org_member(to_org_id) or (from_org_id is not null and public.is_org_member(from_org_id))
  );

create policy "genealogy_exports visible within org" on public.genealogy_exports for select using (public.is_org_member(org_id));
create policy "genealogy_exports insertable within org" on public.genealogy_exports for insert with check (public.is_org_member(org_id));

-- Realtime for the ledger (append-only inserts).
alter table public.genealogy_records replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'genealogy_records') then
    alter publication supabase_realtime add table public.genealogy_records;
  end if;
end
$$;
