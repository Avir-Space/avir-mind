-- Phase 2.5 — seed flight schedules
--
-- Generates ~4 upcoming legs per aircraft over the next ~30h using the org's own
-- station distribution. Deterministic (no random) so it is reproducible. In-air
-- aircraft get their first leg pulled into the present (status en_route) so the
-- Command Center map can interpolate a mid-air position.

create or replace function public.seed_demo_flight_schedules(p_org_id uuid, p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
  r record;
  v_all text[];
  v_home text;
  v_dests text[];
  v_origin text;
  v_dest text;
  v_dep timestamptz;
  v_arr timestamptz;
  v_status text;
  v_ord int := 0;
  v_leg int;
begin
  -- Idempotent: never double-seed an org.
  if exists (select 1 from public.flight_schedules where org_id = p_org_id) then
    return 0;
  end if;

  -- Station pool from this org's fleet (current position, else base).
  select array_agg(distinct s) into v_all
  from (
    select coalesce(st.current_station, a.base_station) as s
    from public.aircraft a
    left join public.aircraft_state st on st.aircraft_id = a.id
    where a.org_id = p_org_id
  ) q
  where s is not null;

  if v_all is null or array_length(v_all, 1) < 2 then
    v_all := array['JFK', 'LHR', 'FRA', 'DXB'];
  end if;

  for r in
    select a.id, a.tail_number, coalesce(st.current_station, a.base_station) as home, coalesce(st.state, 'on_ground') as state
    from public.aircraft a
    left join public.aircraft_state st on st.aircraft_id = a.id
    where a.org_id = p_org_id
    order by a.tail_number
  loop
    v_ord := v_ord + 1;
    v_home := coalesce(r.home, v_all[1]);

    -- Three distinct destinations from the pool, rotated by aircraft ordinal.
    v_dests := array(
      select s from unnest(v_all) with ordinality as u(s, i)
      where s <> v_home
      order by ((i + v_ord) % greatest(array_length(v_all, 1), 1)), s
      limit 3
    );
    if v_dests is null or array_length(v_dests, 1) is null then
      v_dests := array['LHR', 'FRA', 'DXB'];
    end if;

    -- Chain of 4 legs: home -> d1 -> d2 -> d3 -> home, staggered per aircraft.
    v_origin := v_home;
    for v_leg in 1..4 loop
      if v_leg = 4 or v_leg > array_length(v_dests, 1) then
        v_dest := v_home;
      else
        v_dest := coalesce(v_dests[v_leg], v_home);
      end if;

      v_dep := now() + (((v_ord % 6) + (v_leg - 1) * 4) || ' hours')::interval;
      v_arr := v_dep + interval '2 hours 30 minutes';

      if v_leg = 1 and r.state = 'in_air' then
        -- Put the aircraft mid-air right now.
        v_dep := now() - interval '1 hour 10 minutes';
        v_arr := now() + interval '1 hour 20 minutes';
        v_status := 'en_route';
      elsif v_arr <= now() then
        v_status := 'arrived';
      elsif v_dep <= now() then
        v_status := 'departed';
      else
        v_status := 'scheduled';
      end if;

      insert into public.flight_schedules (
        org_id, aircraft_id, flight_number, origin_station, destination_station,
        scheduled_departure_utc, scheduled_arrival_utc, status, source_system)
      values (
        p_org_id, r.id,
        'AV' || lpad((100 + v_ord * 4 + v_leg)::text, 3, '0'),
        v_origin, v_dest, v_dep, v_arr, v_status, 'avir');

      v_count := v_count + 1;
      v_origin := v_dest;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.seed_demo_flight_schedules(uuid, uuid) to authenticated, anon, service_role;

-- Wire schedule seeding into new-user provisioning (after the org exists).
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  begin
    v_org := public.seed_avir_demo(new.id);
    if v_org is not null then
      perform public.seed_demo_flight_schedules(v_org, new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- Backfill every existing org (idempotent per org).
do $$
declare
  r record;
begin
  for r in
    select o.id as org_id,
           (select m.user_id from public.org_members m
            where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id
    from public.orgs o
  loop
    perform public.seed_demo_flight_schedules(r.org_id, r.user_id);
  end loop;
end
$$;
