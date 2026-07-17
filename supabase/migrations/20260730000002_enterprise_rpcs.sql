-- AVIR Mind — Phase 13: enterprise RPCs (API keys, audit, sessions, 2FA, SSO,
-- webhooks). Raw API keys + webhook secrets are returned ONCE at creation; only
-- their SHA-256 hash is stored.

-- ── audit helper ──
create or replace function public.log_audit_event(p_org uuid, p_type text, p_summary text, p_payload jsonb default '{}', p_risk int default 0, p_user uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.security_audit_events (org_id, user_id, event_type, event_summary, event_payload, risk_score)
  values (p_org, coalesce(p_user, auth.uid()), p_type, p_summary, p_payload, p_risk) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.log_audit_event(uuid, text, text, jsonb, int, uuid) to authenticated, service_role;

-- ── API keys ──
create or replace function public.create_api_key(p_name text, p_scopes text[] default '{}', p_rate_per_minute int default 60, p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid := public._caller_org(); v_raw text; v_hash text; v_prefix text; v_id uuid;
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  v_raw := 'avir_live_' || encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest(v_raw, 'sha256'), 'hex');
  v_prefix := left(v_raw, 18);
  insert into public.api_keys (org_id, key_name, key_hash, key_prefix, scope, rate_limit_per_minute, expires_at_utc, created_by_user_id)
  values (v_org, p_name, v_hash, v_prefix, coalesce(p_scopes, '{}'), coalesce(p_rate_per_minute, 60), p_expires_at, auth.uid())
  returning id into v_id;
  perform public.log_audit_event(v_org, 'api_key_created', 'API key created: ' || p_name, jsonb_build_object('key_id', v_id, 'prefix', v_prefix, 'scopes', p_scopes), 30);
  return jsonb_build_object('id', v_id, 'api_key', v_raw, 'key_prefix', v_prefix, 'note', 'Store this key now — it will not be shown again.');
end $$;
grant execute on function public.create_api_key(text, text[], int, timestamptz) to authenticated;

create or replace function public.get_api_keys()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.created_at_utc desc) from (
    select id, key_name, key_prefix, scope, rate_limit_per_minute, rate_limit_per_day, last_used_at_utc, expires_at_utc, revoked_at_utc, revocation_reason, created_at_utc,
      (revoked_at_utc is not null) as revoked, (expires_at_utc is not null and expires_at_utc < now()) as expired
    from public.api_keys where org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_api_keys() to authenticated;

create or replace function public.revoke_api_key(p_id uuid, p_reason text default 'revoked by admin')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.api_keys where id = p_id;
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  update public.api_keys set revoked_at_utc = now(), revocation_reason = p_reason where id = p_id;
  perform public.log_audit_event(v_org, 'api_key_revoked', 'API key revoked', jsonb_build_object('key_id', p_id, 'reason', p_reason), 20);
  return jsonb_build_object('id', p_id, 'revoked', true);
end $$;
grant execute on function public.revoke_api_key(uuid, text) to authenticated;

create or replace function public.get_api_requests(p_limit int default 100)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select r.id, r.request_method, r.request_path, r.response_status_code, r.duration_ms, r.rate_limit_remaining,
      r.request_started_at_utc, r.error_message, k.key_prefix, k.key_name
    from public.api_requests r left join public.api_keys k on k.id = r.api_key_id
    where r.org_id = v_org order by r.request_started_at_utc desc limit p_limit) t), '[]'::jsonb);
end $$;
grant execute on function public.get_api_requests(int) to authenticated;

create or replace function public.get_api_usage_summary()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'requests_24h', (select count(*) from public.api_requests where org_id = v_org and request_started_at_utc > now() - interval '24 hours'),
    'errors_24h', (select count(*) from public.api_requests where org_id = v_org and request_started_at_utc > now() - interval '24 hours' and response_status_code >= 400),
    'active_keys', (select count(*) from public.api_keys where org_id = v_org and revoked_at_utc is null and (expires_at_utc is null or expires_at_utc > now())),
    'avg_duration_ms', (select round(avg(duration_ms)) from public.api_requests where org_id = v_org and request_started_at_utc > now() - interval '24 hours'),
    'by_status', coalesce((select jsonb_object_agg(response_status_code::text, c) from (select response_status_code, count(*) c from public.api_requests where org_id = v_org and request_started_at_utc > now() - interval '7 days' group by response_status_code) x), '{}'::jsonb));
end $$;
grant execute on function public.get_api_usage_summary() to authenticated;

-- ── sessions ──
create or replace function public.get_user_sessions()
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.last_activity_at_utc desc), '[]'::jsonb) from (
    select id, session_type, ip_address::text, user_agent, geo_country_code, geo_city, authenticated_at_utc, last_activity_at_utc, ended_at_utc, authentication_factors_used
    from public.user_sessions where user_id = auth.uid()) t;
$$;
grant execute on function public.get_user_sessions() to authenticated;

create or replace function public.terminate_session(p_id uuid, p_all_except boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_n int;
begin
  select org_id into v_org from public.user_sessions where user_id = auth.uid() order by last_activity_at_utc desc limit 1;
  if p_all_except then
    update public.user_sessions set ended_at_utc = now(), ended_reason = 'terminated_by_user'
      where user_id = auth.uid() and id <> p_id and ended_at_utc is null;
    get diagnostics v_n = row_count;
  else
    update public.user_sessions set ended_at_utc = now(), ended_reason = 'terminated_by_user' where id = p_id and user_id = auth.uid();
    v_n := 1;
  end if;
  if v_org is not null then perform public.log_audit_event(v_org, 'session_terminated', 'Session(s) terminated', jsonb_build_object('count', v_n), 40); end if;
  return jsonb_build_object('terminated', v_n);
end $$;
grant execute on function public.terminate_session(uuid, boolean) to authenticated;

-- ── 2FA metadata tracking (the TOTP secret + QR come from Supabase native MFA) ──
create or replace function public.record_2fa_config(p_method text, p_sms_phone text default null, p_backup_codes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  insert into public.user_2fa_configurations (user_id, method_type, sms_phone, backup_codes_encrypted, verified_at_utc)
  values (auth.uid(), p_method, p_sms_phone, p_backup_codes, now());
  if v_org is not null then perform public.log_audit_event(v_org, '2fa_enabled', '2FA enabled: ' || p_method, jsonb_build_object('method', p_method), 10); end if;
  return jsonb_build_object('method', p_method, 'enabled', true);
end $$;
grant execute on function public.record_2fa_config(text, text, text) to authenticated;

create or replace function public.get_2fa_status()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object('methods', coalesce((select jsonb_agg(jsonb_build_object('method_type', method_type, 'is_active', is_active, 'verified_at_utc', verified_at_utc, 'last_used_at_utc', last_used_at_utc))
    from public.user_2fa_configurations where user_id = auth.uid() and is_active), '[]'::jsonb));
$$;
grant execute on function public.get_2fa_status() to authenticated;

create or replace function public.disable_2fa(p_method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  update public.user_2fa_configurations set is_active = false where user_id = auth.uid() and method_type = p_method;
  if v_org is not null then perform public.log_audit_event(v_org, '2fa_disabled', '2FA disabled: ' || p_method, jsonb_build_object('method', p_method), 30); end if;
  return jsonb_build_object('method', p_method, 'disabled', true);
end $$;
grant execute on function public.disable_2fa(text) to authenticated;

-- ── SSO ──
create or replace function public.save_sso_configuration(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid; v_existing uuid;
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  select id into v_existing from public.sso_configurations where org_id = v_org limit 1;
  if v_existing is not null then
    update public.sso_configurations set provider_type = p->>'provider_type', provider_name = p->>'provider_name',
      entity_id = p->>'entity_id', sso_url = p->>'sso_url', certificate_pem = p->>'certificate_pem',
      client_id = p->>'client_id', discovery_url = p->>'discovery_url',
      attribute_mappings = coalesce(p->'attribute_mappings', attribute_mappings), role_mappings = coalesce(p->'role_mappings', role_mappings),
      default_role = coalesce(p->>'default_role', default_role),
      allowed_email_domains = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'allowed_email_domains') x), allowed_email_domains),
      is_active = coalesce((p->>'is_active')::boolean, is_active), enforce_sso = coalesce((p->>'enforce_sso')::boolean, enforce_sso), updated_at_utc = now()
    where id = v_existing returning id into v_id;
    perform public.log_audit_event(v_org, 'sso_updated', 'SSO configuration updated', jsonb_build_object('provider', p->>'provider_name'), 50);
  else
    insert into public.sso_configurations (org_id, provider_type, provider_name, entity_id, sso_url, certificate_pem, client_id, discovery_url, attribute_mappings, role_mappings, default_role, allowed_email_domains, is_active, enforce_sso, configured_by_user_id)
    values (v_org, p->>'provider_type', p->>'provider_name', p->>'entity_id', p->>'sso_url', p->>'certificate_pem', p->>'client_id', p->>'discovery_url',
      p->'attribute_mappings', p->'role_mappings', p->>'default_role',
      coalesce((select array_agg(x) from jsonb_array_elements_text(p->'allowed_email_domains') x), '{}'),
      coalesce((p->>'is_active')::boolean, true), coalesce((p->>'enforce_sso')::boolean, false), auth.uid())
    returning id into v_id;
    perform public.log_audit_event(v_org, 'sso_configured', 'SSO configured: ' || coalesce(p->>'provider_name','provider'), jsonb_build_object('provider', p->>'provider_name'), 50);
  end if;
  return jsonb_build_object('id', v_id);
end $$;
grant execute on function public.save_sso_configuration(jsonb) to authenticated;

create or replace function public.get_sso_configuration()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return 'null'::jsonb; end if;
  return coalesce((select to_jsonb(s) - 'client_secret_encrypted' - 'certificate_pem' from public.sso_configurations s where s.org_id = v_org limit 1), 'null'::jsonb);
end $$;
grant execute on function public.get_sso_configuration() to authenticated;

-- SP metadata for IdP registration (values the IdP admin needs).
create or replace function public.get_sp_metadata()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  return jsonb_build_object(
    'sp_entity_id', 'https://api.avir.space/saml/' || coalesce(v_org::text,'org'),
    'acs_url', 'https://api.avir.space/auth/v1/sso/saml/acs',
    'metadata_url', 'https://api.avir.space/auth/v1/sso/saml/metadata',
    'oidc_redirect_uri', 'https://api.avir.space/auth/v1/callback',
    'name_id_format', 'urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress');
end $$;
grant execute on function public.get_sp_metadata() to authenticated;

-- ── webhooks ──
create or replace function public.register_webhook(p_url text, p_events text[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid := public._caller_org(); v_secret text; v_id uuid;
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  v_secret := 'whsec_' || encode(gen_random_bytes(24), 'hex');
  insert into public.webhook_subscriptions (org_id, target_url, events, signing_secret, created_by_user_id)
  values (v_org, p_url, coalesce(p_events, '{}'), v_secret, auth.uid()) returning id into v_id;
  perform public.log_audit_event(v_org, 'admin_action', 'Webhook registered', jsonb_build_object('url', p_url, 'events', p_events), 20);
  return jsonb_build_object('id', v_id, 'signing_secret', v_secret, 'note', 'Store this secret — used to verify webhook HMAC signatures.');
end $$;
grant execute on function public.register_webhook(text, text[]) to authenticated;

create or replace function public.get_webhooks()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'target_url', target_url, 'events', events, 'is_active', is_active, 'last_delivery_at_utc', last_delivery_at_utc, 'last_delivery_status', last_delivery_status, 'created_at_utc', created_at_utc))
    from public.webhook_subscriptions where org_id = v_org), '[]'::jsonb);
end $$;
grant execute on function public.get_webhooks() to authenticated;

-- ── audit reads ──
create or replace function public.get_audit_events(p_type text default null, p_days int default 30, p_limit int default 300)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select id, user_id, event_type, event_summary, event_payload, risk_score, ip_address::text, created_at_utc
    from public.security_audit_events where org_id = v_org and created_at_utc > now() - (p_days || ' days')::interval
      and (p_type is null or event_type = p_type)
    order by created_at_utc desc limit p_limit) t), '[]'::jsonb);
end $$;
grant execute on function public.get_audit_events(text, int, int) to authenticated;
