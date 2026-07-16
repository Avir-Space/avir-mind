-- Phase 4 — automatic genealogy building.
-- Every component_event generates an append-only, hash-chained genealogy_record.
-- content_hash = sha256(record_type | record_date | source_org | payload_text).
-- previous_record_hash chains to the prior record_seq for the same serial.

-- Upsert the serial_genealogy for a component; create its birth_certificate
-- record on first creation. Returns the serial_genealogy id.
create or replace function public.genealogy_upsert_serial(p_component_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c record;
  v_id uuid;
  v_mfr text;
  v_birth date;
  v_payload jsonb;
  v_hash text;
begin
  select * into c from public.components where id = p_component_id;
  if c is null then return null; end if;
  v_mfr := coalesce(c.manufacturer, 'Unknown');

  select id into v_id from public.serial_genealogies
  where manufacturer = v_mfr and part_number = c.part_number and serial_number = c.serial_number;

  if v_id is null then
    v_birth := coalesce(c.installed_at_utc::date, (now() - interval '3 years')::date);
    insert into public.serial_genealogies (
      manufacturer, part_number, serial_number, component_type, birth_certificate_date,
      birth_manufacturer_facility, current_owner_org_id, current_component_id, verification_state)
    values (v_mfr, c.part_number, c.serial_number, c.component_type, v_birth,
      c.manufacturer || ' Assembly Line', c.org_id, c.id, 'unverified')
    returning id into v_id;

    -- Birth certificate = the genesis record (seq 0, no previous hash).
    v_payload := jsonb_build_object('manufacturer', v_mfr, 'part_number', c.part_number,
      'serial_number', c.serial_number, 'component_type', c.component_type, 'birth_date', v_birth);
    v_hash := encode(digest('birth_certificate|' || v_birth::text || '|' || coalesce(c.org_id::text, '') || '|' || v_payload::text, 'sha256'), 'hex');
    insert into public.genealogy_records (serial_genealogy_id, record_type, record_date_utc, source_org_id,
      source_component_id, record_payload, content_hash, previous_record_hash, record_seq, confidence)
    values (v_id, 'birth_certificate', v_birth, c.org_id, c.id, v_payload, v_hash, null, 0, 'self_reported');
  else
    -- Re-assert current ownership/component only if unowned or still ours.
    update public.serial_genealogies sg
      set current_component_id = c.id, current_owner_org_id = coalesce(sg.current_owner_org_id, c.org_id), updated_at_utc = now()
      where sg.id = v_id and (sg.current_owner_org_id is null or sg.current_owner_org_id = c.org_id);
  end if;

  return v_id;
end;
$$;

-- Build one genealogy_record from a component_event.
create or replace function public.genealogy_build_record(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ce record;
  v_serial uuid;
  v_rtype text;
  v_seq int;
  v_prev text;
  v_payload jsonb;
  v_hash text;
  v_rec uuid;
begin
  select * into ce from public.component_events where id = p_event_id;
  if ce is null then return null; end if;

  v_serial := public.genealogy_upsert_serial(ce.component_id);
  if v_serial is null then return null; end if;

  v_rtype := case ce.event_type
    when 'installed' then 'installation'
    when 'removed' then 'removal'
    when 'overhaul' then 'overhaul'
    when 'repair' then 'repair'
    when 'finding_recorded' then 'finding'
    when 'cycle_recorded' then 'cycle_snapshot'
    when 'hours_recorded' then 'hours_snapshot'
    when 'incident_recorded' then 'incident'
    when 'warranty_claim' then 'warranty_claim'
    when 'functional_test' then 'return_to_service'
    else 'finding' end;

  select coalesce(max(record_seq) + 1, 0) into v_seq from public.genealogy_records where serial_genealogy_id = v_serial;
  select content_hash into v_prev from public.genealogy_records where serial_genealogy_id = v_serial and record_seq = v_seq - 1;

  v_payload := jsonb_build_object(
    'event_type', ce.event_type, 'cycles_at_event', ce.cycles_at_event, 'flight_hours_at_event', ce.flight_hours_at_event,
    'finding_severity', ce.finding_severity, 'finding_description', ce.finding_description,
    'station', ce.station, 'facility', ce.facility, 'performed_by', ce.performed_by,
    'documentation_reference', ce.documentation_reference, 'cost_usd', ce.cost_usd,
    'source_system', ce.source_system, 'aircraft_id', ce.aircraft_id);

  v_hash := encode(digest(v_rtype || '|' || ce.event_date_utc::text || '|' || coalesce(ce.org_id::text, '') || '|' || v_payload::text, 'sha256'), 'hex');

  insert into public.genealogy_records (serial_genealogy_id, record_type, record_date_utc, source_org_id,
    source_component_event_id, source_component_id, source_aircraft_id, record_payload, content_hash,
    previous_record_hash, record_seq, confidence)
  values (v_serial, v_rtype, ce.event_date_utc, ce.org_id, ce.id, ce.component_id, ce.aircraft_id, v_payload,
    v_hash, v_prev, v_seq, case ce.source_system when 'avir' then 'self_reported' else 'self_reported' end)
  returning id into v_rec;

  update public.serial_genealogies set
    lifetime_cycles = greatest(coalesce(lifetime_cycles, 0), coalesce(ce.cycles_at_event, 0)),
    lifetime_flight_hours = greatest(coalesce(lifetime_flight_hours, 0), coalesce(ce.flight_hours_at_event, 0)),
    total_installations = total_installations + (case when v_rtype = 'installation' then 1 else 0 end),
    total_overhauls = total_overhauls + (case when v_rtype = 'overhaul' then 1 else 0 end),
    total_findings = total_findings + (case when ce.finding_severity is not null and ce.finding_severity not in ('nil') then 1 else 0 end),
    updated_at_utc = now()
  where id = v_serial;

  return v_rec;
end;
$$;

-- Trigger: every new component_event appends to the genealogy ledger.
create or replace function public.trg_genealogy_from_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.genealogy_build_record(new.id);
  return new;
end;
$$;

drop trigger if exists genealogy_on_component_event on public.component_events;
create trigger genealogy_on_component_event
  after insert on public.component_events
  for each row execute function public.trg_genealogy_from_event();

grant execute on function public.genealogy_upsert_serial(uuid) to authenticated, service_role;
grant execute on function public.genealogy_build_record(uuid) to authenticated, service_role;

-- Backfill every existing component_event in chronological order (once).
do $$
declare r record;
begin
  if exists (select 1 from public.genealogy_records) then return; end if;
  for r in
    select id from public.component_events order by event_date_utc asc, created_at_utc asc, id asc
  loop
    perform public.genealogy_build_record(r.id);
  end loop;
end
$$;
