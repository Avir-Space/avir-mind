-- AVIR Mind — Phase 8: compliance + DS.AI RPCs.
-- 0803: AD/SB management, MEL defer/rectify/extend, LLP status, regulatory
-- reports, and the DS.AI audit surface (audit trail, model report, lineage,
-- conformance bundle export). Writes are SECURITY DEFINER with an explicit
-- is_org_member guard; reads are SECURITY INVOKER so RLS scopes them.

-- ═════════════════════════════════════════════════════════════════════════════
-- Helper — the caller's org (first membership).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public._caller_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.org_members where user_id = auth.uid() order by (role = 'owner') desc limit 1;
$$;
grant execute on function public._caller_org() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- AD / SB
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.import_ad_from_authority(p_ad jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.airworthiness_directives (
    org_id, ad_number, issuing_authority, ad_title, ad_summary, effective_date,
    compliance_deadline_date, compliance_deadline_flight_hours, compliance_deadline_cycles,
    applicable_aircraft_types, applicable_engines, applicable_parts, criticality, ad_document_url)
  values (
    v_org, p_ad->>'ad_number', coalesce(p_ad->>'issuing_authority','faa'), p_ad->>'ad_title', p_ad->>'ad_summary',
    (p_ad->>'effective_date')::date, (p_ad->>'compliance_deadline_date')::date,
    (p_ad->>'compliance_deadline_flight_hours')::numeric, (p_ad->>'compliance_deadline_cycles')::int,
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_ad->'applicable_aircraft_types') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_ad->'applicable_engines') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_ad->'applicable_parts') x), '{}'),
    coalesce(p_ad->>'criticality','mandatory'), p_ad->>'ad_document_url')
  on conflict (org_id, ad_number, issuing_authority) do update set ad_title = excluded.ad_title
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.import_ad_from_authority(jsonb) to authenticated;

create or replace function public.update_aircraft_ad_status(p_aircraft_id uuid, p_ad_id uuid, p_status text, p_attrs jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.aircraft where id = p_aircraft_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  insert into public.aircraft_ad_status (
    org_id, aircraft_id, ad_id, status, compliance_method, complied_at_date, complied_at_cycles,
    complied_at_flight_hours, performed_by, documentation_reference, evidence_attachment_paths,
    deferral_authority, deferral_expiry_date, notes)
  values (
    v_org, p_aircraft_id, p_ad_id, p_status, p_attrs->>'compliance_method',
    case when p_status = 'complied' then coalesce((p_attrs->>'complied_at_date')::date, current_date) else (p_attrs->>'complied_at_date')::date end,
    (p_attrs->>'complied_at_cycles')::int, (p_attrs->>'complied_at_flight_hours')::numeric,
    p_attrs->>'performed_by', p_attrs->>'documentation_reference',
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_attrs->'evidence_attachment_paths') x), '{}'),
    p_attrs->>'deferral_authority', (p_attrs->>'deferral_expiry_date')::date, p_attrs->>'notes')
  on conflict (org_id, aircraft_id, ad_id) do update set
    status = excluded.status, compliance_method = coalesce(excluded.compliance_method, aircraft_ad_status.compliance_method),
    complied_at_date = coalesce(excluded.complied_at_date, aircraft_ad_status.complied_at_date),
    complied_at_cycles = coalesce(excluded.complied_at_cycles, aircraft_ad_status.complied_at_cycles),
    complied_at_flight_hours = coalesce(excluded.complied_at_flight_hours, aircraft_ad_status.complied_at_flight_hours),
    performed_by = coalesce(excluded.performed_by, aircraft_ad_status.performed_by),
    documentation_reference = coalesce(excluded.documentation_reference, aircraft_ad_status.documentation_reference),
    evidence_attachment_paths = case when array_length(excluded.evidence_attachment_paths,1) is not null then excluded.evidence_attachment_paths else aircraft_ad_status.evidence_attachment_paths end,
    deferral_authority = coalesce(excluded.deferral_authority, aircraft_ad_status.deferral_authority),
    deferral_expiry_date = coalesce(excluded.deferral_expiry_date, aircraft_ad_status.deferral_expiry_date),
    notes = coalesce(excluded.notes, aircraft_ad_status.notes), updated_at_utc = now()
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.update_aircraft_ad_status(uuid, uuid, text, jsonb) to authenticated;

-- Per-aircraft compliance summary (Aircraft Profile Compliance tab).
create or replace function public.get_aircraft_compliance_summary(p_aircraft_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'ads', coalesce((select jsonb_agg(jsonb_build_object(
        'ad_id', d.id, 'ad_number', d.ad_number, 'issuing_authority', d.issuing_authority, 'ad_title', d.ad_title,
        'criticality', d.criticality, 'effective_date', d.effective_date, 'compliance_deadline_date', d.compliance_deadline_date,
        'status', coalesce(s.status,'open'), 'compliance_method', s.compliance_method, 'complied_at_date', s.complied_at_date,
        'deferral_expiry_date', s.deferral_expiry_date) order by d.criticality, d.compliance_deadline_date nulls last)
      from public.airworthiness_directives d
      left join public.aircraft_ad_status s on s.ad_id = d.id and s.aircraft_id = p_aircraft_id
      where d.org_id = (select org_id from public.aircraft where id = p_aircraft_id)
        and (d.applicable_aircraft_types = '{}' or (select aircraft_type from public.aircraft where id = p_aircraft_id) = any(d.applicable_aircraft_types))
    ), '[]'::jsonb),
    'sbs', coalesce((select jsonb_agg(jsonb_build_object(
        'sb_id', b.id, 'sb_number', b.sb_number, 'manufacturer', b.manufacturer, 'sb_title', b.sb_title,
        'classification', b.classification, 'issued_date', b.issued_date, 'recommended_by_date', b.recommended_by_date,
        'status', coalesce(s.status,'open')) order by b.classification, b.issued_date desc)
      from public.service_bulletins b
      left join public.aircraft_sb_status s on s.sb_id = b.id and s.aircraft_id = p_aircraft_id
      where b.org_id = (select org_id from public.aircraft where id = p_aircraft_id)
        and (b.applicable_aircraft_types = '{}' or (select aircraft_type from public.aircraft where id = p_aircraft_id) = any(b.applicable_aircraft_types))
    ), '[]'::jsonb),
    'mel', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'mel_item_number', c.mel_item_number, 'system_name', c.system_name, 'item_description', c.item_description,
        'category', c.category, 'status', m.status, 'deferred_at_utc', m.deferred_at_utc, 'repair_by_date', m.repair_by_date,
        'placard_installed', m.placard_installed, 'linked_task_id', m.linked_task_id) order by m.repair_by_date)
      from public.aircraft_mel_items m join public.mel_catalog c on c.id = m.mel_catalog_id
      where m.aircraft_id = p_aircraft_id and m.status in ('open','extended')), '[]'::jsonb),
    'llps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'part_number', comp.part_number, 'serial_number', comp.serial_number, 'component_type', comp.component_type,
        'life_limit_type', l.life_limit_type, 'life_limit_value', l.life_limit_value, 'current_value', l.current_value,
        'remaining', l.remaining, 'percentage_used', l.percentage_used, 'criticality', l.criticality) order by l.remaining)
      from public.life_limited_parts l join public.components comp on comp.id = l.component_id
      where comp.aircraft_id = p_aircraft_id), '[]'::jsonb));
$$;
grant execute on function public.get_aircraft_compliance_summary(uuid) to authenticated;

-- Fleet compliance dashboard — stats strip + AD/SB registers.
create or replace function public.get_fleet_compliance_dashboard()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'stats', jsonb_build_object(
      'ads_open', (select count(*) from public.aircraft_ad_status where org_id = v_org and status in ('open','in_progress')),
      'ads_due_30', (select count(*) from public.aircraft_ad_status s join public.airworthiness_directives d on d.id = s.ad_id
                     where s.org_id = v_org and s.status in ('open','in_progress') and d.compliance_deadline_date is not null
                       and d.compliance_deadline_date <= current_date + 30),
      'mel_deferred', (select count(*) from public.aircraft_mel_items where org_id = v_org and status in ('open','extended')),
      'mel_approaching', (select count(*) from public.aircraft_mel_items where org_id = v_org and status in ('open','extended') and repair_by_date <= current_date + 7),
      'llps_approaching', (select count(*) from public.life_limited_parts where org_id = v_org and percentage_used >= 85),
      'sbs_open', (select count(*) from public.aircraft_sb_status where org_id = v_org and status in ('open','in_progress')),
      'reports_open', (select count(*) from public.regulatory_reports where org_id = v_org and status in ('draft','filed'))),
    'ads', coalesce((select jsonb_agg(row_to_json(t)) from (
      select d.id, d.ad_number, d.issuing_authority, d.ad_title, d.criticality, d.effective_date, d.compliance_deadline_date,
        d.applicable_aircraft_types,
        (select count(*) from public.aircraft_ad_status s where s.ad_id = d.id) as tracked,
        (select count(*) from public.aircraft_ad_status s where s.ad_id = d.id and s.status = 'complied') as complied,
        (select count(*) from public.aircraft_ad_status s where s.ad_id = d.id and s.status in ('open','in_progress')) as open_count,
        (select count(*) from public.aircraft_ad_status s where s.ad_id = d.id and s.status = 'deferred') as deferred_count
      from public.airworthiness_directives d where d.org_id = v_org
      order by d.criticality, d.compliance_deadline_date nulls last) t), '[]'::jsonb),
    'sbs', coalesce((select jsonb_agg(row_to_json(t)) from (
      select b.id, b.sb_number, b.manufacturer, b.sb_title, b.classification, b.issued_date, b.recommended_by_date, b.applicable_aircraft_types,
        (select count(*) from public.aircraft_sb_status s where s.sb_id = b.id and s.status = 'complied') as complied,
        (select count(*) from public.aircraft_sb_status s where s.sb_id = b.id and s.status in ('open','in_progress')) as open_count
      from public.service_bulletins b where b.org_id = v_org order by b.classification, b.issued_date desc) t), '[]'::jsonb));
end $$;
grant execute on function public.get_fleet_compliance_dashboard() to authenticated;

-- AD detail with per-aircraft status matrix.
create or replace function public.get_ad_detail(p_ad_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'ad', to_jsonb(d),
    'matrix', coalesce((select jsonb_agg(jsonb_build_object(
        'aircraft_id', a.id, 'tail_number', a.tail_number, 'aircraft_type', a.aircraft_type,
        'status', coalesce(s.status,'open'), 'compliance_method', s.compliance_method, 'complied_at_date', s.complied_at_date,
        'deferral_authority', s.deferral_authority, 'deferral_expiry_date', s.deferral_expiry_date,
        'documentation_reference', s.documentation_reference, 'notes', s.notes) order by a.tail_number)
      from public.aircraft a
      left join public.aircraft_ad_status s on s.ad_id = d.id and s.aircraft_id = a.id
      where a.org_id = d.org_id
        and (d.applicable_aircraft_types = '{}' or a.aircraft_type = any(d.applicable_aircraft_types))), '[]'::jsonb))
  from public.airworthiness_directives d where d.id = p_ad_id;
$$;
grant execute on function public.get_ad_detail(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- MEL
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.defer_mel_item(p_aircraft_id uuid, p_mel_catalog_id uuid, p_reason text default null, p_create_task boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_cat public.mel_catalog; v_days int; v_due date; v_item_id uuid; v_task_id uuid;
begin
  select org_id into v_org from public.aircraft where id = p_aircraft_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  select * into v_cat from public.mel_catalog where id = p_mel_catalog_id;
  if v_cat.id is null then raise exception 'unknown MEL catalog item'; end if;

  -- Repair interval by MMEL category (operator override wins if set).
  v_days := coalesce(v_cat.repair_interval_days, case v_cat.category when 'a' then 999 when 'b' then 3 when 'c' then 10 when 'd' then 120 end);
  v_due := current_date + v_days;

  if p_create_task then
    insert into public.tasks (org_id, aircraft_id, title, why_summary, parent_type, sub_type, status, risk_band, dispatch_blocking, station_code, due_at_utc, reporter_user_id)
    values (v_org, p_aircraft_id, 'MEL ' || v_cat.mel_item_number || ' — ' || v_cat.system_name,
      'Deferred MEL item requires rectification by ' || v_due, 'compliance', 'mel_reconciliation', 'queued',
      case v_cat.category when 'a' then 'high' when 'b' then 'high' else 'medium' end, false,
      (select base_station from public.aircraft where id = p_aircraft_id), v_due::timestamptz, auth.uid())
    returning id into v_task_id;
  end if;

  insert into public.aircraft_mel_items (org_id, aircraft_id, mel_catalog_id, deferred_by_user_id, reason, repair_by_date, status, placard_installed, linked_task_id)
  values (v_org, p_aircraft_id, p_mel_catalog_id, auth.uid(), p_reason, v_due, 'open', v_cat.placard_required, v_task_id)
  returning id into v_item_id;

  return jsonb_build_object('id', v_item_id, 'repair_by_date', v_due, 'linked_task_id', v_task_id, 'category', v_cat.category);
end $$;
grant execute on function public.defer_mel_item(uuid, uuid, text, boolean) to authenticated;

create or replace function public.rectify_mel_item(p_item_id uuid, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_task uuid;
begin
  select org_id, linked_task_id into v_org, v_task from public.aircraft_mel_items where id = p_item_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.aircraft_mel_items set status = 'rectified', rectified_at_utc = now(), updated_at_utc = now() where id = p_item_id;
  if v_task is not null then update public.tasks set status = 'done', updated_at_utc = now() where id = v_task; end if;
  return jsonb_build_object('id', p_item_id, 'status', 'rectified', 'closed_task', v_task);
end $$;
grant execute on function public.rectify_mel_item(uuid, text) to authenticated;

create or replace function public.extend_mel_deferral(p_item_id uuid, p_authority text, p_new_due_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_task uuid;
begin
  select org_id, linked_task_id into v_org, v_task from public.aircraft_mel_items where id = p_item_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.aircraft_mel_items set status = 'extended', extension_authority = p_authority,
    extension_new_due_date = p_new_due_date, repair_by_date = p_new_due_date, updated_at_utc = now() where id = p_item_id;
  if v_task is not null then update public.tasks set due_at_utc = p_new_due_date::timestamptz, updated_at_utc = now() where id = v_task; end if;
  return jsonb_build_object('id', p_item_id, 'status', 'extended', 'new_due_date', p_new_due_date);
end $$;
grant execute on function public.extend_mel_deferral(uuid, text, date) to authenticated;

create or replace function public.get_active_mel_items_for_aircraft(p_aircraft_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'mel_item_number', c.mel_item_number, 'ata_chapter', c.ata_chapter, 'system_name', c.system_name,
      'item_description', c.item_description, 'category', c.category, 'status', m.status, 'reason', m.reason,
      'deferred_at_utc', m.deferred_at_utc, 'repair_by_date', m.repair_by_date, 'placard_installed', m.placard_installed,
      'operational_procedure', c.operational_procedure, 'maintenance_procedure', c.maintenance_procedure,
      'linked_task_id', m.linked_task_id) order by m.repair_by_date), '[]'::jsonb)
  from public.aircraft_mel_items m join public.mel_catalog c on c.id = m.mel_catalog_id
  where m.aircraft_id = p_aircraft_id and m.status in ('open','extended');
$$;
grant execute on function public.get_active_mel_items_for_aircraft(uuid) to authenticated;

-- Fleet-wide active MEL (MEL management page), repair-by urgency sorted.
create or replace function public.get_fleet_mel_items()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select m.id, m.aircraft_id, a.tail_number, a.aircraft_type, c.mel_item_number, c.ata_chapter, c.system_name,
      c.item_description, c.category, c.operational_procedure, c.maintenance_procedure, m.status, m.reason,
      m.deferred_at_utc, m.repair_by_date, m.placard_installed, m.extension_authority, m.linked_task_id,
      (m.repair_by_date - current_date) as days_remaining
    from public.aircraft_mel_items m join public.mel_catalog c on c.id = m.mel_catalog_id join public.aircraft a on a.id = m.aircraft_id
    where m.org_id = v_org and m.status in ('open','extended') order by m.repair_by_date) t), '[]'::jsonb);
end $$;
grant execute on function public.get_fleet_mel_items() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Life-limited parts
-- ═════════════════════════════════════════════════════════════════════════════
-- Recompute calendar-time LLPs (cycles/hours are ratcheted by the component_events
-- trigger); returns rows touched.
create or replace function public.compute_llp_status()
returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_count int;
begin
  if v_org is null then return 0; end if;
  with upd as (
    update public.life_limited_parts l
      set current_value = round(extract(epoch from (now() - l.created_at_utc)) / 2629800.0, 2), updated_at_utc = now()
      where l.org_id = v_org and l.life_limit_type = 'calendar_time' returning 1)
  select count(*) into v_count from upd;
  return v_count;
end $$;
grant execute on function public.compute_llp_status() to authenticated;

create or replace function public.get_llp_alerts(p_threshold_pct numeric default 85)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select l.id, l.component_id, comp.part_number, comp.serial_number, comp.component_type, comp.aircraft_id,
      a.tail_number, l.life_limit_type, l.life_limit_value, l.current_value, l.remaining, l.percentage_used,
      l.criticality, l.source_document
    from public.life_limited_parts l join public.components comp on comp.id = l.component_id
    left join public.aircraft a on a.id = comp.aircraft_id
    where l.org_id = v_org and l.percentage_used >= p_threshold_pct order by l.remaining) t), '[]'::jsonb);
end $$;
grant execute on function public.get_llp_alerts(numeric) to authenticated;

-- Full LLP register (LLP page), most-urgent first.
create or replace function public.get_fleet_llps()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select l.id, l.component_id, comp.part_number, comp.serial_number, comp.component_type, comp.aircraft_id,
      a.tail_number, a.aircraft_type, l.life_limit_type, l.life_limit_value, l.current_value, l.remaining,
      l.percentage_used, l.criticality, l.source_document, l.updated_at_utc
    from public.life_limited_parts l join public.components comp on comp.id = l.component_id
    left join public.aircraft a on a.id = comp.aircraft_id
    where l.org_id = v_org order by l.percentage_used desc) t), '[]'::jsonb);
end $$;
grant execute on function public.get_fleet_llps() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Regulatory reports
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.create_regulatory_report_draft(p_type text, p_attrs jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org(); v_id uuid;
begin
  if v_org is null or not public.is_org_member(v_org) then raise exception 'no org'; end if;
  insert into public.regulatory_reports (org_id, report_type, issuing_regulator, report_reference, linked_event_id, report_summary, status, follow_up_actions)
  values (v_org, p_type, p_attrs->>'issuing_regulator', p_attrs->>'report_reference', p_attrs->>'linked_event_id',
    p_attrs->>'report_summary', 'draft', coalesce(p_attrs->'follow_up_actions','[]'::jsonb))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.create_regulatory_report_draft(text, jsonb) to authenticated;

create or replace function public.file_regulatory_report(p_id uuid, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.regulatory_reports where id = p_id;
  if v_org is null or not public.is_org_member(v_org) then raise exception 'not authorized'; end if;
  update public.regulatory_reports set status = 'filed', filed_at_date = current_date, filed_by_user_id = auth.uid(),
    report_reference = coalesce(p_reference, report_reference), updated_at_utc = now() where id = p_id;
  return p_id;
end $$;
grant execute on function public.file_regulatory_report(uuid, text) to authenticated;

create or replace function public.get_reporting_calendar()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.created_at_utc desc) from (
    select r.id, r.report_type, r.issuing_regulator, r.report_reference, r.filed_at_date, r.linked_event_id,
      r.report_summary, r.status, r.follow_up_actions, r.created_at_utc
    from public.regulatory_reports r where r.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_reporting_calendar() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- DS.AI audit surface
-- ═════════════════════════════════════════════════════════════════════════════
-- Full audit trail for a signal / task / decision: the decision record + lineage
-- + oversight chain.
create or replace function public.get_ai_decision_audit_trail(p_signal_id uuid default null, p_task_id uuid default null, p_decision_id uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with d as (
    select * from public.ai_decision_records r
    where (p_decision_id is not null and r.id = p_decision_id)
       or (p_signal_id is not null and r.linked_signal_id = p_signal_id)
       or (p_task_id is not null and r.linked_task_id = p_task_id)
    order by r.decision_at_utc desc limit 1)
  select case when exists (select 1 from d) then jsonb_build_object(
    'decision', (select to_jsonb(d) from d),
    'model', (select to_jsonb(m) from public.model_versions m where m.model_identifier = (select model_identifier from d)),
    'prompt', (select to_jsonb(p) from public.prompt_versions p where p.prompt_template_hash = (select prompt_template_hash from d)),
    'lineage', coalesce((select jsonb_agg(to_jsonb(l)) from public.data_lineage_records l where l.ai_decision_record_id = (select id from d)), '[]'::jsonb),
    'oversight', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at_utc) from public.human_oversight_events h where h.ai_decision_record_id = (select id from d)), '[]'::jsonb)
  ) else null end;
$$;
grant execute on function public.get_ai_decision_audit_trail(uuid, uuid, uuid) to authenticated;

-- DS.AI dashboard stats.
create or replace function public.get_dsai_dashboard()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org(); v_total int; v_reviewed int;
begin
  if v_org is null then return '{}'::jsonb; end if;
  select count(*) into v_total from public.ai_decision_records where org_id = v_org and decision_at_utc >= date_trunc('month', now());
  select count(distinct d.id) into v_reviewed from public.ai_decision_records d
    join public.human_oversight_events h on h.ai_decision_record_id = d.id
    where d.org_id = v_org and d.decision_at_utc >= date_trunc('month', now());
  return jsonb_build_object(
    'decisions_this_month', v_total,
    'oversight_rate', case when v_total > 0 then round((v_reviewed::numeric / v_total) * 100, 1) else 0 end,
    'decisions_all_time', (select count(*) from public.ai_decision_records where org_id = v_org),
    'model_versions', (select count(distinct model_identifier) from public.ai_decision_records where org_id = v_org),
    'data_sources', (select count(*) from public.data_lineage_records l join public.ai_decision_records d on d.id = l.ai_decision_record_id where d.org_id = v_org));
end $$;
grant execute on function public.get_dsai_dashboard() to authenticated;

-- Decisions list (filterable).
create or replace function public.get_dsai_decisions(p_type text default null, p_model text default null, p_confidence text default null, p_limit int default 200)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select r.id, r.decision_type, r.decision_context, r.model_identifier, r.output_confidence, r.input_context_hash,
      r.output_content, r.decision_at_utc, r.linked_signal_id, r.linked_task_id,
      exists(select 1 from public.human_oversight_events h where h.ai_decision_record_id = r.id) as reviewed,
      (select count(*) from public.data_lineage_records l where l.ai_decision_record_id = r.id) as lineage_count
    from public.ai_decision_records r
    where r.org_id = v_org
      and (p_type is null or r.decision_type = p_type)
      and (p_model is null or r.model_identifier = p_model)
      and (p_confidence is null or r.output_confidence = p_confidence)
    order by r.decision_at_utc desc limit p_limit) t), '[]'::jsonb);
end $$;
grant execute on function public.get_dsai_decisions(text, text, text, int) to authenticated;

-- Oversight list.
create or replace function public.get_dsai_oversight(p_limit int default 200)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t)) from (
    select h.id, h.oversight_type, h.reviewer_role, h.outcome_matched_ai, h.created_at_utc,
      d.decision_type, d.model_identifier, d.linked_signal_id, s.title as signal_title
    from public.human_oversight_events h
    join public.ai_decision_records d on d.id = h.ai_decision_record_id
    left join public.signals s on s.id = d.linked_signal_id
    where h.org_id = v_org order by h.created_at_utc desc limit p_limit) t), '[]'::jsonb);
end $$;
grant execute on function public.get_dsai_oversight(int) to authenticated;

-- Model version report — deployment timeline + decision counts.
create or replace function public.get_model_version_report()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'models', coalesce((select jsonb_agg(row_to_json(t) order by t.deployed_from_utc) from (
      select m.*, (select count(*) from public.ai_decision_records r where r.model_identifier = m.model_identifier and r.org_id = v_org) as decision_count
      from public.model_versions m) t), '[]'::jsonb),
    'prompts', coalesce((select jsonb_agg(row_to_json(p) order by p.prompt_template_identifier, p.version_number) from (
      select prompt_template_identifier, prompt_template_hash, version_number, deployed_from_utc, deployed_to_utc, change_summary,
        left(prompt_content_full, 400) as prompt_preview from public.prompt_versions) p), '[]'::jsonb));
end $$;
grant execute on function public.get_model_version_report() to authenticated;

-- Data lineage report for a decision.
create or replace function public.get_data_lineage_report(p_decision_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'decision', to_jsonb(r),
    'sources', coalesce((select jsonb_agg(to_jsonb(l) order by l.source_table) from public.data_lineage_records l where l.ai_decision_record_id = r.id), '[]'::jsonb))
  from public.ai_decision_records r where r.id = p_decision_id;
$$;
grant execute on function public.get_data_lineage_report(uuid) to authenticated;

-- Portable DS.AI conformance bundle for a time window.
create or replace function public.export_dsai_conformance_bundle(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'bundle_metadata', jsonb_build_object(
      'standard', 'EASA NPA 2025-07 (DS.AI) — substrate conformance bundle',
      'org_id', v_org, 'org_name', (select name from public.orgs where id = v_org),
      'period_from', p_from, 'period_to', p_to, 'generated_at_utc', now(),
      'decision_count', (select count(*) from public.ai_decision_records where org_id = v_org and decision_at_utc between p_from and p_to)),
    'ai_decisions', coalesce((select jsonb_agg(to_jsonb(r) order by r.decision_at_utc) from public.ai_decision_records r
      where r.org_id = v_org and r.decision_at_utc between p_from and p_to), '[]'::jsonb),
    'human_oversight', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at_utc) from public.human_oversight_events h
      where h.org_id = v_org and h.created_at_utc between p_from and p_to), '[]'::jsonb),
    'model_versions', coalesce((select jsonb_agg(to_jsonb(m)) from public.model_versions m), '[]'::jsonb),
    'prompt_versions', coalesce((select jsonb_agg(to_jsonb(p)) from public.prompt_versions p), '[]'::jsonb),
    'data_lineage', coalesce((select jsonb_agg(to_jsonb(l)) from public.data_lineage_records l
      join public.ai_decision_records r on r.id = l.ai_decision_record_id
      where r.org_id = v_org and r.decision_at_utc between p_from and p_to), '[]'::jsonb));
end $$;
grant execute on function public.export_dsai_conformance_bundle(timestamptz, timestamptz) to authenticated;
