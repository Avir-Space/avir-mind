-- AVIR Mind — Phase 10: Simulation Engine + Shadow-mode Backtest.
-- 1001: schema. Replays a prospect's historical operational data through AVIR
-- and produces a "would-have-caught" report — the primary sales artifact.
--
-- Three theses:
--   Every AVIR decision is replayable (Phase 8's input_context_hash makes any
--     decision reconstructable from history).
--   Historical operational data is heterogeneous — ingestion is robust to format
--     variation without bespoke per-customer engineering.
--   The backtest report is a sales artifact — structurally auditable, and it
--     leads naturally to a full continuous deployment.

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_projects — a named simulation (many per sales opportunity).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_projects (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.orgs (id) on delete cascade,
  project_name                text not null,
  customer_organization_name  text,
  purpose                     text check (purpose in ('sales_demo','customer_evaluation','internal_validation','calibration_check')),
  status                      text not null default 'draft'
                                check (status in ('draft','ingesting','ready_to_run','running','complete','failed','archived')),
  data_period_start           date,
  data_period_end             date,
  created_by_user_id          uuid references auth.users (id) on delete set null,
  notes                       text,
  created_at_utc              timestamptz not null default now(),
  updated_at_utc              timestamptz not null default now()
);
alter table public.backtest_projects enable row level security;
create index bt_proj_org_idx on public.backtest_projects (org_id, created_at_utc desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_data_sources — each historical ingestion.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_data_sources (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  backtest_project_id   uuid not null references public.backtest_projects (id) on delete cascade,
  source_type           text not null check (source_type in (
                          'csv_aircraft_events','csv_component_events','csv_flights','csv_maintenance',
                          'json_amos_export','json_trax_export','json_sap_export','json_custom','csv_custom')),
  source_file_name      text not null,
  source_file_size_bytes bigint,
  source_storage_path   text not null,
  rows_ingested         int,
  ingestion_errors      jsonb,
  ingested_at_utc       timestamptz,
  created_at_utc        timestamptz not null default now()
);
alter table public.backtest_data_sources enable row level security;
create index bt_src_proj_idx on public.backtest_data_sources (backtest_project_id, created_at_utc desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_reconstructed_states — operational state at each point in history.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_reconstructed_states (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.orgs (id) on delete cascade,
  backtest_project_id         uuid not null references public.backtest_projects (id) on delete cascade,
  entity_type                 text not null check (entity_type in ('aircraft','component','task','crew','flight')),
  entity_external_id          text not null,
  reconstruction_timestamp_utc timestamptz not null,
  state_snapshot              jsonb not null,
  state_hash                  text not null,
  source_data_source_ids      uuid[] default '{}',
  created_at_utc              timestamptz not null default now()
);
alter table public.backtest_reconstructed_states enable row level security;
create index bt_state_proj_idx on public.backtest_reconstructed_states (backtest_project_id, entity_type, reconstruction_timestamp_utc);

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_actual_events — what actually happened in the window.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_actual_events (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  backtest_project_id       uuid not null references public.backtest_projects (id) on delete cascade,
  actual_event_type         text not null,
  actual_event_time_utc     timestamptz not null,
  entity_external_id        text not null,
  event_description         text,
  severity_at_occurrence    text,
  was_predictable_in_hindsight boolean,
  source_data_source_id     uuid references public.backtest_data_sources (id) on delete set null,
  created_at_utc            timestamptz not null default now()
);
alter table public.backtest_actual_events enable row level security;
create index bt_actual_proj_idx on public.backtest_actual_events (backtest_project_id, actual_event_time_utc);

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_simulated_signals — signals AVIR would have generated.
-- FK to actual_events added after that table exists (above) — order is fine.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_simulated_signals (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  backtest_project_id       uuid not null references public.backtest_projects (id) on delete cascade,
  simulated_signal_class    text check (simulated_signal_class in ('observation','prediction','insufficient_data')),
  simulated_signal_category text not null,
  simulated_severity        text,
  simulated_confidence      text,
  would_have_fired_at_utc   timestamptz not null,
  entity_external_id        text,
  title                     text,
  narrative                 text,
  recommendation            text,
  evidence_refs             jsonb,
  input_context_hash        text not null,
  model_identifier          text,
  prompt_template_hash      text,
  matched_actual_event_id   uuid references public.backtest_actual_events (id) on delete set null,
  match_confidence          text check (match_confidence in ('exact','likely','uncertain','no_match')),
  match_lead_time_days      int,
  created_at_utc            timestamptz not null default now()
);
alter table public.backtest_simulated_signals enable row level security;
create index bt_sim_proj_time_idx on public.backtest_simulated_signals (backtest_project_id, would_have_fired_at_utc);
create index bt_sim_proj_match_idx on public.backtest_simulated_signals (backtest_project_id, matched_actual_event_id);
create index bt_sim_proj_cat_idx on public.backtest_simulated_signals (backtest_project_id, simulated_signal_category);

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_runs — each execution.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_runs (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  backtest_project_id       uuid not null references public.backtest_projects (id) on delete cascade,
  run_type                  text check (run_type in ('full_replay','partial_replay','category_replay')),
  started_at_utc            timestamptz not null default now(),
  completed_at_utc          timestamptz,
  status                    text check (status in ('running','complete','failed')) default 'running',
  signals_generated_count   int default 0,
  actual_events_matched_count int default 0,
  total_input_tokens        int,
  total_output_tokens       int,
  total_cost_usd            numeric(10,4),
  error_summary             text,
  created_at_utc            timestamptz not null default now()
);
alter table public.backtest_runs enable row level security;
create index bt_run_proj_idx on public.backtest_runs (backtest_project_id, started_at_utc desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- backtest_reports — generated reports.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.backtest_reports (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  backtest_project_id   uuid not null references public.backtest_projects (id) on delete cascade,
  report_type           text check (report_type in ('executive_summary','full_technical','category_deep_dive','prediction_lead_time')),
  generated_at_utc      timestamptz not null default now(),
  generated_by_user_id  uuid references auth.users (id) on delete set null,
  summary_stats         jsonb,
  narrative             jsonb,
  storage_path_pdf      text,
  storage_path_json     text,
  content_hash          text not null,
  shared_with           jsonb default '[]',
  created_at_utc        timestamptz not null default now()
);
alter table public.backtest_reports enable row level security;
create index bt_report_proj_idx on public.backtest_reports (backtest_project_id, generated_at_utc desc);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS — everything org-scoped (child tables carry org_id too, so is_org_member
-- gates them directly).
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'backtest_projects','backtest_data_sources','backtest_reconstructed_states',
    'backtest_actual_events','backtest_simulated_signals','backtest_runs','backtest_reports'
  ] loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id));', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_member(org_id));', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_member(org_id));', t||'_del', t);
  end loop;
end $$;

-- Realtime — runs + projects (progress is user-visible).
alter table public.backtest_runs replica identity full;
alter table public.backtest_projects replica identity full;
do $$
declare t text;
begin
  foreach t in array array['backtest_runs','backtest_projects'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Storage — uploaded source files under `<org_id>/<project_id>/<filename>`.
-- ═════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('backtests', 'backtests', false)
on conflict (id) do nothing;

create policy "backtests readable by org members" on storage.objects for select
  using (bucket_id = 'backtests' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "backtests insertable by org members" on storage.objects for insert
  with check (bucket_id = 'backtests' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "backtests deletable by org members" on storage.objects for delete
  using (bucket_id = 'backtests' and public.is_org_member(((storage.foldername(name))[1])::uuid));
