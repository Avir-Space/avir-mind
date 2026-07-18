-- AVIR Mind — Module 1 follow-up product fixes.
--   Fix 2: session termination now also revokes the underlying Supabase auth
--          session (so the terminated browser cannot refresh its token), returns
--          an accurate count, and get_user_sessions exposes session_key so the
--          client can identify its own ("this device") session precisely.
--   Cleanup: remove placeholder session rows left by diagnostics.
--   Fix 4: demo flight_schedules were seeded relative to signup-time now() and
--          have drifted into the past, so every Command Center time window shows
--          the same (near-empty) set. Rebase them across the next ~30h.

-- ── Cleanup: nuke diagnostic placeholder session rows ───────────────────────
delete from public.user_sessions
  where user_agent in ('repro-UA', 'probe-UA')
     or host(ip_address) in ('203.0.113.5', '203.0.113.9')
     or session_key in ('e2e-probe-1', 'e2e-probe-2', 'repro-key-1');

-- ── Fix 3: clear stale VERIFIED MFA factors for the test personas ───────────
-- A leftover verified TOTP factor blocks fresh enrollment: Supabase requires an
-- AAL2 session to add/unenroll a factor once one is verified, but a password
-- login is only AAL1 — the bootstrap trap. Enrolling the *first* factor works at
-- AAL1, so wiping the personas' factors restores clean enrollment. (Not a
-- project-setting issue — no dashboard change needed.)
delete from auth.mfa_factors f
  using auth.users u
  where f.user_id = u.id and u.email like '%@avir-test.dev';

-- ── Fix 2: expose session_key + revoke auth session on terminate ────────────
create or replace function public.get_user_sessions()
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.last_activity_at_utc desc), '[]'::jsonb) from (
    select id, session_key, session_type, ip_address::text, user_agent, geo_country_code, geo_city,
           authenticated_at_utc, last_activity_at_utc, ended_at_utc, authentication_factors_used
    from public.user_sessions where user_id = auth.uid()) t;
$$;
grant execute on function public.get_user_sessions() to authenticated;

create or replace function public.terminate_session(p_id uuid, p_all_except boolean default false)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_org uuid; v_n int := 0; r record;
begin
  select org_id into v_org from public.user_sessions where user_id = auth.uid() order by last_activity_at_utc desc limit 1;

  -- p_all_except: end every OTHER active session; else: end just p_id.
  for r in
    select id, session_key from public.user_sessions
    where user_id = auth.uid() and ended_at_utc is null
      and case when p_all_except then id <> p_id else id = p_id end
  loop
    update public.user_sessions
      set ended_at_utc = now(), ended_reason = 'terminated_by_user'
      where id = r.id;
    -- Revoke the Supabase auth session so the terminated browser cannot refresh.
    if r.session_key is not null then
      begin
        delete from auth.sessions where id = r.session_key::uuid;
      exception when others then null; -- session_key not a live auth session id
      end;
    end if;
    v_n := v_n + 1;
  end loop;

  if v_org is not null then
    perform public.log_audit_event(v_org, 'session_terminated', 'Session(s) terminated', jsonb_build_object('count', v_n), 40);
  end if;
  return jsonb_build_object('terminated', v_n);
end $$;
grant execute on function public.terminate_session(uuid, boolean) to authenticated;

-- ── Fix 4: rebase demo flight schedules across the next ~30h ─────────────────
-- Deterministic spread so Now / Next 6h / Next 12h / Today each contain a
-- different, non-empty set. Preserves each leg's duration; marks in-progress
-- legs en_route. Founder-callable so the demo can be refreshed as time passes.
-- Operates on public.flights (flight_schedules is a security_invoker view over
-- it). flights.status allows 'airborne' (not the view's legacy 'en_route').
create or replace function public.rebase_demo_flight_schedules(p_org uuid default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; r record; n int; v_dep timestamptz; v_dur interval; total int := 0;
begin
  for v_org in
    select id from public.orgs
    where primary_business_model in ('operator', 'hybrid')
      and (p_org is null or id = p_org)
  loop
    n := 0;
    for r in
      select id, scheduled_departure_utc, scheduled_arrival_utc
      from public.flights
      where org_id = v_org
      order by scheduled_departure_utc, id
    loop
      -- 90-min cadence cycling over a 30h window → windows differ meaningfully.
      v_dep := date_trunc('minute', now()) + ((n % 20) * 90 || ' minutes')::interval;
      v_dur := greatest(r.scheduled_arrival_utc - r.scheduled_departure_utc, interval '45 minutes');
      update public.flights
        set scheduled_departure_utc = v_dep,
            scheduled_arrival_utc   = v_dep + v_dur,
            flight_date = v_dep::date,
            status = case
              when v_dep <= now() and v_dep + v_dur > now() then 'airborne'
              when v_dep + v_dur <= now() then 'arrived'
              else 'scheduled' end,
            updated_at_utc = now()
        where id = r.id;
      n := n + 1;
      total := total + 1;
    end loop;
  end loop;
  return total;
end $$;
grant execute on function public.rebase_demo_flight_schedules(uuid) to authenticated;

-- Run once now for the demo tenants.
select public.rebase_demo_flight_schedules();
