-- Phase 5 — Inventory + Assets. Parts are first-class entities; assets follow a
-- lifecycle. Both tie into the operational intelligence Mind already has.

create table public.parts (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  part_number               text not null,
  manufacturer              text not null,
  description               text not null,
  category                  text check (category in ('rotable', 'expendable', 'consumable', 'tooling', 'ground_support', 'chemical', 'other')),
  unit_of_measure           text not null,
  shelf_life_days           int,
  storage_conditions        text,
  hazmat_class              text,
  ata_chapter               text,
  compatible_aircraft_types text[],
  compatible_component_types text[],
  alternative_part_numbers  text[],
  current_price_usd         numeric(12,2),
  typical_lead_time_days    int,
  criticality               text check (criticality in ('rotational', 'safety_critical', 'ao_g_critical', 'standard', 'low')),
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now(),
  unique (org_id, part_number, manufacturer)
);
create index parts_category_idx on public.parts (org_id, category);
create index parts_criticality_idx on public.parts (org_id, criticality);
create index parts_pn_idx on public.parts (org_id, part_number);

create table public.stock_locations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  location_code       text not null,
  location_name       text not null,
  location_type       text check (location_type in ('main_warehouse', 'station_stock', 'aircraft_kit', 'mro_shop', 'external_consignment')),
  station_code        text,
  storage_capacity_m3 numeric(12,2),
  climate_controlled  boolean default false,
  hazmat_certified    boolean default false,
  is_active           boolean default true,
  created_at_utc      timestamptz not null default now(),
  updated_at_utc      timestamptz not null default now(),
  unique (org_id, location_code)
);

create table public.stock_holdings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  part_id             uuid not null references public.parts (id) on delete cascade,
  location_id         uuid not null references public.stock_locations (id) on delete cascade,
  quantity_available  int not null default 0,
  quantity_reserved   int not null default 0,
  quantity_in_transit int not null default 0,
  reorder_point       int,
  max_stock_level     int,
  last_received_at_utc timestamptz,
  last_consumed_at_utc timestamptz,
  created_at_utc      timestamptz not null default now(),
  updated_at_utc      timestamptz not null default now(),
  unique (org_id, part_id, location_id)
);
create index stock_holdings_part_idx on public.stock_holdings (org_id, part_id);
create index stock_holdings_location_idx on public.stock_holdings (org_id, location_id);
create index stock_holdings_lowstock_idx on public.stock_holdings (org_id, part_id) where quantity_available <= reorder_point;

create table public.stock_movements (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  part_id                  uuid not null references public.parts (id) on delete cascade,
  from_location_id         uuid references public.stock_locations (id) on delete set null,
  to_location_id           uuid references public.stock_locations (id) on delete set null,
  movement_type            text check (movement_type in ('receipt', 'issue', 'transfer', 'adjustment', 'reservation', 'unreservation', 'consumption', 'return', 'scrap')),
  quantity                 int not null,
  linked_task_id           uuid references public.tasks (id) on delete set null,
  linked_component_event_id uuid references public.component_events (id) on delete set null,
  reference_number         text,
  unit_cost_usd            numeric(12,2),
  performed_by_user_id     uuid references auth.users (id) on delete set null,
  notes                    text,
  movement_date_utc        timestamptz not null default now(),
  created_at_utc           timestamptz not null default now()
);
create index stock_movements_part_idx on public.stock_movements (org_id, part_id, movement_date_utc desc);
create index stock_movements_org_idx on public.stock_movements (org_id, movement_date_utc desc);

create table public.suppliers (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs (id) on delete cascade,
  supplier_name          text not null,
  supplier_code          text,
  supplier_type          text check (supplier_type in ('oem', 'distributor', 'mro', 'broker', 'other')),
  approved_status        text default 'approved' check (approved_status in ('approved', 'approved_with_conditions', 'under_review', 'suspended')),
  primary_contact_name   text,
  primary_contact_email  text,
  primary_contact_phone  text,
  typical_lead_time_days int,
  performance_score      int check (performance_score between 0 and 100),
  last_order_at_utc      timestamptz,
  notes                  text,
  created_at_utc         timestamptz not null default now(),
  updated_at_utc         timestamptz not null default now()
);

create table public.supplier_parts (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs (id) on delete cascade,
  supplier_id            uuid not null references public.suppliers (id) on delete cascade,
  part_id                uuid not null references public.parts (id) on delete cascade,
  supplier_part_reference text,
  typical_lead_time_days int,
  typical_unit_price_usd numeric(12,2),
  minimum_order_quantity int default 1,
  last_ordered_at_utc    timestamptz,
  last_price_usd         numeric(12,2),
  is_preferred           boolean default false,
  created_at_utc         timestamptz not null default now(),
  unique (org_id, supplier_id, part_id)
);
create index supplier_parts_part_idx on public.supplier_parts (org_id, part_id);
create index supplier_parts_supplier_idx on public.supplier_parts (org_id, supplier_id);

create table public.assets (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  asset_tag             text not null,
  asset_name            text not null,
  asset_type            text check (asset_type in ('ground_support_equipment', 'tooling', 'calibrated_instrument', 'test_equipment', 'vehicle', 'hangar_equipment', 'other')),
  manufacturer          text,
  model                 text,
  serial_number         text,
  location_id           uuid references public.stock_locations (id) on delete set null,
  current_status        text default 'in_service' check (current_status in ('in_service', 'under_maintenance', 'out_of_service', 'retired')),
  purchased_date        date,
  purchase_cost_usd     numeric(12,2),
  calibration_required  boolean default false,
  calibration_due_date  date,
  next_service_due_date date,
  assigned_to_station   text,
  notes                 text,
  created_at_utc        timestamptz not null default now(),
  updated_at_utc        timestamptz not null default now(),
  unique (org_id, asset_tag)
);
create index assets_type_idx on public.assets (org_id, asset_type, current_status);
create index assets_cal_idx on public.assets (org_id, calibration_due_date);

create table public.asset_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  asset_id         uuid not null references public.assets (id) on delete cascade,
  event_type       text check (event_type in ('acquired', 'deployed', 'moved', 'serviced', 'calibrated', 'damaged', 'repaired', 'retired', 'incident')),
  event_date       date not null,
  performed_by     text,
  from_location_id uuid references public.stock_locations (id) on delete set null,
  to_location_id   uuid references public.stock_locations (id) on delete set null,
  cost_usd         numeric(12,2),
  documentation_reference text,
  linked_task_id   uuid references public.tasks (id) on delete set null,
  event_payload    jsonb,
  created_at_utc   timestamptz not null default now()
);
create index asset_events_asset_idx on public.asset_events (asset_id, event_date desc);

-- ── RLS (standard org gate) ──────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['parts', 'stock_locations', 'stock_holdings', 'stock_movements', 'suppliers', 'supplier_parts', 'assets', 'asset_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s read" on public.%1$s for select using (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert with check (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s update" on public.%1$s for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s delete" on public.%1$s for delete using (public.is_org_member(org_id))', t);
  end loop;
end
$$;

-- Realtime on the live-changing tables.
alter table public.stock_holdings replica identity full;
alter table public.stock_movements replica identity full;
alter table public.assets replica identity full;
do $$
declare t text;
begin
  foreach t in array array['stock_holdings', 'stock_movements', 'assets']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
