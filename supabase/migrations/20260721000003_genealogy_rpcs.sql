-- Phase 4 — genealogy RPCs.

-- Safe cross-org name resolver (org names are not sensitive; lets the ledger
-- show counterparty/source org names without widening genealogy_records RLS).
create or replace function public.org_display_name(p_org uuid)
returns text language sql stable security definer set search_path = public as $$
  select name from public.orgs where id = p_org
$$;
grant execute on function public.org_display_name(uuid) to authenticated;

-- Full genealogy view for one serial. SECURITY INVOKER → RLS enforces that the
-- caller currently owns, previously owned, or contributed to this serial.
create or replace function public.get_serial_genealogy_by_id(p_sid uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from public.serial_genealogies where id = p_sid) then
    return null;  -- RLS-invisible or missing
  end if;
  select jsonb_build_object(
    'serial', (select to_jsonb(sg) || jsonb_build_object('current_owner_name', public.org_display_name(sg.current_owner_org_id))
               from public.serial_genealogies sg where sg.id = p_sid),
    'records', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'record_type', r.record_type, 'record_date_utc', r.record_date_utc,
        'source_org_id', r.source_org_id, 'source_org_name', public.org_display_name(r.source_org_id),
        'source_aircraft_id', r.source_aircraft_id, 'aircraft_tail', a.tail_number,
        'record_payload', r.record_payload, 'attachments', r.attachments, 'content_hash', r.content_hash,
        'previous_record_hash', r.previous_record_hash, 'record_seq', r.record_seq,
        'confidence', r.confidence, 'verification_source', r.verification_source, 'created_at_utc', r.created_at_utc)
        order by r.record_seq desc), '[]'::jsonb)
      from public.genealogy_records r left join public.aircraft a on a.id = r.source_aircraft_id
      where r.serial_genealogy_id = p_sid),
    'ownership_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id, 'from_org_id', h.from_org_id, 'from_org_name', public.org_display_name(h.from_org_id),
        'to_org_id', h.to_org_id, 'to_org_name', public.org_display_name(h.to_org_id),
        'transfer_type', h.transfer_type, 'transfer_date_utc', h.transfer_date_utc, 'transfer_reference', h.transfer_reference)
        order by h.transfer_date_utc asc), '[]'::jsonb)
      from public.genealogy_ownership_history h where h.serial_genealogy_id = p_sid),
    'stats', (
      select jsonb_build_object('records_count', count(*), 'verified_count', count(*) filter (where confidence = 'verified'),
        'chain_ok', coalesce(bool_and(chain_ok), true))
      from (
        select confidence, (coalesce(previous_record_hash, '') = coalesce(lag(content_hash) over (order by record_seq), '')) as chain_ok
        from public.genealogy_records where serial_genealogy_id = p_sid) q),
    'export_count', (select count(*) from public.genealogy_exports where serial_genealogy_id = p_sid)
  ) into v;
  return v;
end;
$$;
grant execute on function public.get_serial_genealogy_by_id(uuid) to authenticated;

create or replace function public.get_serial_genealogy(p_manufacturer text, p_part_number text, p_serial_number text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_sid uuid;
begin
  select id into v_sid from public.serial_genealogies
  where manufacturer = p_manufacturer and part_number = p_part_number and serial_number = p_serial_number;
  if v_sid is null then return null; end if;
  return public.get_serial_genealogy_by_id(v_sid);
end;
$$;
grant execute on function public.get_serial_genealogy(text, text, text) to authenticated;

create or replace function public.get_component_genealogy(p_component_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_sid uuid;
begin
  select sg.id into v_sid
  from public.serial_genealogies sg join public.components c on c.id = p_component_id
  where sg.manufacturer = coalesce(c.manufacturer, 'Unknown')
    and sg.part_number = c.part_number and sg.serial_number = c.serial_number;
  if v_sid is null then return null; end if;
  return public.get_serial_genealogy_by_id(v_sid);
end;
$$;
grant execute on function public.get_component_genealogy(uuid) to authenticated;

-- Export: canonicalize the genealogy, hash it, log the export. The client
-- materializes the chosen format (PDF via print / JSON / portable bundle).
create or replace function public.export_genealogy_bundle(
  p_serial_genealogy_id uuid, p_format text, p_purpose text, p_recipient text
) returns jsonb language plpgsql security invoker set search_path = public, extensions as $$
declare
  v_bundle jsonb;
  v_hash text;
  v_org uuid;
  v_export uuid;
begin
  v_bundle := public.get_serial_genealogy_by_id(p_serial_genealogy_id);
  if v_bundle is null then raise exception 'genealogy not found or not visible'; end if;

  v_hash := encode(digest(v_bundle::text, 'sha256'), 'hex');
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;

  insert into public.genealogy_exports (org_id, serial_genealogy_id, exported_by_user_id, export_format,
    export_purpose, export_recipient, export_snapshot_hash)
  values (v_org, p_serial_genealogy_id, auth.uid(), p_format, p_purpose, p_recipient, v_hash)
  returning id into v_export;

  return jsonb_build_object('export_id', v_export, 'snapshot_hash', v_hash, 'format', p_format, 'bundle', v_bundle);
end;
$$;
grant execute on function public.export_genealogy_bundle(uuid, text, text, text) to authenticated;

-- Transfer ownership of a serial to another org (append-only, hash-chained).
create or replace function public.transfer_serial_ownership(
  p_serial_genealogy_id uuid, p_to_org_id uuid, p_transfer_type text, p_transfer_date_utc date,
  p_transfer_reference text, p_documentation_refs jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  sg record;
  v_hist uuid;
  v_seq int;
  v_prev text;
  v_payload jsonb;
  v_hash text;
begin
  select * into sg from public.serial_genealogies where id = p_serial_genealogy_id;
  if sg is null then raise exception 'serial not found'; end if;
  if sg.current_owner_org_id is null or not public.is_org_member(sg.current_owner_org_id) then
    raise exception 'only the current owner may transfer this serial';
  end if;

  insert into public.genealogy_ownership_history (serial_genealogy_id, from_org_id, to_org_id, transfer_type,
    transfer_date_utc, transfer_reference, transfer_documentation_refs)
  values (p_serial_genealogy_id, sg.current_owner_org_id, p_to_org_id, p_transfer_type, p_transfer_date_utc,
    p_transfer_reference, coalesce(p_documentation_refs, '[]'::jsonb))
  returning id into v_hist;

  -- Append an ownership_transfer record to the ledger.
  select coalesce(max(record_seq) + 1, 0) into v_seq from public.genealogy_records where serial_genealogy_id = p_serial_genealogy_id;
  select content_hash into v_prev from public.genealogy_records where serial_genealogy_id = p_serial_genealogy_id and record_seq = v_seq - 1;
  v_payload := jsonb_build_object('from_org_id', sg.current_owner_org_id, 'to_org_id', p_to_org_id,
    'transfer_type', p_transfer_type, 'transfer_reference', p_transfer_reference, 'documentation_refs', p_documentation_refs);
  v_hash := encode(digest('ownership_transfer|' || p_transfer_date_utc::text || '|' || coalesce(sg.current_owner_org_id::text, '') || '|' || v_payload::text, 'sha256'), 'hex');
  insert into public.genealogy_records (serial_genealogy_id, record_type, record_date_utc, source_org_id,
    record_payload, content_hash, previous_record_hash, record_seq, confidence)
  values (p_serial_genealogy_id, 'ownership_transfer', p_transfer_date_utc, sg.current_owner_org_id,
    v_payload, v_hash, v_prev, v_seq, 'self_reported');

  update public.serial_genealogies
    set current_owner_org_id = p_to_org_id, current_component_id = null, updated_at_utc = now()
    where id = p_serial_genealogy_id;

  return v_hist;
end;
$$;
grant execute on function public.transfer_serial_ownership(uuid, uuid, text, date, text, jsonb) to authenticated;

-- Verify a record (self_reported → verified). SECURITY DEFINER: the ledger RLS
-- blocks all user updates; this is the single sanctioned confidence mutation.
create or replace function public.verify_genealogy_record(p_genealogy_record_id uuid, p_verification_source text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select gr.*, sg.current_owner_org_id as owner_org into r
  from public.genealogy_records gr join public.serial_genealogies sg on sg.id = gr.serial_genealogy_id
  where gr.id = p_genealogy_record_id;
  if r is null then raise exception 'record not found'; end if;
  if not (public.is_org_member(coalesce(r.source_org_id, r.owner_org)) or public.is_org_member(r.owner_org)) then
    raise exception 'not authorized to verify this record';
  end if;

  update public.genealogy_records
    set confidence = 'verified', verification_source = p_verification_source
    where id = p_genealogy_record_id;

  update public.serial_genealogies
    set verification_state = 'tenant_verified', last_verified_at_utc = now(), updated_at_utc = now()
    where id = r.serial_genealogy_id and verification_state = 'unverified';
end;
$$;
grant execute on function public.verify_genealogy_record(uuid, text) to authenticated;
