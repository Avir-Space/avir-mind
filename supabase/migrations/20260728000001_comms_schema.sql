-- AVIR Mind — Phase 11: Communications Layer.
-- 1101: schema. How AVIR reaches operators when signals fire, tasks need
-- attention, or events require action.
--
-- Three theses:
--   Notifications are POLICY-driven, not signal-driven — a critical AOG signal
--     flows through a policy that decides who/when/what channel by severity,
--     category, time-of-day, on-call schedule, and role.
--   Every channel has a use case — email for digests, Slack for collaboration,
--     SMS for AOG-critical, in-app for ambient awareness.
--   Notification outcomes are calibration data — every send/ack/response-time
--     feeds the picture of how alerts are actually acted on.
--
-- notification_events is append-only EXCEPT the acknowledgment fields (an
-- operator may acknowledge, but not rewrite the delivery record).

-- ── notification_channels — per-user configured channels ──
create table public.notification_channels (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  channel_type        text not null check (channel_type in ('email','slack','sms','in_app','webhook')),
  channel_address     text not null,
  verification_status text not null default 'pending' check (verification_status in ('verified','pending','failed')),
  verified_at_utc     timestamptz,
  is_active           boolean not null default true,
  quiet_hours_start   time,
  quiet_hours_end     time,
  quiet_hours_timezone text,
  emergency_override  boolean not null default true,
  created_at_utc      timestamptz not null default now(),
  updated_at_utc      timestamptz not null default now(),
  unique (user_id, channel_type, channel_address)
);
alter table public.notification_channels enable row level security;
create index nchan_user_idx on public.notification_channels (org_id, user_id, channel_type);
create trigger nchan_set_updated before update on public.notification_channels for each row execute function public.set_updated_at_utc();

-- ── org_roles — real airline functional roles ──
create table public.org_roles (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs (id) on delete cascade,
  role_code            text not null check (role_code in (
                         'line_maintenance','base_maintenance','quality_assurance','compliance_officer',
                         'ops_control','dispatcher','chief_pilot','director_of_maintenance',
                         'director_of_operations','safety_officer','materials_manager','crew_scheduler','other')),
  role_display_name    text not null,
  role_description     text,
  typical_shift_pattern text not null default 'business_hours' check (typical_shift_pattern in ('day_shift','night_shift','24_7_on_call','business_hours')),
  created_at_utc       timestamptz not null default now(),
  unique (org_id, role_code)
);
alter table public.org_roles enable row level security;

-- ── user_role_assignments ──
create table public.user_role_assignments (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  role_id            uuid not null references public.org_roles (id) on delete cascade,
  effective_from_utc timestamptz not null default now(),
  effective_to_utc   timestamptz,
  is_primary         boolean not null default false,
  notes              text,
  created_at_utc     timestamptz not null default now()
);
alter table public.user_role_assignments enable row level security;
create index ura_role_idx on public.user_role_assignments (org_id, role_id);
create index ura_user_idx on public.user_role_assignments (org_id, user_id);

-- ── on_call_schedules ──
create table public.on_call_schedules (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  role_id          uuid not null references public.org_roles (id) on delete cascade,
  schedule_name    text not null,
  rotation_pattern jsonb,
  created_at_utc   timestamptz not null default now()
);
alter table public.on_call_schedules enable row level security;

-- ── on_call_shifts ──
create table public.on_call_shifts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  schedule_id      uuid not null references public.on_call_schedules (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  shift_start_utc  timestamptz not null,
  shift_end_utc    timestamptz not null,
  shift_type       text not null default 'primary' check (shift_type in ('primary','secondary','escalation')),
  created_at_utc   timestamptz not null default now()
);
alter table public.on_call_shifts enable row level security;
create index ocs_user_idx on public.on_call_shifts (org_id, user_id, shift_start_utc desc);
create index ocs_role_idx on public.on_call_shifts (schedule_id, shift_start_utc desc);

-- ── notification_policies ──
create table public.notification_policies (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  policy_name         text not null,
  event_type          text not null check (event_type in (
                        'signal_created','signal_severity_changed','task_created','task_status_changed',
                        'task_overdue','prediction_matured','aog_declared','mel_deferred',
                        'ad_deadline_approaching','crew_currency_gap','weather_significant','delay_recorded','other')),
  filter_criteria     jsonb default '{}'::jsonb,
  target_role_ids     uuid[] default '{}',
  target_user_ids     uuid[] default '{}',
  channel_preferences jsonb default '{}'::jsonb,
  escalation_ladder   jsonb default '[]'::jsonb,
  quiet_hours_behavior text not null default 'respect' check (quiet_hours_behavior in ('respect','override','defer_until_hours_end')),
  is_active           boolean not null default true,
  created_by_user_id  uuid references auth.users (id) on delete set null,
  created_at_utc      timestamptz not null default now(),
  updated_at_utc      timestamptz not null default now()
);
alter table public.notification_policies enable row level security;
create index npol_org_evt_idx on public.notification_policies (org_id, event_type, is_active);
create trigger npol_set_updated before update on public.notification_policies for each row execute function public.set_updated_at_utc();

-- ── notification_events — every notification sent (ack-only mutable) ──
create table public.notification_events (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.orgs (id) on delete cascade,
  policy_id                   uuid references public.notification_policies (id) on delete set null,
  trigger_source_type         text,
  trigger_source_id           uuid not null,
  recipient_user_id           uuid not null references auth.users (id) on delete cascade,
  recipient_role_id           uuid references public.org_roles (id) on delete set null,
  channel_type                text not null,
  channel_address             text not null,
  notification_content        jsonb,
  delivery_status             text not null default 'queued' check (delivery_status in ('queued','sending','delivered','failed','acknowledged','retried','cancelled')),
  sent_at_utc                 timestamptz,
  delivered_at_utc            timestamptz,
  acknowledged_at_utc         timestamptz,
  acknowledgment_channel      text,
  delivery_error              text,
  delivery_provider_message_id text,
  delivery_provider_response  jsonb,
  escalation_of_notification_id uuid references public.notification_events (id) on delete set null,
  severity                    text,
  created_at_utc              timestamptz not null default now()
);
alter table public.notification_events enable row level security;
create index nevt_recipient_idx on public.notification_events (org_id, recipient_user_id, created_at_utc desc);
create index nevt_status_idx on public.notification_events (delivery_status, created_at_utc desc);
create index nevt_source_idx on public.notification_events (trigger_source_id);

-- ── notification_digests ──
create table public.notification_digests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  digest_type       text check (digest_type in ('daily_briefing','weekly_summary','on_call_handover','custom')),
  period_start_utc  timestamptz not null,
  period_end_utc    timestamptz not null,
  content           jsonb,
  sent_at_utc       timestamptz,
  delivery_status   text,
  created_at_utc    timestamptz not null default now()
);
alter table public.notification_digests enable row level security;
create index ndig_user_idx on public.notification_digests (org_id, recipient_user_id, created_at_utc desc);

-- ── slack_workspace_configs ──
create table public.slack_workspace_configs (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs (id) on delete cascade,
  workspace_id         text not null,
  workspace_name       text,
  bot_token_encrypted  text,
  default_channel_id   text,
  default_channel_name text,
  installed_by_user_id uuid references auth.users (id) on delete set null,
  installed_at_utc     timestamptz,
  is_active            boolean not null default true,
  created_at_utc       timestamptz not null default now()
);
alter table public.slack_workspace_configs enable row level security;

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Standard org-scoped read/write on config tables.
do $$
declare t text;
begin
  foreach t in array array[
    'notification_channels','org_roles','user_role_assignments','on_call_schedules',
    'on_call_shifts','notification_policies','notification_digests','slack_workspace_configs'
  ] loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id));', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_member(org_id));', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_member(org_id));', t||'_del', t);
  end loop;
end $$;

-- notification_events: members read their org's events; INSERT allowed for members
-- (evaluator runs SECURITY DEFINER regardless). UPDATE allowed but the app path is
-- acknowledgment only (RPC). No DELETE policy → the delivery record can't be erased.
create policy nevt_sel on public.notification_events for select using (public.is_org_member(org_id));
create policy nevt_ins on public.notification_events for insert with check (public.is_org_member(org_id));
create policy nevt_upd on public.notification_events for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- ═════════════════════════════════════════════════════════════════════════════
-- Realtime — notification_events (badge + two-user ack).
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.notification_events replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notification_events') then
    alter publication supabase_realtime add table public.notification_events;
  end if;
end $$;
