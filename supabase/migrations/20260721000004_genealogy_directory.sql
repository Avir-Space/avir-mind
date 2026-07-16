-- Phase 4 — genealogy directory + resync helper.

-- Every serial the caller currently owns or previously owned (RLS-scoped).
create or replace function public.get_genealogy_directory()
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.serial_number), '[]'::jsonb) into v
  from (
    select sg.id, sg.serial_number, sg.part_number, sg.manufacturer, sg.component_type,
      sg.current_owner_org_id, public.org_display_name(sg.current_owner_org_id) as current_owner_name,
      sg.current_component_id, sg.lifetime_cycles, sg.lifetime_flight_hours, sg.verification_state,
      (sg.current_owner_org_id is not null and public.is_org_member(sg.current_owner_org_id)) as owned,
      (select count(*) from public.genealogy_records r where r.serial_genealogy_id = sg.id) as records_count,
      (select max(r.record_date_utc) from public.genealogy_records r where r.serial_genealogy_id = sg.id) as last_event_date
    from public.serial_genealogies sg
  ) x;
  return v;
end;
$$;
grant execute on function public.get_genealogy_directory() to authenticated;

-- Build genealogy_records for any component_events that don't have one yet
-- ("Refresh from Source Events"). Idempotent — only fills gaps.
create or replace function public.sync_component_genealogy(p_component_id uuid)
returns int language plpgsql security invoker set search_path = public as $$
declare r record; v_count int := 0;
begin
  for r in
    select ce.id from public.component_events ce
    where ce.component_id = p_component_id
      and not exists (select 1 from public.genealogy_records gr where gr.source_component_event_id = ce.id)
    order by ce.event_date_utc asc, ce.created_at_utc asc
  loop
    perform public.genealogy_build_record(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.sync_component_genealogy(uuid) to authenticated;
