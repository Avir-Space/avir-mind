-- 0203: fix get_command_center_insights.
-- The aggregation referenced `x.rank` / `where x is not null`, treating the
-- jsonb column `x` as a table alias — Postgres reports "missing FROM-clause
-- entry for table x". Qualify with the subquery alias `sub` instead.

create or replace function public.get_command_center_insights(
  p_severity text[] default null, p_limit int default 4
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v_result jsonb;
begin
  select org_id into v_org from public.org_members where user_id = auth.uid() limit 1;

  with active as (
    select s.*, ac.base_station, ac.tail_number
    from public.signals s
    left join public.aircraft ac on ac.id = s.aircraft_id
    where s.org_id = v_org and s.is_active
      and (p_severity is null or s.severity = any(p_severity))
  ),
  hi as (select * from active where severity in ('critical', 'high'))
  select jsonb_agg(sub.x order by sub.rank) into v_result from (
    select 1 as rank, jsonb_build_object(
      'category', c.category, 'severity', 'high',
      'title', 'Category cluster',
      'one_liner', c.ac_count || ' tail' || case when c.ac_count = 1 then '' else 's' end
        || ' showing ' || replace(c.category, '_', ' ') || ' signals',
      'aircraft_count', c.ac_count, 'signal_count', c.sig_count,
      'drill_in_query', jsonb_build_object('category', c.category)
    ) as x
    from (select category, count(distinct aircraft_id) ac_count, count(*) sig_count
          from hi where category is not null group by category order by count(*) desc limit 1) c
    where c.sig_count > 0

    union all
    select 2, jsonb_build_object(
      'category', 'fleet_pattern', 'severity', 'critical',
      'title', 'High-risk aircraft',
      'one_liner', z.n || ' aircraft with 3+ high-severity signals',
      'aircraft_count', z.n, 'signal_count', null,
      'drill_in_query', jsonb_build_object('severity', array['critical', 'high'])
    )
    from (select count(*) n from (select aircraft_id from hi group by aircraft_id having count(*) >= 3) q) z
    where z.n > 0

    union all
    select 3, jsonb_build_object(
      'category', 'insufficient_data', 'severity', 'info',
      'title', 'Needs more data',
      'one_liner', (
        (select count(*) from active where severity = 'insufficient_data')
        + coalesce((select sum(signals_suppressed) from public.signal_generation_runs
                    where org_id = v_org and started_at_utc > now() - interval '24 hours'), 0)
      )::int || ' signals limited by insufficient data',
      'aircraft_count', (select count(distinct aircraft_id) from active where severity = 'insufficient_data'),
      'signal_count', (select count(*) from active where severity = 'insufficient_data'),
      'drill_in_query', jsonb_build_object('severity', array['insufficient_data'])
    )
    where exists (select 1 from active where severity = 'insufficient_data')
       or exists (select 1 from public.signal_generation_runs
                  where org_id = v_org and signals_suppressed > 0 and started_at_utc > now() - interval '24 hours')

    union all
    select 4, jsonb_build_object(
      'category', 'ground_ops', 'severity', 'medium',
      'title', 'Station concentration',
      'one_liner', 'Station ' || st.base_station || ' has ' || st.n || ' high-severity signals',
      'aircraft_count', st.ac, 'signal_count', st.n,
      'drill_in_query', jsonb_build_object('station', st.base_station)
    )
    from (select base_station, count(*) n, count(distinct aircraft_id) ac
          from hi where base_station is not null group by base_station order by count(*) desc limit 1) st
    where st.n > 0
  ) sub
  where sub.x is not null;

  return coalesce((select jsonb_agg(e) from (
    select e from jsonb_array_elements(coalesce(v_result, '[]'::jsonb)) e limit coalesce(p_limit, 4)
  ) z), '[]'::jsonb);
end;
$$;
