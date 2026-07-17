-- AVIR Mind — Phase 13: Enterprise Enablers.
-- 1301: schema for the public API, SSO, 2FA, sessions, and the security audit
-- trail. Makes AVIR enterprise-deployable and able to pass a security review.
--
-- Three theses:
--   The API is the boundary — programmatic access is versioned, scoped,
--     rate-limited, key-authenticated, and every request is logged.
--   Authentication is layered — SSO (enterprise identity), 2FA (account
--     security), API keys (machine access), sessions (web/mobile/api), each with
--     its own lifecycle + audit trail.
--   Mobile is a client, not a product — same API, same policies.
--
-- api_requests and security_audit_events are append-only (no update/delete policy).

-- ── api_keys ──
create table public.api_keys (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs (id) on delete cascade,
  key_name             text not null,
  key_hash             text not null unique,
  key_prefix           text not null,
  scope                text[] not null default '{}',
  rate_limit_per_minute int not null default 60,
  rate_limit_per_day   int not null default 100000,
  created_by_user_id   uuid not null references auth.users (id) on delete cascade,
  last_used_at_utc     timestamptz,
  expires_at_utc       timestamptz,
  revoked_at_utc       timestamptz,
  revocation_reason    text,
  created_at_utc       timestamptz not null default now()
);
alter table public.api_keys enable row level security;
create index apikey_org_idx on public.api_keys (org_id, created_at_utc desc);
create index apikey_hash_idx on public.api_keys (key_hash) where revoked_at_utc is null;

-- ── api_requests (append-only audit of every API call) ──
create table public.api_requests (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  api_key_id               uuid references public.api_keys (id) on delete set null,
  user_id                  uuid,
  request_method           text not null,
  request_path             text not null,
  request_headers_summary  jsonb,
  request_body_size_bytes  int,
  response_status_code     int,
  response_body_size_bytes int,
  ip_address               inet,
  user_agent               text,
  request_started_at_utc   timestamptz not null default now(),
  request_completed_at_utc timestamptz,
  duration_ms              int,
  rate_limit_remaining     int,
  error_message            text,
  created_at_utc           timestamptz not null default now()
);
alter table public.api_requests enable row level security;
create index apireq_org_idx on public.api_requests (org_id, request_started_at_utc desc);
create index apireq_key_idx on public.api_requests (api_key_id, request_started_at_utc desc);
create index apireq_status_idx on public.api_requests (response_status_code);

-- ── sso_configurations ──
create table public.sso_configurations (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs (id) on delete cascade,
  provider_type          text check (provider_type in ('saml','oidc')),
  provider_name          text,
  entity_id              text,
  sso_url                text,
  certificate_pem        text,
  client_id              text,
  client_secret_encrypted text,
  discovery_url          text,
  attribute_mappings     jsonb,
  role_mappings          jsonb,
  default_role           text,
  allowed_email_domains  text[] default '{}',
  is_active              boolean not null default true,
  enforce_sso            boolean not null default false,
  configured_by_user_id  uuid references auth.users (id) on delete set null,
  configured_at_utc      timestamptz not null default now(),
  created_at_utc         timestamptz not null default now(),
  updated_at_utc         timestamptz not null default now()
);
alter table public.sso_configurations enable row level security;
create index sso_org_idx on public.sso_configurations (org_id);
create trigger sso_set_updated before update on public.sso_configurations for each row execute function public.set_updated_at_utc();

-- ── user_2fa_configurations ──
create table public.user_2fa_configurations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  method_type           text check (method_type in ('totp','sms','backup_codes')),
  totp_secret_encrypted text,
  sms_phone             text,
  backup_codes_encrypted text,
  is_active             boolean not null default true,
  verified_at_utc       timestamptz,
  last_used_at_utc      timestamptz,
  created_at_utc        timestamptz not null default now()
);
alter table public.user_2fa_configurations enable row level security;
create index u2fa_user_idx on public.user_2fa_configurations (user_id, method_type);

-- ── user_sessions ──
create table public.user_sessions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users (id) on delete cascade,
  org_id                      uuid references public.orgs (id) on delete cascade,
  session_type                text check (session_type in ('web','mobile','api')),
  ip_address                  inet,
  user_agent                  text,
  geo_country_code            text,
  geo_city                    text,
  authenticated_at_utc        timestamptz not null default now(),
  last_activity_at_utc        timestamptz not null default now(),
  expires_at_utc              timestamptz,
  ended_at_utc                timestamptz,
  ended_reason                text,
  authentication_factors_used text[] default '{}',
  created_at_utc              timestamptz not null default now()
);
alter table public.user_sessions enable row level security;
create index usess_user_idx on public.user_sessions (user_id, last_activity_at_utc desc);

-- ── security_audit_events (append-only) ──
create table public.security_audit_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  user_id       uuid,
  event_type    text not null check (event_type in (
                  'login_success','login_failure','password_changed','2fa_enabled','2fa_disabled','2fa_used',
                  'api_key_created','api_key_revoked','sso_configured','sso_updated','permission_changed',
                  'admin_action','data_export','session_terminated','suspicious_activity')),
  event_summary text not null,
  event_payload jsonb,
  ip_address    inet,
  user_agent    text,
  risk_score    int,
  created_at_utc timestamptz not null default now()
);
alter table public.security_audit_events enable row level security;
create index audit_org_idx on public.security_audit_events (org_id, created_at_utc desc);
create index audit_type_idx on public.security_audit_events (org_id, event_type, created_at_utc desc);

-- ── webhook_subscriptions ──
create table public.webhook_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs (id) on delete cascade,
  target_url         text not null,
  events             text[] not null default '{}',
  signing_secret     text not null,
  is_active          boolean not null default true,
  created_by_user_id uuid references auth.users (id) on delete set null,
  last_delivery_at_utc timestamptz,
  last_delivery_status int,
  created_at_utc     timestamptz not null default now()
);
alter table public.webhook_subscriptions enable row level security;
create index webhook_org_idx on public.webhook_subscriptions (org_id, is_active);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════
-- Org-scoped read/write on config tables (key_hash never selectable in practice
-- since the raw key is only returned at creation; the hash column is opaque).
do $$
declare t text;
begin
  foreach t in array array['api_keys','sso_configurations','webhook_subscriptions'] loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id));', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_member(org_id));', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_member(org_id));', t||'_del', t);
  end loop;
end $$;

-- api_requests + security_audit_events: members READ their org; INSERT allowed (definer
-- writers); NO update/delete → append-only.
create policy apireq_sel on public.api_requests for select using (public.is_org_member(org_id));
create policy apireq_ins on public.api_requests for insert with check (public.is_org_member(org_id));
create policy audit_sel on public.security_audit_events for select using (public.is_org_member(org_id));
create policy audit_ins on public.security_audit_events for insert with check (public.is_org_member(org_id));

-- 2FA + sessions are per-user (the user sees only their own).
create policy u2fa_sel on public.user_2fa_configurations for select using (user_id = auth.uid());
create policy u2fa_all on public.user_2fa_configurations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy usess_sel on public.user_sessions for select using (user_id = auth.uid());
create policy usess_upd on public.user_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy usess_ins on public.user_sessions for insert with check (user_id = auth.uid());

-- ── realtime — security_audit_events + user_sessions ──
alter table public.security_audit_events replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='security_audit_events') then
    alter publication supabase_realtime add table public.security_audit_events;
  end if;
end $$;
