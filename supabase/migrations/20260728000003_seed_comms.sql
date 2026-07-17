-- AVIR Mind — Phase 11: communications seed.
-- 1103: 8 org roles, role assignments, per-user channels (in-app + email +
-- sms), an on-call schedule with shifts, 3 default policies, historical
-- notification_events (including an escalation chain + unacknowledged items so
-- the badge and Active tab have data), and a daily digest. Wired into signup.

create or replace function public.seed_demo_comms(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_dom uuid; v_line uuid; v_ops uuid; v_comp uuid; v_disp uuid;
  v_sched uuid; v_pol_aog uuid; v_pol_disp uuid; v_pol_comp uuid;
  v_parent uuid; r record; i int; v_sig uuid;
begin
  if p_org_id is null or p_user_id is null then return; end if;
  delete from public.notification_events where org_id = p_org_id;
  delete from public.notification_digests where org_id = p_org_id;
  delete from public.notification_policies where org_id = p_org_id;
  delete from public.on_call_shifts where org_id = p_org_id;
  delete from public.on_call_schedules where org_id = p_org_id;
  delete from public.user_role_assignments where org_id = p_org_id;
  delete from public.notification_channels where org_id = p_org_id;
  delete from public.org_roles where org_id = p_org_id;

  select email into v_email from auth.users where id = p_user_id;

  -- ── 8 org roles ──
  insert into public.org_roles (org_id, role_code, role_display_name, role_description, typical_shift_pattern) values
    (p_org_id, 'line_maintenance', 'Line Maintenance', 'Line technicians at station', 'day_shift'),
    (p_org_id, 'base_maintenance', 'Base Maintenance', 'Hangar / base maintenance', 'day_shift'),
    (p_org_id, 'quality_assurance', 'Quality Assurance', 'QA inspectors', 'business_hours'),
    (p_org_id, 'compliance_officer', 'Compliance Officer', 'Airworthiness & regulatory', 'business_hours'),
    (p_org_id, 'ops_control', 'Operations Control', 'OCC / MOC', '24_7_on_call'),
    (p_org_id, 'dispatcher', 'Dispatcher', 'Flight dispatch', '24_7_on_call'),
    (p_org_id, 'chief_pilot', 'Chief Pilot', 'Chief pilot', 'business_hours'),
    (p_org_id, 'director_of_maintenance', 'Director of Maintenance', 'DOM — accountable manager', 'business_hours')
  on conflict do nothing;

  select id into v_dom from public.org_roles where org_id = p_org_id and role_code = 'director_of_maintenance';
  select id into v_line from public.org_roles where org_id = p_org_id and role_code = 'line_maintenance';
  select id into v_ops from public.org_roles where org_id = p_org_id and role_code = 'ops_control';
  select id into v_comp from public.org_roles where org_id = p_org_id and role_code = 'compliance_officer';
  select id into v_disp from public.org_roles where org_id = p_org_id and role_code = 'dispatcher';

  -- ── role assignments (single-user demo org → owner holds the key roles) ──
  insert into public.user_role_assignments (org_id, user_id, role_id, is_primary) values
    (p_org_id, p_user_id, v_dom, true), (p_org_id, p_user_id, v_line, false),
    (p_org_id, p_user_id, v_ops, false), (p_org_id, p_user_id, v_comp, false);

  -- ── channels for the owner ──
  insert into public.notification_channels (org_id, user_id, channel_type, channel_address, verification_status, verified_at_utc, is_active, emergency_override)
    values (p_org_id, p_user_id, 'in_app', 'in_app', 'verified', now(), true, true);
  if v_email is not null then
    insert into public.notification_channels (org_id, user_id, channel_type, channel_address, verification_status, verified_at_utc, is_active, emergency_override)
      values (p_org_id, p_user_id, 'email', v_email, 'verified', now(), true, true);
  end if;
  insert into public.notification_channels (org_id, user_id, channel_type, channel_address, verification_status, is_active, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, emergency_override)
    values (p_org_id, p_user_id, 'sms', '+1-555-0100', 'pending', true, '22:00', '06:00', 'UTC', true);

  -- ── on-call schedule for line maintenance ──
  insert into public.on_call_schedules (org_id, role_id, schedule_name, rotation_pattern)
    values (p_org_id, v_line, 'Line Maintenance — Weekly Rotation', jsonb_build_object('type','weekly','handover_day','monday','handover_time','08:00'))
    returning id into v_sched;
  insert into public.on_call_shifts (org_id, schedule_id, user_id, shift_start_utc, shift_end_utc, shift_type) values
    (p_org_id, v_sched, p_user_id, date_trunc('day', now()) - interval '2 days', date_trunc('day', now()) + interval '5 days', 'primary'),
    (p_org_id, v_sched, p_user_id, date_trunc('day', now()) - interval '2 days', date_trunc('day', now()) + interval '5 days', 'secondary'),
    (p_org_id, v_sched, p_user_id, date_trunc('day', now()) + interval '5 days', date_trunc('day', now()) + interval '12 days', 'primary');

  -- ── 3 default policies ──
  insert into public.notification_policies (org_id, policy_name, event_type, filter_criteria, target_role_ids, channel_preferences, escalation_ladder, quiet_hours_behavior, created_by_user_id)
  values (p_org_id, 'AOG — Critical', 'aog_declared', '{}'::jsonb, array[v_ops, v_dom, v_line],
    '{"critical":["sms","email","in_app"],"high":["email","in_app"],"default":["in_app"]}'::jsonb,
    '[{"after_minutes":5,"shift_type":"secondary"},{"after_minutes":10,"role_code":"director_of_maintenance"}]'::jsonb,
    'override', p_user_id)
  returning id into v_pol_aog;

  insert into public.notification_policies (org_id, policy_name, event_type, filter_criteria, target_role_ids, channel_preferences, escalation_ladder, quiet_hours_behavior, created_by_user_id)
  values (p_org_id, 'Dispatch-blocking — Urgent', 'task_created', '{}'::jsonb, array[v_line, v_ops],
    '{"high":["email","in_app"],"critical":["sms","email","in_app"],"default":["in_app"]}'::jsonb,
    '[{"after_minutes":15,"role_code":"director_of_maintenance"}]'::jsonb, 'respect', p_user_id)
  returning id into v_pol_disp;

  insert into public.notification_policies (org_id, policy_name, event_type, filter_criteria, target_role_ids, channel_preferences, escalation_ladder, quiet_hours_behavior, created_by_user_id)
  values (p_org_id, 'Compliance deadline reminder', 'ad_deadline_approaching', '{}'::jsonb, array[v_comp, v_dom],
    '{"high":["email","in_app"],"medium":["in_app"],"default":["in_app"]}'::jsonb, '[]'::jsonb, 'respect', p_user_id)
  returning id into v_pol_comp;

  -- ── historical notification_events ──
  -- tie a few to real active signals so the signal-card footer lights up
  i := 0;
  for r in select id, severity, category, title from public.signals where org_id = p_org_id and is_active order by generated_at_utc desc limit 6 loop
    i := i + 1; v_sig := r.id;
    insert into public.notification_events (org_id, policy_id, trigger_source_type, trigger_source_id, recipient_user_id, recipient_role_id, channel_type, channel_address, notification_content, delivery_status, severity, sent_at_utc, delivered_at_utc, acknowledged_at_utc, acknowledgment_channel)
    values (p_org_id, v_pol_disp, 'signal', v_sig, p_user_id, v_line,
      case when i % 3 = 0 then 'email' else 'in_app' end, coalesce(v_email,'in_app'),
      jsonb_build_object('subject', r.title, 'body', 'Signal requires attention.', 'event_type', 'signal_created'),
      case when i <= 2 then 'delivered' else 'acknowledged' end, coalesce(r.severity,'medium'),
      now() - ((i * 4) || ' hours')::interval, now() - ((i * 4) || ' hours')::interval,
      case when i <= 2 then null else now() - ((i * 4 - 1) || ' hours')::interval end,
      case when i <= 2 then null else 'in_app' end);
  end loop;

  -- an AOG escalation chain: parent delivered + unacknowledged, child escalation
  insert into public.notification_events (org_id, policy_id, trigger_source_type, trigger_source_id, recipient_user_id, recipient_role_id, channel_type, channel_address, notification_content, delivery_status, severity, sent_at_utc, delivered_at_utc)
  values (p_org_id, v_pol_aog, 'task', gen_random_uuid(), p_user_id, v_ops, 'sms', '+1-555-0100',
    jsonb_build_object('subject', 'AOG declared — N738AV at DEN', 'body', 'Aircraft on ground; immediate action required.', 'event_type', 'aog_declared'),
    'delivered', 'critical', now() - interval '22 minutes', now() - interval '22 minutes')
  returning id into v_parent;
  insert into public.notification_events (org_id, policy_id, trigger_source_type, trigger_source_id, recipient_user_id, recipient_role_id, channel_type, channel_address, notification_content, delivery_status, severity, sent_at_utc, delivered_at_utc, escalation_of_notification_id)
  values (p_org_id, v_pol_aog, 'task', (select trigger_source_id from public.notification_events where id = v_parent), p_user_id, v_dom, 'sms', '+1-555-0100',
    jsonb_build_object('subject', 'ESCALATION: AOG declared — N738AV at DEN', 'body', 'No acknowledgment within 5 minutes — escalated to Director of Maintenance.', 'event_type', 'aog_declared', 'escalated', true),
    'delivered', 'critical', now() - interval '16 minutes', now() - interval '16 minutes', v_parent);

  -- a deferred (quiet-hours) queued notification
  insert into public.notification_events (org_id, policy_id, trigger_source_type, trigger_source_id, recipient_user_id, recipient_role_id, channel_type, channel_address, notification_content, delivery_status, severity)
  values (p_org_id, v_pol_comp, 'signal', gen_random_uuid(), p_user_id, v_comp, 'in_app', 'in_app',
    jsonb_build_object('subject', 'AD 2024-30-URGENT due in 12d', 'body', 'Compliance deadline approaching.', 'event_type', 'ad_deadline_approaching', 'deferred', true),
    'queued', 'high');

  -- ── a daily digest ──
  insert into public.notification_digests (org_id, recipient_user_id, digest_type, period_start_utc, period_end_utc, content, sent_at_utc, delivery_status)
  values (p_org_id, p_user_id, 'daily_briefing', now() - interval '1 day', now(),
    jsonb_build_object(
      'headline', 'Daily briefing — ' || to_char(now(), 'Mon DD'),
      'signals_new', (select count(*) from public.signals where org_id = p_org_id and is_active and generated_at_utc > now() - interval '1 day'),
      'tasks_open', (select count(*) from public.tasks where org_id = p_org_id and status <> 'done'),
      'sections', jsonb_build_array(
        jsonb_build_object('title', 'Critical & high signals', 'items', jsonb_build_array('Weather impact into LHR (IFR)', 'AD 2024-30-URGENT due in 12 days')),
        jsonb_build_object('title', 'Dispatch-blocking tasks', 'items', jsonb_build_array('MEL rectification due in 2 days on N320AV')))),
    now() - interval '6 hours', 'delivered');
end $$;
grant execute on function public.seed_demo_comms(uuid, uuid) to authenticated, anon, service_role;

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
      -- comms last: it references the signals/roles created above.
      perform public.seed_demo_comms(v_org, new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select o.id as org_id, (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id from public.orgs o loop
    if r.user_id is not null then
      perform public.seed_demo_comms(r.org_id, r.user_id);
    end if;
  end loop;
end $$;
