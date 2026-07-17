-- AVIR Mind — Phase 11: policy evaluation, on-call, escalation, RPCs, triggers.
-- 1102. Policy evaluation runs in-DB (deterministic SQL) so a signal/task INSERT
-- resolves recipients + channels + quiet-hours synchronously and enqueues
-- notification_events; delivery is handled by the send-notification edge function.

alter table public.notification_channels add column if not exists muted_until_utc timestamptz;

-- ── on-call resolution: who is primary on-call for a role right now ──
create or replace function public.get_on_call_current_shift(p_role_id uuid, p_at timestamptz default now())
returns uuid language sql stable security invoker set search_path = public as $$
  select s.user_id from public.on_call_shifts s
  join public.on_call_schedules sc on sc.id = s.schedule_id
  where sc.role_id = p_role_id and s.shift_start_utc <= p_at and s.shift_end_utc > p_at and s.shift_type = 'primary'
  order by s.shift_start_utc desc limit 1;
$$;
grant execute on function public.get_on_call_current_shift(uuid, timestamptz) to authenticated;

-- ── resolve policy recipients → set of (user_id, role_id) ──
create or replace function public._resolve_policy_recipients(p_org uuid, p_role_ids uuid[], p_user_ids uuid[])
returns table (user_id uuid, role_id uuid) language plpgsql stable security definer set search_path = public as $$
declare r uuid; oncall uuid;
begin
  -- explicit users
  if p_user_ids is not null then
    return query select u, null::uuid from unnest(p_user_ids) u;
  end if;
  -- roles: on-call substitution if a schedule exists, else all active holders
  if p_role_ids is not null then
    foreach r in array p_role_ids loop
      oncall := public.get_on_call_current_shift(r);
      if oncall is not null then
        return query select oncall, r;
      else
        return query select ura.user_id, r from public.user_role_assignments ura
          where ura.org_id = p_org and ura.role_id = r
            and ura.effective_from_utc <= now() and (ura.effective_to_utc is null or ura.effective_to_utc > now());
      end if;
    end loop;
  end if;
end $$;

-- ── channel list for a severity from channel_preferences ──
create or replace function public._channels_for_severity(p_prefs jsonb, p_severity text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(
    (select array_agg(x) from jsonb_array_elements_text(p_prefs -> coalesce(p_severity,'medium')) x),
    (select array_agg(x) from jsonb_array_elements_text(p_prefs -> 'default') x),
    array['in_app']);
$$;

-- ── filter matcher: does the event context satisfy the policy filter? ──
create or replace function public._policy_matches(p_filter jsonb, p_context jsonb)
returns boolean language sql immutable set search_path = public as $$
  select
    (not (p_filter ? 'severity') or p_context->>'severity' = any(select jsonb_array_elements_text(p_filter->'severity')))
    and (not (p_filter ? 'category') or p_context->>'category' = any(select jsonb_array_elements_text(p_filter->'category')))
    and (not (p_filter ? 'aircraft_type') or p_context->>'aircraft_type' = any(select jsonb_array_elements_text(p_filter->'aircraft_type')))
    and (not (p_filter ? 'station') or p_context->>'station' = any(select jsonb_array_elements_text(p_filter->'station')));
$$;

-- ── core evaluator ──
create or replace function public.evaluate_notification_policies(p_org uuid, p_event_type text, p_source_type text, p_source_id uuid, p_context jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pol record; rec record; chan record; ch text; v_created int := 0; v_targets jsonb := '[]'::jsonb;
  v_sev text := coalesce(p_context->>'severity','medium'); v_suppress boolean; v_now time; v_deferred boolean;
  v_subject text; v_body text;
begin
  for pol in select * from public.notification_policies where org_id = p_org and event_type = p_event_type and is_active loop
    if not public._policy_matches(pol.filter_criteria, p_context) then continue; end if;

    for rec in select * from public._resolve_policy_recipients(p_org, pol.target_role_ids, pol.target_user_ids) loop
      foreach ch in array public._channels_for_severity(pol.channel_preferences, v_sev) loop
        for chan in select * from public.notification_channels c
          where c.org_id = p_org and c.user_id = rec.user_id and c.channel_type = ch and c.is_active loop

          -- quiet hours + mute evaluation
          v_suppress := false; v_deferred := false;
          if chan.muted_until_utc is not null and chan.muted_until_utc > now() then v_suppress := true; end if;
          if chan.quiet_hours_start is not null and chan.quiet_hours_end is not null then
            v_now := (now() at time zone coalesce(chan.quiet_hours_timezone,'UTC'))::time;
            if (chan.quiet_hours_start <= chan.quiet_hours_end and v_now >= chan.quiet_hours_start and v_now < chan.quiet_hours_end)
               or (chan.quiet_hours_start > chan.quiet_hours_end and (v_now >= chan.quiet_hours_start or v_now < chan.quiet_hours_end)) then
              v_suppress := true;
            end if;
          end if;
          -- override: critical + emergency_override, or policy overrides
          if v_suppress and ((v_sev = 'critical' and chan.emergency_override) or pol.quiet_hours_behavior = 'override') then
            v_suppress := false;
          elsif v_suppress and pol.quiet_hours_behavior = 'defer_until_hours_end' then
            v_suppress := false; v_deferred := true;
          end if;
          if v_suppress then continue; end if;

          v_targets := v_targets || jsonb_build_object('user_id', rec.user_id, 'role_id', rec.role_id, 'channel_type', ch, 'channel_address', chan.channel_address, 'deferred', v_deferred);
          if not p_dry_run then
            v_subject := coalesce(p_context->>'title', initcap(replace(p_event_type,'_',' ')));
            v_body := coalesce(p_context->>'narrative', 'An event requires your attention.');
            insert into public.notification_events (org_id, policy_id, trigger_source_type, trigger_source_id, recipient_user_id, recipient_role_id, channel_type, channel_address, notification_content, delivery_status, severity)
            values (p_org, pol.id, p_source_type, p_source_id, rec.user_id, rec.role_id, ch, chan.channel_address,
              jsonb_build_object('subject', v_subject, 'body', v_body, 'event_type', p_event_type, 'deferred', v_deferred, 'source_type', p_source_type),
              'queued', v_sev);
            v_created := v_created + 1;
          end if;
        end loop;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('policies_evaluated', true, 'created', v_created, 'targets', v_targets, 'dry_run', p_dry_run);
end $$;
grant execute on function public.evaluate_notification_policies(uuid, text, text, uuid, jsonb, boolean) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Triggers — only fire for real-time (recent, active) signals/tasks, so the
-- historical seed backfill never floods notifications.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.tg_notify_signal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_active and new.generated_at_utc > now() - interval '10 minutes' then
    perform public.evaluate_notification_policies(new.org_id, 'signal_created', 'signal', new.id,
      jsonb_build_object('severity', new.severity, 'category', new.category, 'title', new.title, 'narrative', new.narrative,
        'aircraft_type', (select aircraft_type from public.aircraft where id = new.aircraft_id)));
  end if;
  return new;
end $$;
drop trigger if exists signals_notify on public.signals;
create trigger signals_notify after insert on public.signals for each row execute function public.tg_notify_signal();

create or replace function public.tg_notify_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_evt text; v_sev text;
begin
  if tg_op = 'INSERT' then
    if new.aog then v_evt := 'aog_declared'; v_sev := 'critical';
    elsif new.dispatch_blocking then v_evt := 'task_created'; v_sev := 'high';
    else return new; end if;
  else
    if new.status = 'blocked' and coalesce(old.status,'') <> 'blocked' then v_evt := 'task_status_changed'; v_sev := 'high';
    else return new; end if;
  end if;
  perform public.evaluate_notification_policies(new.org_id, v_evt, 'task', new.id,
    jsonb_build_object('severity', v_sev, 'category', new.parent_type, 'title', new.title, 'narrative', coalesce(new.why_summary, new.title),
      'station', new.station_code, 'aircraft_type', (select aircraft_type from public.aircraft where id = new.aircraft_id)));
  return new;
end $$;
drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update of status on public.tasks for each row execute function public.tg_notify_task();

-- ═════════════════════════════════════════════════════════════════════════════
-- Escalation processor — unacknowledged events past their ladder threshold get a
-- chained escalation event. Intended to run every minute (cron below).
-- escalation_ladder: [{"after_minutes":5,"shift_type":"secondary"},{"after_minutes":10,"role_code":"director_of_maintenance"}]
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.process_notification_escalations()
returns int language plpgsql security definer set search_path = public as $$
declare e record; rung jsonb; mins int; v_next uuid; v_count int := 0; v_role uuid;
begin
  for e in
    select ne.*, np.escalation_ladder, np.org_id as pol_org
    from public.notification_events ne join public.notification_policies np on np.id = ne.policy_id
    where ne.acknowledged_at_utc is null and ne.escalation_of_notification_id is null
      and ne.delivery_status in ('delivered','queued','sending','retried')
      and jsonb_array_length(coalesce(np.escalation_ladder,'[]'::jsonb)) > 0
      and not exists (select 1 from public.notification_events c where c.escalation_of_notification_id = ne.id)
  loop
    rung := e.escalation_ladder->0;
    mins := coalesce((rung->>'after_minutes')::int, 5);
    if now() < e.created_at_utc + (mins || ' minutes')::interval then continue; end if;

    -- resolve the next recipient: a role_code, or the secondary on-call for the same role
    v_next := null;
    if rung ? 'role_code' then
      select o.id into v_role from public.org_roles o where o.org_id = e.org_id and o.role_code = rung->>'role_code';
      if v_role is not null then v_next := public.get_on_call_current_shift(v_role);
        if v_next is null then select ura.user_id into v_next from public.user_role_assignments ura where ura.org_id = e.org_id and ura.role_id = v_role limit 1; end if;
      end if;
    elsif rung ? 'shift_type' and e.recipient_role_id is not null then
      select s.user_id into v_next from public.on_call_shifts s join public.on_call_schedules sc on sc.id = s.schedule_id
        where sc.role_id = e.recipient_role_id and s.shift_type = rung->>'shift_type' and s.shift_start_utc <= now() and s.shift_end_utc > now() limit 1;
    end if;
    if v_next is null then continue; end if;

    insert into public.notification_events (org_id, policy_id, trigger_source_type, trigger_source_id, recipient_user_id, recipient_role_id, channel_type, channel_address, notification_content, delivery_status, severity, escalation_of_notification_id)
    select e.org_id, e.policy_id, e.trigger_source_type, e.trigger_source_id, v_next, coalesce(v_role, e.recipient_role_id),
      c.channel_type, c.channel_address,
      (e.notification_content || jsonb_build_object('escalated', true, 'subject', 'ESCALATION: ' || coalesce(e.notification_content->>'subject','notification'))),
      'queued', e.severity, e.id
    from public.notification_channels c where c.org_id = e.org_id and c.user_id = v_next and c.is_active order by (c.channel_type='sms') desc limit 1;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
grant execute on function public.process_notification_escalations() to authenticated, service_role;

-- Best-effort: schedule the escalation processor every minute if pg_cron exists.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('avir-escalations', '* * * * *', 'select public.process_notification_escalations();');
    exception when others then raise notice 'pg_cron scheduling skipped: %', sqlerrm;
    end;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- RPCs
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.acknowledge_notification(p_id uuid, p_channel text default 'in_app')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.notification_events where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.notification_events set delivery_status = 'acknowledged', acknowledged_at_utc = now(), acknowledgment_channel = p_channel where id = p_id;
  return jsonb_build_object('id', p_id, 'acknowledged', true);
end $$;
grant execute on function public.acknowledge_notification(uuid, text) to authenticated;

create or replace function public.escalate_notification(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_n int;
begin
  select org_id into v_org from public.notification_events where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  -- force the ladder check to run now by pretending the threshold passed: temporarily set created back is unsafe;
  -- instead run the processor which will pick it up if past threshold. For a manual escalate, run processor.
  v_n := public.process_notification_escalations();
  return jsonb_build_object('escalations_created', v_n);
end $$;
grant execute on function public.escalate_notification(uuid) to authenticated;

create or replace function public.create_notification_policy(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  insert into public.notification_policies (org_id, policy_name, event_type, filter_criteria, target_role_ids, target_user_ids, channel_preferences, escalation_ladder, quiet_hours_behavior, is_active, created_by_user_id)
  values (v_org, p->>'policy_name', p->>'event_type', coalesce(p->'filter_criteria','{}'::jsonb),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'target_role_ids') x), '{}'),
    coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'target_user_ids') x), '{}'),
    coalesce(p->'channel_preferences','{}'::jsonb), coalesce(p->'escalation_ladder','[]'::jsonb),
    coalesce(p->>'quiet_hours_behavior','respect'), coalesce((p->>'is_active')::boolean, true), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_notification_policy(jsonb) to authenticated;

create or replace function public.update_notification_policy(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.notification_policies where id = p_id;
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  update public.notification_policies set
    policy_name = coalesce(p->>'policy_name', policy_name),
    filter_criteria = coalesce(p->'filter_criteria', filter_criteria),
    target_role_ids = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'target_role_ids') x), target_role_ids),
    channel_preferences = coalesce(p->'channel_preferences', channel_preferences),
    escalation_ladder = coalesce(p->'escalation_ladder', escalation_ladder),
    quiet_hours_behavior = coalesce(p->>'quiet_hours_behavior', quiet_hours_behavior),
    is_active = coalesce((p->>'is_active')::boolean, is_active), updated_at_utc = now()
  where id = p_id;
  return p_id;
end $$;
grant execute on function public.update_notification_policy(uuid, jsonb) to authenticated;

-- Dry-run: show who would be notified without sending.
create or replace function public.test_notification_policy(p_id uuid, p_context jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pol public.notification_policies; v_ctx jsonb;
begin
  select * into pol from public.notification_policies where id = p_id;
  if pol.id is null or not public.is_org_member(pol.org_id) then raise exception 'not authorized'; end if;
  v_ctx := coalesce(nullif(p_context,'{}'::jsonb), jsonb_build_object('severity', 'critical'));
  return public.evaluate_notification_policies(pol.org_id, pol.event_type, 'test', gen_random_uuid(), v_ctx, true);
end $$;
grant execute on function public.test_notification_policy(uuid, jsonb) to authenticated;

create or replace function public.get_user_notification_preferences()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'channels', coalesce((select jsonb_agg(to_jsonb(c) order by c.channel_type) from public.notification_channels c where c.user_id = auth.uid() and c.org_id = v_org), '[]'::jsonb),
    'digests', coalesce((select jsonb_agg(jsonb_build_object('digest_type', d.digest_type, 'sent_at_utc', d.sent_at_utc) order by d.created_at_utc desc) from public.notification_digests d where d.recipient_user_id = auth.uid() and d.org_id = v_org limit 10), '[]'::jsonb));
end $$;
grant execute on function public.get_user_notification_preferences() to authenticated;

create or replace function public.update_user_notification_channels(p_channel_type text, p_address text, p_attrs jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.notification_channels (org_id, user_id, channel_type, channel_address, is_active, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, emergency_override, verification_status)
  values (v_org, auth.uid(), p_channel_type, p_address, coalesce((p_attrs->>'is_active')::boolean, true),
    (p_attrs->>'quiet_hours_start')::time, (p_attrs->>'quiet_hours_end')::time, p_attrs->>'quiet_hours_timezone',
    coalesce((p_attrs->>'emergency_override')::boolean, true), case when p_channel_type = 'in_app' then 'verified' else 'pending' end)
  on conflict (user_id, channel_type, channel_address) do update set
    is_active = excluded.is_active, quiet_hours_start = excluded.quiet_hours_start, quiet_hours_end = excluded.quiet_hours_end,
    quiet_hours_timezone = excluded.quiet_hours_timezone, emergency_override = excluded.emergency_override, updated_at_utc = now()
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.update_user_notification_channels(text, text, jsonb) to authenticated;

create or replace function public.verify_notification_channel(p_channel_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.notification_channels where id = p_channel_id and user_id = auth.uid();
  if v_org is null then raise exception 'not authorized'; end if;
  -- Demo: mark verified. (Production sends a code via send-notification and confirms.)
  update public.notification_channels set verification_status = 'verified', verified_at_utc = now(), updated_at_utc = now() where id = p_channel_id;
  return jsonb_build_object('id', p_channel_id, 'verified', true);
end $$;
grant execute on function public.verify_notification_channel(uuid) to authenticated;

create or replace function public.mute_notifications_temporarily(p_minutes int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then raise exception 'no org'; end if;
  update public.notification_channels set muted_until_utc = now() + (p_minutes || ' minutes')::interval, updated_at_utc = now()
    where user_id = auth.uid() and org_id = v_org and channel_type <> 'in_app';
  return jsonb_build_object('muted_until_utc', now() + (p_minutes || ' minutes')::interval);
end $$;
grant execute on function public.mute_notifications_temporarily(int) to authenticated;

create or replace function public.get_notification_history(p_status text default null, p_channel text default null, p_days int default 7, p_limit int default 200)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select ne.id, ne.trigger_source_type, ne.trigger_source_id, ne.channel_type, ne.severity, ne.delivery_status,
      ne.notification_content, ne.created_at_utc, ne.sent_at_utc, ne.delivered_at_utc, ne.acknowledged_at_utc,
      ne.escalation_of_notification_id, r.role_display_name as role_name
    from public.notification_events ne left join public.org_roles r on r.id = ne.recipient_role_id
    where ne.org_id = v_org and ne.recipient_user_id = auth.uid()
      and ne.created_at_utc > now() - (p_days || ' days')::interval
      and (p_status is null or ne.delivery_status = p_status)
      and (p_channel is null or ne.channel_type = p_channel)
    order by ne.created_at_utc desc limit p_limit) t), '[]'::jsonb);
end $$;
grant execute on function public.get_notification_history(text, text, int, int) to authenticated;

create or replace function public.get_notification_badge()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return jsonb_build_object('unacknowledged', 0); end if;
  return jsonb_build_object('unacknowledged', (
    select count(*) from public.notification_events where org_id = v_org and recipient_user_id = auth.uid()
      and acknowledged_at_utc is null and delivery_status in ('queued','sending','delivered','retried')));
end $$;
grant execute on function public.get_notification_badge() to authenticated;

create or replace function public.get_signal_notifications(p_source_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.created_at_utc) from (
    select ne.recipient_user_id, ne.channel_type, ne.severity, ne.delivery_status, ne.created_at_utc, ne.acknowledged_at_utc, r.role_display_name as role_name
    from public.notification_events ne left join public.org_roles r on r.id = ne.recipient_role_id
    where ne.org_id = v_org and ne.trigger_source_id = p_source_id) t), '[]'::jsonb);
end $$;
grant execute on function public.get_signal_notifications(uuid) to authenticated;

-- Org roles + on-call reads.
create or replace function public.get_org_roles()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.role_display_name) from (
    select o.id, o.role_code, o.role_display_name, o.typical_shift_pattern,
      (select count(*) from public.user_role_assignments ura where ura.role_id = o.id and (ura.effective_to_utc is null or ura.effective_to_utc > now())) as holders
    from public.org_roles o where o.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_org_roles() to authenticated;

create or replace function public.get_on_call_schedules()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.schedule_name) from (
    select sc.id, sc.schedule_name, sc.role_id, r.role_display_name, sc.rotation_pattern,
      public.get_on_call_current_shift(sc.role_id) as current_user_id,
      coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'shift_start_utc', s.shift_start_utc, 'shift_end_utc', s.shift_end_utc, 'shift_type', s.shift_type) order by s.shift_start_utc)
        from public.on_call_shifts s where s.schedule_id = sc.id and s.shift_end_utc > now() - interval '2 days'), '[]'::jsonb) as shifts
    from public.on_call_schedules sc join public.org_roles r on r.id = sc.role_id where sc.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_on_call_schedules() to authenticated;

create or replace function public.get_notification_policies()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(to_jsonb(np) order by np.policy_name) from public.notification_policies np where np.org_id = v_org), '[]'::jsonb);
end $$;
grant execute on function public.get_notification_policies() to authenticated;

-- Rotate: append the next weekly shift to a schedule for the next role holder.
create or replace function public.rotate_on_call_shift(p_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_role uuid; v_last timestamptz; v_next_user uuid; v_start timestamptz;
begin
  select org_id, role_id into v_org, v_role from public.on_call_schedules where id = p_schedule_id;
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  select max(shift_end_utc) into v_last from public.on_call_shifts where schedule_id = p_schedule_id;
  v_start := coalesce(v_last, date_trunc('day', now()));
  -- next holder = the role holder who has been on-call least recently
  select ura.user_id into v_next_user from public.user_role_assignments ura
    where ura.org_id = v_org and ura.role_id = v_role and (ura.effective_to_utc is null or ura.effective_to_utc > now())
    order by (select coalesce(max(s.shift_start_utc), 'epoch'::timestamptz) from public.on_call_shifts s where s.schedule_id = p_schedule_id and s.user_id = ura.user_id) asc
    limit 1;
  if v_next_user is null then raise exception 'no role holders to rotate'; end if;
  insert into public.on_call_shifts (org_id, schedule_id, user_id, shift_start_utc, shift_end_utc, shift_type)
  values (v_org, p_schedule_id, v_next_user, v_start, v_start + interval '7 days', 'primary');
  return jsonb_build_object('schedule_id', p_schedule_id, 'user_id', v_next_user, 'shift_start_utc', v_start);
end $$;
grant execute on function public.rotate_on_call_shift(uuid) to authenticated;
