-- AVIR Mind — E2E follow-ups:
--   Product gap 1: the MRO demo tenant had enabled_modules = '{}'. Nav is gated
--     by business model (so MRO items already render), but the org config should
--     advertise its enabled modules for downstream features + spec conformance.
--   Product gap 2: user_sessions were seeded but never written on real sign-in.
--     Add a browser-session key + an upsert RPC the middleware calls on every
--     authenticated navigation (insert-on-first-request, touch last_activity,
--     and signal terminated sessions so the middleware can bounce them).

-- ── Gap 1: advertise the MRO tenant's enabled modules ───────────────────────
update public.orgs
  set enabled_modules  = array['customers','contracts','shop_floor','work_packages'],
      default_view_lens = 'customer_service'
  where primary_business_model = 'mro';

-- ── Gap 2: browser-session tracking ─────────────────────────────────────────
-- A stable per-browser key (the Supabase auth session id from the JWT). Lets the
-- middleware upsert exactly one row per browser session instead of per request.
alter table public.user_sessions add column if not exists session_key text;
create unique index if not exists usess_user_key_uidx
  on public.user_sessions (user_id, session_key) where session_key is not null;

-- Upsert the caller's web session. Called from Next middleware on authed
-- navigations. Returns whether the session has been terminated so the caller
-- can end it. SECURITY DEFINER: writes the caller's own row (auth.uid()).
create or replace function public.sync_web_session(
  p_session_key  text,
  p_user_agent   text   default null,
  p_ip           text   default null,
  p_factors      text[] default array['password'],
  p_country      text   default null,
  p_city         text   default null,
  p_session_type text   default 'web'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_ip    inet;
  v_id    uuid;
  v_ended timestamptz;
begin
  if v_uid is null or p_session_key is null or p_session_key = '' then
    return jsonb_build_object('ok', false);
  end if;

  -- Parse the forwarded IP defensively — a malformed value must not error the call.
  begin
    v_ip := nullif(p_ip, '')::inet;
  exception when others then
    v_ip := null;
  end;

  select id, ended_at_utc into v_id, v_ended
    from public.user_sessions
    where user_id = v_uid and session_key = p_session_key;

  if v_id is null then
    v_org := public._caller_org();
    insert into public.user_sessions (
      user_id, org_id, session_key, session_type, ip_address, user_agent,
      geo_country_code, geo_city, authenticated_at_utc, last_activity_at_utc,
      expires_at_utc, authentication_factors_used)
    values (
      v_uid, v_org, p_session_key, p_session_type, v_ip, p_user_agent,
      p_country, p_city, now(), now(),
      now() + interval '24 hours', coalesce(p_factors, array['password']))
    on conflict (user_id, session_key) where session_key is not null do nothing;
    return jsonb_build_object('ok', true, 'terminated', false, 'created', true);
  end if;

  if v_ended is not null then
    return jsonb_build_object('ok', true, 'terminated', true);
  end if;

  update public.user_sessions
    set last_activity_at_utc = now(),
        ip_address  = coalesce(v_ip, ip_address),
        user_agent  = coalesce(p_user_agent, user_agent),
        -- keep the strongest factor set seen (e.g. upgrade to include 2fa_totp)
        authentication_factors_used = case
          when coalesce(array_length(p_factors, 1), 0) > coalesce(array_length(authentication_factors_used, 1), 0)
          then p_factors else authentication_factors_used end
    where id = v_id;

  return jsonb_build_object('ok', true, 'terminated', false);
end $$;
grant execute on function public.sync_web_session(text, text, text, text[], text, text, text) to authenticated;
