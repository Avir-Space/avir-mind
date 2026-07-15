-- 0005: log_aircraft_state_change
-- On every state transition of aircraft_state, append a row to
-- aircraft_state_history. org_id is resolved from the parent aircraft.
-- SECURITY DEFINER so the history insert is not blocked by RLS when the update
-- originates from an authenticated app session.

create or replace function public.log_aircraft_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
begin
  -- Only log genuine transitions.
  if new.state is distinct from old.state then
    select a.org_id into v_org_id
    from public.aircraft a
    where a.id = new.aircraft_id;

    insert into public.aircraft_state_history (
      aircraft_id, org_id, state, previous_state, state_source, transitioned_at, note
    ) values (
      new.aircraft_id,
      v_org_id,
      new.state,
      old.state,
      new.state_source,
      coalesce(new.last_transition_at, now()),
      null
    );
  end if;
  return new;
end;
$$;

create trigger aircraft_state_log_change
  after update on public.aircraft_state
  for each row execute function public.log_aircraft_state_change();
