-- AVIR Mind — Phase 8: Compliance depth + DS.AI substrate.
-- 0801: schema for airworthiness compliance (ADs, SBs, MEL, LLPs, regulatory
-- reports) and the DS.AI audit substrate (decision records, human oversight,
-- model/prompt registries, data lineage).
--
-- Two disciplines, one migration:
--   Compliance items are ENTITIES with time windows, not attributes — an AD has
--   effective/deadline dates, methods of compliance, per-aircraft status, and
--   attached evidence.
--   DS.AI: every AI decision AVIR Mind makes is auditable — model version, input
--   data hash + snapshot, prompt version, output, and the human action taken.
--   The three audit tables are APPEND-ONLY (no update/delete policy) so the
--   trail cannot be rewritten after the fact.

-- ═════════════════════════════════════════════════════════════════════════════
-- COMPLIANCE
-- ═════════════════════════════════════════════════════════════════════════════

-- ── airworthiness_directives — master catalog of ADs applicable to the fleet ──
create table public.airworthiness_directives (
  id                              uuid primary key default gen_random_uuid(),
  org_id                          uuid not null references public.orgs (id) on delete cascade,
  ad_number                       text not null,
  issuing_authority               text not null default 'faa'
                                    check (issuing_authority in ('faa','easa','uk_caa','transport_canada','casa','dgca','other')),
  ad_title                        text not null,
  ad_summary                      text,
  effective_date                  date not null,
  compliance_deadline_date        date,
  compliance_deadline_flight_hours numeric(12,2),
  compliance_deadline_cycles      int,
  applicable_aircraft_types       text[] default '{}',
  applicable_engines              text[] default '{}',
  applicable_parts                text[] default '{}',
  criticality                     text not null default 'mandatory'
                                    check (criticality in ('emergency','mandatory','recommended')),
  ad_document_url                 text,
  created_at_utc                  timestamptz not null default now(),
  unique (org_id, ad_number, issuing_authority)
);
alter table public.airworthiness_directives enable row level security;
create index ad_org_type_idx on public.airworthiness_directives (org_id, criticality, effective_date desc);
create index ad_org_deadline_idx on public.airworthiness_directives (org_id, compliance_deadline_date);

-- ── aircraft_ad_status — per-aircraft status against each applicable AD ──
create table public.aircraft_ad_status (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  aircraft_id               uuid not null references public.aircraft (id) on delete cascade,
  ad_id                     uuid not null references public.airworthiness_directives (id) on delete cascade,
  status                    text not null default 'open'
                              check (status in ('open','in_progress','complied','deferred','not_applicable')),
  compliance_method         text,
  complied_at_date          date,
  complied_at_cycles        int,
  complied_at_flight_hours  numeric(12,2),
  performed_by              text,
  documentation_reference   text,
  evidence_attachment_paths text[] default '{}',
  deferral_authority        text,
  deferral_expiry_date      date,
  notes                     text,
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now(),
  unique (org_id, aircraft_id, ad_id)
);
alter table public.aircraft_ad_status enable row level security;
create index ac_ad_status_ac_idx on public.aircraft_ad_status (org_id, aircraft_id, status);
create index ac_ad_status_ad_idx on public.aircraft_ad_status (ad_id, status);
create trigger ac_ad_status_set_updated_at before update on public.aircraft_ad_status
  for each row execute function public.set_updated_at_utc();

-- ── service_bulletins — manufacturer SBs ──
create table public.service_bulletins (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  sb_number                 text not null,
  manufacturer              text not null,
  sb_title                  text not null,
  sb_summary                text,
  issued_date               date not null,
  recommended_by_date       date,
  applicable_aircraft_types text[] default '{}',
  applicable_parts          text[] default '{}',
  classification            text not null default 'recommended'
                              check (classification in ('alert','recommended','optional','informational')),
  related_ad_id             uuid references public.airworthiness_directives (id) on delete set null,
  sb_document_url           text,
  created_at_utc            timestamptz not null default now(),
  unique (org_id, sb_number, manufacturer)
);
alter table public.service_bulletins enable row level security;
create index sb_org_class_idx on public.service_bulletins (org_id, classification, issued_date desc);

-- ── aircraft_sb_status — per-aircraft SB compliance status ──
create table public.aircraft_sb_status (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  aircraft_id               uuid not null references public.aircraft (id) on delete cascade,
  sb_id                     uuid not null references public.service_bulletins (id) on delete cascade,
  status                    text not null default 'open'
                              check (status in ('open','in_progress','complied','deferred','not_applicable')),
  compliance_method         text,
  complied_at_date          date,
  complied_at_cycles        int,
  complied_at_flight_hours  numeric(12,2),
  performed_by              text,
  documentation_reference   text,
  evidence_attachment_paths text[] default '{}',
  deferral_authority        text,
  deferral_expiry_date      date,
  notes                     text,
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now(),
  unique (org_id, aircraft_id, sb_id)
);
alter table public.aircraft_sb_status enable row level security;
create index ac_sb_status_ac_idx on public.aircraft_sb_status (org_id, aircraft_id, status);
create trigger ac_sb_status_set_updated_at before update on public.aircraft_sb_status
  for each row execute function public.set_updated_at_utc();

-- ── mel_catalog — master MEL items per aircraft type (from MMEL + operator MEL) ──
create table public.mel_catalog (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  aircraft_type         text not null,
  mel_item_number       text not null,
  ata_chapter           text,
  system_name           text not null,
  item_description      text not null,
  category              text not null check (category in ('a','b','c','d')),
  repair_interval_days  int,
  number_installed      int,
  number_required       int,
  operational_procedure text,
  maintenance_procedure text,
  placard_required      boolean not null default true,
  created_at_utc        timestamptz not null default now(),
  unique (org_id, aircraft_type, mel_item_number)
);
alter table public.mel_catalog enable row level security;
create index mel_catalog_type_idx on public.mel_catalog (org_id, aircraft_type, ata_chapter);

-- ── aircraft_mel_items — deferred items on specific aircraft ──
create table public.aircraft_mel_items (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  aircraft_id           uuid not null references public.aircraft (id) on delete cascade,
  mel_catalog_id        uuid not null references public.mel_catalog (id) on delete cascade,
  deferred_at_utc       timestamptz not null default now(),
  deferred_by_user_id   uuid references auth.users (id) on delete set null,
  reason                text,
  repair_by_date        date not null,
  status                text not null default 'open'
                          check (status in ('open','rectified','extended','expired')),
  rectified_at_utc      timestamptz,
  extension_authority   text,
  extension_new_due_date date,
  placard_installed     boolean not null default false,
  linked_task_id        uuid references public.tasks (id) on delete set null,
  created_at_utc        timestamptz not null default now(),
  updated_at_utc        timestamptz not null default now()
);
alter table public.aircraft_mel_items enable row level security;
create index ac_mel_ac_idx on public.aircraft_mel_items (org_id, aircraft_id, status);
create index ac_mel_due_idx on public.aircraft_mel_items (org_id, status, repair_by_date);
create trigger ac_mel_set_updated_at before update on public.aircraft_mel_items
  for each row execute function public.set_updated_at_utc();

-- ── life_limited_parts — parts with hard life limits. remaining & percentage_used
--    are generated from current_value so they can never drift out of sync. ──
create table public.life_limited_parts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  component_id      uuid not null references public.components (id) on delete cascade,
  life_limit_type   text not null check (life_limit_type in ('cycles','flight_hours','calendar_time')),
  life_limit_value  numeric(12,2) not null,
  current_value     numeric(12,2) not null default 0,
  remaining         numeric(12,2) generated always as (life_limit_value - current_value) stored,
  percentage_used   numeric(6,2) generated always as (
                      case when life_limit_value > 0 then round((current_value / life_limit_value) * 100, 2) else 0 end
                    ) stored,
  criticality       text not null check (criticality in ('safety_critical','regulatory_required','operator_policy')),
  source_document   text,
  created_at_utc    timestamptz not null default now(),
  updated_at_utc    timestamptz not null default now()
);
alter table public.life_limited_parts enable row level security;
create index llp_org_component_idx on public.life_limited_parts (org_id, component_id);
create index llp_org_remaining_idx on public.life_limited_parts (org_id, remaining);
create trigger llp_set_updated_at before update on public.life_limited_parts
  for each row execute function public.set_updated_at_utc();

-- ── regulatory_reports — reports the operator has filed or must file ──
create table public.regulatory_reports (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  report_type        text not null check (report_type in ('mor','msr','sms_incident','srr','quality_audit','other')),
  issuing_regulator  text,
  report_reference   text,
  filed_at_date      date,
  filed_by_user_id   uuid references auth.users (id) on delete set null,
  linked_event_id    text,
  report_summary     text,
  status             text not null default 'draft' check (status in ('draft','filed','acknowledged','closed')),
  documentation_paths text[] default '{}',
  follow_up_actions  jsonb default '[]'::jsonb,
  created_at_utc     timestamptz not null default now(),
  updated_at_utc     timestamptz not null default now()
);
alter table public.regulatory_reports enable row level security;
create index reg_reports_org_idx on public.regulatory_reports (org_id, status, filed_at_date desc);
create trigger reg_reports_set_updated_at before update on public.regulatory_reports
  for each row execute function public.set_updated_at_utc();

-- ═════════════════════════════════════════════════════════════════════════════
-- DS.AI SUBSTRATE
-- ═════════════════════════════════════════════════════════════════════════════

-- ── model_versions — global registry of every LLM version AVIR uses ──
create table public.model_versions (
  id                   uuid primary key default gen_random_uuid(),
  model_identifier     text unique not null,
  provider             text not null,
  version_number       text,
  released_at_utc      timestamptz,
  deployed_from_utc    timestamptz not null default now(),
  deployed_to_utc      timestamptz,
  deployment_notes     text,
  performance_baseline jsonb,
  known_limitations    text[] default '{}',
  created_at_utc       timestamptz not null default now()
);
alter table public.model_versions enable row level security;

-- ── prompt_versions — global registry of every prompt template version ──
create table public.prompt_versions (
  id                          uuid primary key default gen_random_uuid(),
  prompt_template_identifier  text not null,
  prompt_template_hash        text not null unique,
  version_number              int not null,
  prompt_content_full         text not null,
  deployed_from_utc           timestamptz not null default now(),
  deployed_to_utc             timestamptz,
  change_summary              text,
  created_at_utc              timestamptz not null default now()
);
alter table public.prompt_versions enable row level security;
create index prompt_versions_ident_idx on public.prompt_versions (prompt_template_identifier, version_number);

-- ── ai_decision_records — every AI-driven decision (APPEND-ONLY) ──
create table public.ai_decision_records (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  decision_type           text not null check (decision_type in (
                            'signal_generation','prediction_generation','task_auto_creation',
                            'recommendation','override_evaluation','priority_ranking','insight_synthesis')),
  decision_context        text,
  input_context_hash      text not null,
  input_context_summary   jsonb,
  model_identifier        text not null,
  model_version_metadata  jsonb,
  prompt_template_hash    text,
  output_content          jsonb,
  output_confidence       text check (output_confidence in ('high','medium','low','insufficient_data')),
  explainability_data     jsonb,
  linked_signal_id        uuid references public.signals (id) on delete set null,
  linked_task_id          uuid references public.tasks (id) on delete set null,
  decision_at_utc         timestamptz not null default now(),
  created_at_utc          timestamptz not null default now()
);
alter table public.ai_decision_records enable row level security;
create index adr_org_type_time_idx on public.ai_decision_records (org_id, decision_type, decision_at_utc desc);
create index adr_model_time_idx on public.ai_decision_records (model_identifier, decision_at_utc desc);
create index adr_input_hash_idx on public.ai_decision_records (input_context_hash);
create index adr_signal_idx on public.ai_decision_records (linked_signal_id);
create index adr_task_idx on public.ai_decision_records (linked_task_id);

-- ── human_oversight_events — every human interaction with an AI decision (APPEND-ONLY) ──
create table public.human_oversight_events (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  ai_decision_record_id    uuid not null references public.ai_decision_records (id) on delete cascade,
  oversight_type           text not null check (oversight_type in (
                             'reviewed','accepted','dismissed','corrected','overridden','escalated')),
  oversight_action_detail  jsonb,
  reviewing_user_id        uuid not null,
  reviewer_role            text,
  reviewing_notes          text,
  outcome_recorded_at_utc  timestamptz,
  outcome_matched_ai       boolean,
  created_at_utc           timestamptz not null default now()
);
alter table public.human_oversight_events enable row level security;
create index hoe_org_idx on public.human_oversight_events (org_id, created_at_utc desc);
create index hoe_decision_idx on public.human_oversight_events (ai_decision_record_id);

-- ── data_lineage_records — prove where AI decision inputs came from (APPEND-ONLY) ──
create table public.data_lineage_records (
  id                       uuid primary key default gen_random_uuid(),
  ai_decision_record_id    uuid not null references public.ai_decision_records (id) on delete cascade,
  source_table             text not null,
  source_row_id            uuid not null,
  source_data_snapshot     jsonb,
  source_data_generated_by text,
  created_at_utc           timestamptz not null default now()
);
alter table public.data_lineage_records enable row level security;
create index lineage_decision_idx on public.data_lineage_records (ai_decision_record_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════

-- Org-scoped tables: standard member read + member/admin write.
do $$
declare t text;
begin
  foreach t in array array[
    'airworthiness_directives','aircraft_ad_status','service_bulletins','aircraft_sb_status',
    'mel_catalog','aircraft_mel_items','life_limited_parts','regulatory_reports'
  ] loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id));', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_member(org_id));', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_member(org_id));', t||'_del', t);
  end loop;
end $$;

-- Global registries: any authenticated user may read; writes go through
-- service_role / SECURITY DEFINER seeders only (no member insert policy needed).
create policy model_versions_sel on public.model_versions for select using (auth.role() = 'authenticated');
create policy prompt_versions_sel on public.prompt_versions for select using (auth.role() = 'authenticated');

-- DS.AI audit trail: append-only. Members may READ their org's records; INSERT is
-- allowed for org members (the capture triggers run SECURITY DEFINER regardless),
-- but there is deliberately NO update or delete policy — the trail is immutable.
create policy adr_sel on public.ai_decision_records for select using (public.is_org_member(org_id));
create policy adr_ins on public.ai_decision_records for insert with check (public.is_org_member(org_id));

create policy hoe_sel on public.human_oversight_events for select using (public.is_org_member(org_id));
create policy hoe_ins on public.human_oversight_events for insert with check (public.is_org_member(org_id));

-- data_lineage has no org_id; scope through its parent decision record.
create policy lineage_sel on public.data_lineage_records for select using (
  exists (select 1 from public.ai_decision_records r where r.id = ai_decision_record_id and public.is_org_member(r.org_id)));
create policy lineage_ins on public.data_lineage_records for insert with check (
  exists (select 1 from public.ai_decision_records r where r.id = ai_decision_record_id and public.is_org_member(r.org_id)));

-- ═════════════════════════════════════════════════════════════════════════════
-- Realtime — compliance status changes + the live AI decision trail.
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.aircraft_ad_status replica identity full;
alter table public.aircraft_mel_items replica identity full;
alter table public.life_limited_parts replica identity full;

do $$
declare t text;
begin
  foreach t in array array['aircraft_ad_status','aircraft_sb_status','aircraft_mel_items','life_limited_parts','ai_decision_records','human_oversight_events'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
