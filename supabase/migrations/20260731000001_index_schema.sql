-- AVIR Mind — Phase 14: AVIR Index (substrate + preview; publication gated).
-- 1401: schema. Marketing infrastructure — a periodically-published, credibly-
-- computed, industry-referenced number. Built to work against N tenants from the
-- day it deploys, but nothing publishes with only the 2 demo tenants.
--
-- Three theses:
--   Provenance is publication — every number carries a computation timestamp,
--     data window, methodology hash, and contributing tenant count; reproducible.
--   Corrections are versions, not edits — published numbers are immutable;
--     corrections publish as new, hash-chained versions.
--   Consent is per-category — a tenant opts in per Index category and may
--     withdraw at any time (future computations then exclude them).

-- Founder gate: the AVIR founder/admin. Pragmatically, an owner of any org
-- (the internal Index preview is AVIR-operator-only in this build).
create or replace function public._is_founder()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public._is_founder() to authenticated;

-- ── index_definitions ──
create table public.index_definitions (
  id                              uuid primary key default gen_random_uuid(),
  index_code                      text not null unique,
  index_name                      text not null,
  index_category                  text check (index_category in ('reliability','calibration','compliance','predictive_accuracy','inventory_efficiency','tat_performance','safety_indicator','industry_composite')),
  description                     text,
  methodology_document_url        text,
  computation_frequency           text not null default 'quarterly' check (computation_frequency in ('weekly','monthly','quarterly','annual')),
  minimum_participating_tenants   int not null default 5,
  minimum_signal_volume_for_category int not null default 1000,
  unit                            text,
  higher_is_better                boolean not null default true,
  is_publicly_visible             boolean not null default false,
  activation_gated                boolean not null default true,
  created_at_utc                  timestamptz not null default now()
);
alter table public.index_definitions enable row level security;

-- ── tenant_index_consent ──
create table public.tenant_index_consent (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  index_definition_id      uuid not null references public.index_definitions (id) on delete cascade,
  consent_status           text not null check (consent_status in ('granted','withdrawn','pending_review')),
  consented_by_user_id     uuid references auth.users (id) on delete set null,
  consented_at_utc         timestamptz,
  withdrawn_at_utc         timestamptz,
  withdrawal_reason        text,
  allow_named_participation boolean not null default false,
  data_visibility_scope    text not null default 'aggregate_only' check (data_visibility_scope in ('aggregate_only','category_participation_visible','full_participation_visible')),
  created_at_utc           timestamptz not null default now(),
  updated_at_utc           timestamptz not null default now(),
  unique (org_id, index_definition_id)
);
alter table public.tenant_index_consent enable row level security;
create index tic_idx_idx on public.tenant_index_consent (index_definition_id, consent_status);
create trigger tic_set_updated before update on public.tenant_index_consent for each row execute function public.set_updated_at_utc();

-- ── index_computations ──
create table public.index_computations (
  id                        uuid primary key default gen_random_uuid(),
  index_definition_id       uuid not null references public.index_definitions (id) on delete cascade,
  computation_period_start  date not null,
  computation_period_end    date not null,
  computation_started_at_utc timestamptz not null default now(),
  computation_completed_at_utc timestamptz,
  methodology_hash          text not null,
  source_data_summary       jsonb,
  computed_value            numeric(15,6) not null,
  computed_metadata         jsonb,
  confidence_interval_lower numeric(15,6),
  confidence_interval_upper numeric(15,6),
  participating_tenant_count int not null,
  meets_minimum_threshold   boolean not null,
  computation_notes         text,
  created_at_utc            timestamptz not null default now()
);
alter table public.index_computations enable row level security;
create index icomp_def_idx on public.index_computations (index_definition_id, computation_period_end desc);
create index icomp_thresh_idx on public.index_computations (meets_minimum_threshold, computation_period_end desc);

-- ── index_publications (immutable) ──
create table public.index_publications (
  id                        uuid primary key default gen_random_uuid(),
  index_definition_id       uuid not null references public.index_definitions (id) on delete cascade,
  index_computation_id      uuid not null references public.index_computations (id) on delete cascade,
  publication_version       int not null,
  headline_value            numeric(15,6) not null,
  period_label              text not null,
  period_start              date not null,
  period_end                date not null,
  headline_narrative        text not null,
  detailed_narrative        jsonb,
  methodology_reference     text,
  participating_tenant_count int not null,
  confidence_interval_lower numeric(15,6),
  confidence_interval_upper numeric(15,6),
  published_at_utc          timestamptz not null default now(),
  published_by_user_id      uuid not null,
  publication_channels      text[] default '{}',
  content_hash              text not null,
  superseded_by_publication_id uuid references public.index_publications (id) on delete set null,
  correction_notes          text,
  previous_publication_hash text,
  created_at_utc            timestamptz not null default now()
);
alter table public.index_publications enable row level security;
create index ipub_def_idx on public.index_publications (index_definition_id, published_at_utc desc);

-- ── press_releases ──
create table public.press_releases (
  id                     uuid primary key default gen_random_uuid(),
  index_publication_id   uuid references public.index_publications (id) on delete cascade,
  release_title          text not null,
  release_dateline       text,
  release_body_markdown  text not null,
  release_boilerplate    text,
  media_contact_json     jsonb,
  distribution_targets   jsonb,
  release_status         text not null default 'draft' check (release_status in ('draft','ready_for_review','approved','distributed')),
  generated_at_utc       timestamptz not null default now(),
  reviewed_by_user_id    uuid references auth.users (id) on delete set null,
  approved_at_utc        timestamptz,
  distributed_at_utc     timestamptz,
  content_hash           text not null,
  created_at_utc         timestamptz not null default now()
);
alter table public.press_releases enable row level security;

-- ── partner_embed_configurations ──
create table public.partner_embed_configurations (
  id                 uuid primary key default gen_random_uuid(),
  partner_name       text not null,
  partner_domain     text not null,
  allowed_index_codes text[] default '{}',
  embed_style        text check (embed_style in ('headline_number','trend_chart','full_dashboard','ticker')),
  embed_theme        text check (embed_theme in ('light','dark','brand_avir')),
  api_key_id         uuid references public.api_keys (id) on delete set null,
  is_active          boolean not null default true,
  traffic_stats      jsonb,
  created_at_utc     timestamptz not null default now()
);
alter table public.partner_embed_configurations enable row level security;

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Definitions: readable by all authenticated (published methodology). Writes founder-only.
create policy idef_sel on public.index_definitions for select using (auth.role() = 'authenticated');

-- Consent: a tenant manages its own org's consent rows.
create policy tic_sel on public.tenant_index_consent for select using (public.is_org_member(org_id) or public._is_founder());
create policy tic_ins on public.tenant_index_consent for insert with check (public.is_org_member(org_id));
create policy tic_upd on public.tenant_index_consent for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Computations + partner embeds + press releases: founder-only read (internal preview).
create policy icomp_sel on public.index_computations for select using (public._is_founder());
create policy pe_sel on public.partner_embed_configurations for select using (public._is_founder());
create policy pr_sel on public.press_releases for select using (public._is_founder());

-- Publications: PUBLIC read only when the definition is publicly visible; founder reads all.
-- Immutable: NO update/delete policy → once written, cannot be changed.
create policy ipub_sel on public.index_publications for select using (
  public._is_founder() or exists (select 1 from public.index_definitions d where d.id = index_definition_id and d.is_publicly_visible));
