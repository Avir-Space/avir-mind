-- AVIR Mind — Phase 9: Calibration Scoreboard.
-- 0901: schema. Elevates the accuracy data collected since Phase 3 into a
-- per-tenant, per-model, per-category, per-confidence calibration record.
--
-- Three theses:
--   Calibration is a PROPERTY, not a claim — "68% of high-confidence predictions
--     were correct over N=12,847" is provable; "AVIR is accurate" is marketing.
--   Bad calibration is DATA — publishing it transparently builds trust.
--   Two audiences — tenant-internal (full) and cross-tenant public (aggregated,
--     anonymized, suppressed below a privacy threshold).
--
-- calibration_events, calibration_publications, and PUBLISHED scoreboards are
-- append-only ledgers (no update/delete once written / published).

-- ─────────────────────────────────────────────────────────────────────────────
-- calibration_snapshots — point-in-time aggregated calibration.
-- org_id nullable so a cross_tenant scope row can live here too.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.calibration_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid references public.orgs (id) on delete cascade,
  snapshot_date         date not null,
  snapshot_scope        text not null default 'tenant' check (snapshot_scope in ('tenant','cross_tenant')),
  signal_class          text not null check (signal_class in ('observation','prediction','insufficient_data')),
  signal_category       text not null,
  confidence_level      text not null check (confidence_level in ('high','medium','low')),
  model_identifier      text,
  window_days           int not null,
  total_signals         int not null default 0,
  signals_with_outcome  int not null default 0,
  correct_count         int not null default 0,
  partial_count         int not null default 0,
  incorrect_count       int not null default 0,
  accuracy_pct          numeric(5,2),
  weighted_accuracy_pct numeric(5,2),
  coverage_pct          numeric(5,2),
  dismissal_rate        numeric(5,2),
  action_rate           numeric(5,2),
  sample_size_status    text check (sample_size_status in ('sufficient','marginal','insufficient')),
  computed_at_utc       timestamptz not null default now()
);
alter table public.calibration_snapshots enable row level security;
create index cal_snap_lookup_idx on public.calibration_snapshots (org_id, snapshot_date desc, signal_class, signal_category, confidence_level);
create index cal_snap_scope_idx on public.calibration_snapshots (snapshot_date desc, snapshot_scope);
create index cal_snap_window_idx on public.calibration_snapshots (org_id, window_days, snapshot_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- calibration_scoreboards — named, versioned scoreboards (internal or public).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.calibration_scoreboards (
  id                uuid primary key default gen_random_uuid(),
  scoreboard_name   text not null,
  scoreboard_type   text not null check (scoreboard_type in ('tenant_internal','cross_tenant_public','cross_tenant_beta')),
  org_id            uuid references public.orgs (id) on delete cascade,
  generated_at_utc  timestamptz not null default now(),
  window_days       int not null,
  snapshot_ids      uuid[] default '{}',
  summary_stats     jsonb,
  narrative         jsonb,
  confidence_notes  jsonb,
  is_published      boolean not null default false,
  published_at_utc  timestamptz,
  created_at_utc    timestamptz not null default now()
);
alter table public.calibration_scoreboards enable row level security;
create index cal_score_org_idx on public.calibration_scoreboards (org_id, generated_at_utc desc);
create index cal_score_pub_idx on public.calibration_scoreboards (is_published, published_at_utc desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- calibration_events — immutable ledger feeding snapshots.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.calibration_events (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  signal_id                 uuid not null references public.signals (id) on delete cascade,
  ai_decision_record_id     uuid references public.ai_decision_records (id) on delete set null,
  calibration_event_type    text not null check (calibration_event_type in (
                              'prediction_created','prediction_matured','outcome_recorded',
                              'accuracy_marked','dismissal_recorded','action_taken')),
  signal_class              text not null,
  signal_category           text not null,
  confidence_level          text not null,
  accuracy_result           text,
  matched_component_event_id uuid references public.component_events (id) on delete set null,
  horizon_delta_days        int,
  notes                     text,
  event_at_utc              timestamptz not null default now(),
  created_at_utc            timestamptz not null default now()
);
alter table public.calibration_events enable row level security;
create index cal_event_signal_idx on public.calibration_events (signal_id);
create index cal_event_org_idx on public.calibration_events (org_id, event_at_utc desc);
create index cal_event_type_idx on public.calibration_events (calibration_event_type, event_at_utc desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- calibration_publications — append-only log of formal publications.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.calibration_publications (
  id                        uuid primary key default gen_random_uuid(),
  scoreboard_id             uuid not null references public.calibration_scoreboards (id) on delete cascade,
  publication_channel       text not null check (publication_channel in ('website','api','press_release','customer_report','regulator_briefing')),
  published_at_utc          timestamptz not null default now(),
  published_by_user_id      uuid not null,
  publication_content_hash  text not null,
  publication_url           text,
  publication_metadata      jsonb,
  created_at_utc            timestamptz not null default now()
);
alter table public.calibration_publications enable row level security;
create index cal_pub_scoreboard_idx on public.calibration_publications (scoreboard_id, published_at_utc desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- cross_tenant_calibration_snapshots — anonymized aggregate across consenting
-- tenants. Populated with participating_org_count=1 until more tenants onboard.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.cross_tenant_calibration_snapshots (
  id                        uuid primary key default gen_random_uuid(),
  snapshot_date             date not null,
  signal_class              text not null,
  signal_category           text not null,
  confidence_level          text not null,
  model_identifier          text,
  window_days               int not null,
  participating_org_count   int not null,
  total_signals             int not null,
  signals_with_outcome      int not null,
  correct_count             int not null,
  partial_count             int not null,
  incorrect_count           int not null,
  accuracy_pct              numeric(5,2),
  weighted_accuracy_pct     numeric(5,2),
  minimum_participating_orgs int not null default 5,
  computed_at_utc           timestamptz not null default now()
);
alter table public.cross_tenant_calibration_snapshots enable row level security;
create index ctc_snap_idx on public.cross_tenant_calibration_snapshots (snapshot_date desc, signal_category, confidence_level);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Snapshots: members see their org's rows; cross_tenant (org_id null) rows are
-- visible to any authenticated user. Writes flow through SECURITY DEFINER compute.
create policy cal_snap_sel on public.calibration_snapshots for select
  using (org_id is null or public.is_org_member(org_id));
create policy cal_snap_ins on public.calibration_snapshots for insert
  with check (org_id is null or public.is_org_member(org_id));
create policy cal_snap_del on public.calibration_snapshots for delete
  using (org_id is not null and public.is_org_member(org_id));

-- Scoreboards: read own org + any published cross-tenant. Insert own org.
-- UPDATE only while UNPUBLISHED (published scoreboards are immutable).
create policy cal_score_sel on public.calibration_scoreboards for select
  using (org_id is null or public.is_org_member(org_id) or is_published);
create policy cal_score_ins on public.calibration_scoreboards for insert
  with check (org_id is null or public.is_org_member(org_id));
create policy cal_score_upd on public.calibration_scoreboards for update
  using (not is_published and (org_id is null or public.is_org_member(org_id)))
  with check (org_id is null or public.is_org_member(org_id));

-- Events: append-only. Read + insert for members; NO update/delete policy.
create policy cal_event_sel on public.calibration_events for select using (public.is_org_member(org_id));
create policy cal_event_ins on public.calibration_events for insert with check (public.is_org_member(org_id));

-- Publications: append-only. Read for members of the scoreboard's org (or any
-- published cross-tenant board); insert for members; NO update/delete policy.
create policy cal_pub_sel on public.calibration_publications for select using (
  exists (select 1 from public.calibration_scoreboards b where b.id = scoreboard_id
          and (b.org_id is null or public.is_org_member(b.org_id))));
create policy cal_pub_ins on public.calibration_publications for insert with check (
  exists (select 1 from public.calibration_scoreboards b where b.id = scoreboard_id
          and (b.org_id is null or public.is_org_member(b.org_id))));

-- Cross-tenant snapshots: any authenticated user may read (anonymized). Writes
-- are SECURITY DEFINER only.
create policy ctc_snap_sel on public.cross_tenant_calibration_snapshots for select
  using (auth.role() = 'authenticated');

-- ═════════════════════════════════════════════════════════════════════════════
-- Realtime — scoreboards (generation is user-visible progress).
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.calibration_scoreboards replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='calibration_scoreboards') then
    alter publication supabase_realtime add table public.calibration_scoreboards;
  end if;
end $$;
