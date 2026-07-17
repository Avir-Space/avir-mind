-- AVIR Mind — Phase 12: MRO Configuration Extensions.
-- 1201: tenant configuration + the operator/MRO active-tenant toggle + 7 MRO
-- tables. Makes AVIR viable for Part 145 repair stations: customer accounts,
-- service contracts, aircraft-for-service, work packages, findings, SLAs, and
-- customer reports — without breaking the operator-focused modules.
--
-- Three theses:
--   Same aircraft entity, different relationships (owned by an operator OR
--     assigned-for-service to an MRO for the duration of a shop visit).
--   Customer contracts are policy scaffolding (pricing, SLA, warranty, reporting
--     inherit from the contract).
--   Work packages are the MRO version of tasks — a customer-billable unit
--     grouping tasks/findings/components for a shop visit.

-- ── tenant configuration on orgs ──
alter table public.orgs
  add column if not exists primary_business_model text not null default 'operator'
    check (primary_business_model in ('operator','mro','hybrid')),
  add column if not exists default_view_lens text not null default 'fleet_operational'
    check (default_view_lens in ('fleet_operational','customer_service','dual')),
  add column if not exists enabled_modules text[] default '{}',
  add column if not exists brand_name text,
  add column if not exists brand_logo_url text;

-- ── per-user active-org preference (the operator/MRO view toggle) ──
create table if not exists public.user_org_preferences (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  active_org_id uuid references public.orgs (id) on delete set null,
  updated_at_utc timestamptz not null default now()
);
alter table public.user_org_preferences enable row level security;
create policy uop_sel on public.user_org_preferences for select using (user_id = auth.uid());
create policy uop_ins on public.user_org_preferences for insert with check (user_id = auth.uid());
create policy uop_upd on public.user_org_preferences for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Redefine _caller_org() to honor the active-org preference (falling back to the
-- first membership). Every existing RPC uses this, so the toggle is global.
create or replace function public._caller_org()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.active_org_id from public.user_org_preferences p
       join public.org_members m on m.org_id = p.active_org_id and m.user_id = auth.uid()
       where p.user_id = auth.uid()),
    (select org_id from public.org_members where user_id = auth.uid() order by (role = 'owner') desc, created_at limit 1));
$$;

create or replace function public.set_active_org(p_org_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.org_members where org_id = p_org_id and user_id = auth.uid()) then
    raise exception 'not a member of that org';
  end if;
  insert into public.user_org_preferences (user_id, active_org_id) values (auth.uid(), p_org_id)
  on conflict (user_id) do update set active_org_id = excluded.active_org_id, updated_at_utc = now();
  return jsonb_build_object('active_org_id', p_org_id);
end $$;
grant execute on function public.set_active_org(uuid) to authenticated;

create or replace function public.get_my_orgs()
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb) from (
    select o.id, o.name, o.primary_business_model, o.default_view_lens, o.brand_name, m.role,
      (o.id = public._caller_org()) as is_active
    from public.org_members m join public.orgs o on o.id = m.org_id where m.user_id = auth.uid()) t;
$$;
grant execute on function public.get_my_orgs() to authenticated;

create or replace function public.get_org_config()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('org_id', o.id, 'name', o.name, 'primary_business_model', o.primary_business_model,
    'default_view_lens', o.default_view_lens, 'brand_name', o.brand_name, 'enabled_modules', o.enabled_modules)
  from public.orgs o where o.id = public._caller_org();
$$;
grant execute on function public.get_org_config() to authenticated;

create or replace function public.set_business_model(p_model text, p_view_lens text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  update public.orgs set primary_business_model = p_model,
    default_view_lens = coalesce(p_view_lens, case p_model when 'mro' then 'customer_service' when 'hybrid' then 'dual' else 'fleet_operational' end)
    where id = v_org;
  return jsonb_build_object('org_id', v_org, 'primary_business_model', p_model);
end $$;
grant execute on function public.set_business_model(text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- MRO tables
-- ═════════════════════════════════════════════════════════════════════════════
create table public.customer_accounts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  customer_name         text not null,
  customer_code         text not null,
  customer_type         text check (customer_type in ('operator_airline','operator_charter','operator_corporate','operator_government','lessor','insurer','another_mro','oem_warranty','other')),
  primary_contact_name  text,
  primary_contact_email text,
  primary_contact_phone text,
  billing_address       jsonb,
  shipping_address      jsonb,
  customer_status       text not null default 'active' check (customer_status in ('active','prospect','under_review','suspended','terminated')),
  credit_limit_usd      numeric(12,2),
  payment_terms         text,
  default_currency      text default 'USD',
  notes                 text,
  created_at_utc        timestamptz not null default now(),
  updated_at_utc        timestamptz not null default now(),
  unique (org_id, customer_code)
);
alter table public.customer_accounts enable row level security;
create index cust_org_idx on public.customer_accounts (org_id, customer_status);

create table public.service_contracts (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.orgs (id) on delete cascade,
  customer_account_id      uuid not null references public.customer_accounts (id) on delete cascade,
  contract_number          text not null,
  contract_name            text not null,
  contract_type            text check (contract_type in ('power_by_hour','fixed_fee','time_and_materials','block_hour','ad_hoc','mixed')),
  effective_from           date not null,
  effective_to             date,
  auto_renew               boolean default false,
  covered_aircraft_types   text[] default '{}',
  covered_aircraft_registrations text[] default '{}',
  covered_scope            jsonb,
  excluded_scope           jsonb,
  pricing_structure        jsonb,
  sla_definitions          jsonb,
  warranty_terms           jsonb,
  reporting_obligations    jsonb,
  termination_clauses      jsonb,
  contract_document_url    text,
  contract_status          text not null default 'active' check (contract_status in ('draft','active','expiring_soon','expired','terminated','renewed')),
  annual_value_usd         numeric(15,2),
  created_at_utc           timestamptz not null default now(),
  updated_at_utc           timestamptz not null default now(),
  unique (org_id, contract_number)
);
alter table public.service_contracts enable row level security;
create index sc_org_cust_idx on public.service_contracts (org_id, customer_account_id, contract_status);

create table public.aircraft_service_assignments (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  customer_account_id   uuid not null references public.customer_accounts (id) on delete cascade,
  service_contract_id   uuid references public.service_contracts (id) on delete set null,
  aircraft_id           uuid not null references public.aircraft (id) on delete cascade,
  arrival_expected_utc  timestamptz,
  arrival_actual_utc    timestamptz,
  planned_release_utc   timestamptz,
  actual_release_utc    timestamptz,
  assignment_status     text not null default 'expected' check (assignment_status in ('expected','arrived','in_service','ready_for_release','released','cancelled')),
  primary_service_purpose text,
  assigned_hangar       text,
  assigned_bay          text,
  customer_reference    text,
  estimated_labor_hours numeric(10,2),
  actual_labor_hours    numeric(10,2),
  notes                 text,
  created_at_utc        timestamptz not null default now(),
  updated_at_utc        timestamptz not null default now()
);
alter table public.aircraft_service_assignments enable row level security;
create index asa_org_status_idx on public.aircraft_service_assignments (org_id, assignment_status);
create index asa_cust_idx on public.aircraft_service_assignments (customer_account_id);

create table public.work_packages (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  service_assignment_id     uuid not null references public.aircraft_service_assignments (id) on delete cascade,
  work_package_number       text not null,
  package_type              text check (package_type in ('scheduled_check','line_service','ad_compliance','sb_incorporation','modification','unscheduled','warranty_repair')),
  title                     text not null,
  description               text,
  planned_start_utc         timestamptz,
  actual_start_utc          timestamptz,
  planned_completion_utc    timestamptz,
  actual_completion_utc     timestamptz,
  status                    text not null default 'planned' check (status in ('planned','in_progress','held','awaiting_parts','awaiting_customer_approval','complete','cancelled')),
  labor_hours_planned       numeric(10,2),
  labor_hours_actual        numeric(10,2),
  parts_cost_planned_usd    numeric(12,2),
  parts_cost_actual_usd     numeric(12,2),
  labor_cost_actual_usd     numeric(12,2),
  other_costs_usd           numeric(12,2),
  billable                  boolean default true,
  customer_approval_required boolean default false,
  customer_approved_at_utc  timestamptz,
  customer_approved_by      text,
  responsible_technician_user_id uuid,
  quality_inspector_user_id uuid,
  linked_task_ids           uuid[] default '{}',
  linked_component_event_ids uuid[] default '{}',
  created_at_utc            timestamptz not null default now(),
  updated_at_utc            timestamptz not null default now(),
  unique (org_id, work_package_number)
);
alter table public.work_packages enable row level security;
create index wp_org_status_idx on public.work_packages (org_id, status);
create index wp_assignment_idx on public.work_packages (service_assignment_id);

create table public.work_package_findings (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  work_package_id           uuid not null references public.work_packages (id) on delete cascade,
  finding_type              text check (finding_type in ('routine_inspection_finding','unscheduled_discovery','damage_found','wear_beyond_limits','corrosion','quality_escape','warranty_claim_candidate')),
  severity                  text check (severity in ('minor','moderate','major','critical')),
  discovered_at_utc         timestamptz not null default now(),
  discovered_by_user_id     uuid,
  component_reference       text,
  location_reference        text,
  description               text not null,
  recommended_action        text,
  estimated_additional_cost_usd numeric(12,2),
  estimated_additional_labor_hours numeric(10,2),
  customer_notified         boolean default false,
  customer_notified_at_utc  timestamptz,
  customer_response         text,
  resolution_status         text check (resolution_status in ('pending','approved_for_work','deferred','declined','rectified')),
  linked_task_id            uuid references public.tasks (id) on delete set null,
  created_at_utc            timestamptz not null default now()
);
alter table public.work_package_findings enable row level security;
create index wpf_wp_idx on public.work_package_findings (work_package_id);
create index wpf_org_notify_idx on public.work_package_findings (org_id, customer_notified, discovered_at_utc);

create table public.sla_measurements (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs (id) on delete cascade,
  service_contract_id     uuid not null references public.service_contracts (id) on delete cascade,
  customer_account_id     uuid not null references public.customer_accounts (id) on delete cascade,
  sla_type                text not null,
  measurement_period_start date not null,
  measurement_period_end  date not null,
  target_value            numeric(12,4),
  actual_value            numeric(12,4),
  unit                    text,
  performance_pct         numeric(5,2),
  credits_owed_usd        numeric(12,2),
  penalty_reason          text,
  measurement_details     jsonb,
  created_at_utc          timestamptz not null default now()
);
alter table public.sla_measurements enable row level security;
create index sla_contract_idx on public.sla_measurements (org_id, service_contract_id, measurement_period_end desc);

create table public.customer_reports (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs (id) on delete cascade,
  customer_account_id       uuid not null references public.customer_accounts (id) on delete cascade,
  service_contract_id       uuid references public.service_contracts (id) on delete set null,
  report_type               text check (report_type in ('monthly_activity','quarterly_reliability','sla_performance','warranty_claims','ad_compliance','findings_summary','financial_reconciliation','ad_hoc')),
  reporting_period_start    date not null,
  reporting_period_end      date not null,
  generated_at_utc          timestamptz,
  generated_by_user_id      uuid,
  report_status             text not null default 'draft' check (report_status in ('draft','generated','reviewed','sent_to_customer','acknowledged')),
  content                   jsonb,
  storage_path_pdf          text,
  sent_at_utc               timestamptz,
  customer_acknowledged_at_utc timestamptz,
  created_at_utc            timestamptz not null default now()
);
alter table public.customer_reports enable row level security;
create index cr_org_cust_idx on public.customer_reports (org_id, customer_account_id, created_at_utc desc);

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS — all MRO tables org-scoped.
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array[
    'customer_accounts','service_contracts','aircraft_service_assignments','work_packages',
    'work_package_findings','sla_measurements','customer_reports'
  ] loop
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id));', t||'_sel', t);
    execute format('create policy %I on public.%I for insert with check (public.is_org_member(org_id));', t||'_ins', t);
    execute format('create policy %I on public.%I for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));', t||'_upd', t);
    execute format('create policy %I on public.%I for delete using (public.is_org_member(org_id));', t||'_del', t);
  end loop;
end $$;

-- ── extend enum-like checks for MRO roles + notification event types ──
alter table public.org_roles drop constraint org_roles_role_code_check;
alter table public.org_roles add constraint org_roles_role_code_check check (role_code in (
  'line_maintenance','base_maintenance','quality_assurance','compliance_officer','ops_control','dispatcher',
  'chief_pilot','director_of_maintenance','director_of_operations','safety_officer','materials_manager','crew_scheduler',
  'mro_customer_manager','mro_technical_manager','mro_finance_manager','other'));

alter table public.notification_policies drop constraint notification_policies_event_type_check;
alter table public.notification_policies add constraint notification_policies_event_type_check check (event_type in (
  'signal_created','signal_severity_changed','task_created','task_status_changed','task_overdue','prediction_matured',
  'aog_declared','mel_deferred','ad_deadline_approaching','crew_currency_gap','weather_significant','delay_recorded',
  'sla_breach','contract_expiring','customer_finding','work_package_stall','other'));

-- ── realtime — work_packages + service assignments (two-user status changes) ──
alter table public.work_packages replica identity full;
alter table public.aircraft_service_assignments replica identity full;
do $$
declare t text;
begin
  foreach t in array array['work_packages','aircraft_service_assignments'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
