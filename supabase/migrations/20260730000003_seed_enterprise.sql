-- AVIR Mind — Phase 13: enterprise seed. Sample API keys (revoked/active/
-- expiring), an Okta SSO config (inactive), audit events, API request history,
-- sessions, and a webhook. Wired into signup + backfilled.

create or replace function public.seed_demo_enterprise(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_key_active uuid; i int; v_paths text[]; v_methods text[]; v_status int[];
begin
  if p_org_id is null or p_user_id is null then return; end if;
  delete from public.api_requests where org_id = p_org_id;
  delete from public.api_keys where org_id = p_org_id;
  delete from public.sso_configurations where org_id = p_org_id;
  delete from public.webhook_subscriptions where org_id = p_org_id;
  delete from public.security_audit_events where org_id = p_org_id;
  delete from public.user_sessions where user_id = p_user_id;
  delete from public.user_2fa_configurations where user_id = p_user_id;

  -- 3 API keys (display-only; raw keys unknown — real keys are minted via the UI)
  insert into public.api_keys (org_id, key_name, key_hash, key_prefix, scope, rate_limit_per_minute, created_by_user_id, last_used_at_utc, created_at_utc)
    values (p_org_id, 'Production integration', encode(digest('seed-active-'||p_org_id::text,'sha256'),'hex'), 'avir_live_9f3a21c8', array['read:signals','read:aircraft','write:tasks'], 120, p_user_id, now() - interval '20 minutes', now() - interval '40 days')
    returning id into v_key_active;
  insert into public.api_keys (org_id, key_name, key_hash, key_prefix, scope, rate_limit_per_minute, created_by_user_id, last_used_at_utc, expires_at_utc, created_at_utc)
    values (p_org_id, 'Data science read-only', encode(digest('seed-expiring-'||p_org_id::text,'sha256'),'hex'), 'avir_live_2b70de44', array['read:signals','read:components','read:calibration'], 60, p_user_id, now() - interval '3 hours', now() + interval '9 days', now() - interval '80 days');
  insert into public.api_keys (org_id, key_name, key_hash, key_prefix, scope, rate_limit_per_minute, created_by_user_id, revoked_at_utc, revocation_reason, created_at_utc)
    values (p_org_id, 'Legacy ETL (rotated out)', encode(digest('seed-revoked-'||p_org_id::text,'sha256'),'hex'), 'avir_live_5c11aa90', array['read:aircraft','read:flights'], 60, p_user_id, now() - interval '5 days', 'Rotated during Q3 key rotation', now() - interval '200 days');

  -- SSO config — Okta example, inactive
  insert into public.sso_configurations (org_id, provider_type, provider_name, entity_id, sso_url, attribute_mappings, role_mappings, default_role, allowed_email_domains, is_active, enforce_sso, configured_by_user_id)
  values (p_org_id, 'saml', 'Okta', 'http://www.okta.com/exkavirdemo', 'https://avir-demo.okta.com/app/exkavirdemo/sso/saml',
    jsonb_build_object('email','user.email','first_name','user.firstName','last_name','user.lastName'),
    jsonb_build_object('AVIR-Admins','admin','AVIR-Members','editor','AVIR-Viewers','viewer'),
    'viewer', array['avir.space','example.aero'], false, false, p_user_id);

  -- webhook
  insert into public.webhook_subscriptions (org_id, target_url, events, signing_secret, created_by_user_id, last_delivery_at_utc, last_delivery_status)
  values (p_org_id, 'https://hooks.example.aero/avir', array['signal.created','aog.declared','task.status_changed'], 'whsec_' || encode(digest('seed-wh-'||p_org_id::text,'sha256'),'hex'), p_user_id, now() - interval '2 hours', 200);

  -- sessions (web current + mobile + api)
  insert into public.user_sessions (user_id, org_id, session_type, ip_address, user_agent, geo_country_code, geo_city, authenticated_at_utc, last_activity_at_utc, authentication_factors_used) values
    (p_user_id, p_org_id, 'web', '203.0.113.10', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126', 'JO', 'Amman', now() - interval '2 hours', now() - interval '3 minutes', array['password','2fa_totp']),
    (p_user_id, p_org_id, 'mobile', '198.51.100.22', 'AvirMind/0.1.0 (iOS 18; Expo)', 'JO', 'Amman', now() - interval '1 day', now() - interval '5 hours', array['password','2fa_totp']),
    (p_user_id, p_org_id, 'api', '192.0.2.50', 'avir-sdk/0.1.0 node', 'US', 'Ashburn', now() - interval '6 hours', now() - interval '20 minutes', array['api_key']);

  -- audit events
  insert into public.security_audit_events (org_id, user_id, event_type, event_summary, event_payload, ip_address, risk_score, created_at_utc) values
    (p_org_id, p_user_id, 'login_success', 'Login via password + TOTP', jsonb_build_object('factors', array['password','2fa_totp']), '203.0.113.10', 5, now() - interval '2 hours'),
    (p_org_id, p_user_id, '2fa_enabled', '2FA enabled: totp', jsonb_build_object('method','totp'), '203.0.113.10', 10, now() - interval '39 days'),
    (p_org_id, p_user_id, 'api_key_created', 'API key created: Production integration', jsonb_build_object('prefix','avir_live_9f3a21c8'), '203.0.113.10', 30, now() - interval '40 days'),
    (p_org_id, p_user_id, 'sso_configured', 'SSO configured: Okta', jsonb_build_object('provider','Okta'), '203.0.113.10', 50, now() - interval '30 days'),
    (p_org_id, null, 'login_failure', 'Failed login attempt (wrong password)', jsonb_build_object('email','laman@avir.space'), '45.83.0.7', 60, now() - interval '3 days'),
    (p_org_id, p_user_id, 'api_key_revoked', 'API key revoked: Legacy ETL', jsonb_build_object('reason','Q3 rotation'), '203.0.113.10', 20, now() - interval '5 days'),
    (p_org_id, null, 'suspicious_activity', 'Rate limit exceeded repeatedly from a single IP', jsonb_build_object('ip','45.83.0.7','count',340), '45.83.0.7', 80, now() - interval '1 day');

  -- API request history (mix of paths/status over last 24h)
  v_paths := array['/v1/signals','/v1/aircraft','/v1/tasks','/v1/signals','/v1/components','/v1/flights','/v1/signals','/v1/aircraft'];
  v_methods := array['GET','GET','POST','GET','GET','GET','GET','GET'];
  v_status := array[200,200,201,200,200,200,429,200];
  for i in 1..40 loop
    insert into public.api_requests (org_id, api_key_id, request_method, request_path, response_status_code, duration_ms, rate_limit_remaining, request_started_at_utc, request_completed_at_utc)
    values (p_org_id, v_key_active, v_methods[1 + (i % 8)], v_paths[1 + (i % 8)], v_status[1 + (i % 8)], 20 + (i * 3) % 180, greatest(0, 120 - (i % 120)),
      now() - ((i * 34) || ' minutes')::interval, now() - ((i * 34) || ' minutes')::interval + interval '80 milliseconds');
  end loop;
end $$;
grant execute on function public.seed_demo_enterprise(uuid, uuid) to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Wire into signup + backfill.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user_signup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  begin
    v_org := public.seed_avir_demo(new.id);
    if v_org is not null then
      perform public.seed_demo_flight_schedules(v_org, new.id);
      perform public.seed_demo_components(v_org, new.id);
      perform public.seed_demo_inventory(v_org, new.id);
      perform public.seed_demo_crew(v_org, new.id);
      perform public.seed_demo_flight_ops(v_org, new.id);
      perform public.seed_demo_compliance(v_org, new.id);
      perform public.generate_inventory_signals_for_org(v_org);
      perform public.generate_crew_signals_for_org(v_org);
      perform public.generate_operational_signals_for_org(v_org);
      perform public.generate_compliance_signals_for_org(v_org);
      perform public.seed_demo_calibration(v_org, new.id);
      perform public.seed_demo_backtest(v_org, new.id);
      perform public.seed_demo_comms(v_org, new.id);
      perform public.seed_demo_mro(new.id);
      perform public.seed_demo_enterprise(v_org, new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select o.id as org_id, (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id
           from public.orgs o where o.primary_business_model = 'operator' loop
    if r.user_id is not null then
      perform public.seed_demo_enterprise(r.org_id, r.user_id);
    end if;
  end loop;
end $$;
