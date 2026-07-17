-- AVIR Mind — Phase 14: AVIR Index seed. 8 definitions (global), consent for the
-- 2 demo tenants, 4 quarters of computations (all below-threshold), a sample
-- draft press release, and a mock partner embed. Nothing is publicly visible.

-- Draft press releases can exist before a publication (preview quality demo).
alter table public.press_releases alter column index_publication_id drop not null;

-- ── 8 definitions (idempotent) ──
insert into public.index_definitions (index_code, index_name, index_category, description, computation_frequency, minimum_participating_tenants, unit, higher_is_better, methodology_document_url) values
  ('AVIR_RELIABILITY', 'AVIR Reliability Index', 'reliability', 'A cross-operator aggregate of fleet technical dispatch reliability.', 'quarterly', 5, 'percent', true, 'https://avir.space/index/methodology/reliability'),
  ('AVIR_PREDICTIVE_CATCH', 'AVIR Predictive Catch Index', 'predictive_accuracy', 'The share of significant maintenance events caught by AVIR predictive signals before they occurred.', 'quarterly', 5, 'percent', true, 'https://avir.space/index/methodology/predictive-catch'),
  ('AVIR_CALIBRATION', 'AVIR Calibration Index', 'calibration', 'Weighted accuracy of AVIR AI predictions against measured outcomes.', 'quarterly', 5, 'percent', true, 'https://avir.space/index/methodology/calibration'),
  ('AVIR_COMPLIANCE_HEALTH', 'AVIR Compliance Health Index', 'compliance', 'Aggregate compliance-item open-days across the fleet (lower is better).', 'quarterly', 5, 'days', false, 'https://avir.space/index/methodology/compliance'),
  ('AVIR_TAT', 'AVIR TAT Index', 'tat_performance', 'MRO shop-visit turnaround performance in days (lower is better).', 'quarterly', 5, 'days', false, 'https://avir.space/index/methodology/tat'),
  ('AVIR_INVENTORY_TURN', 'AVIR Inventory Turn Index', 'inventory_efficiency', 'Spares inventory efficiency expressed as an annualized turn ratio.', 'quarterly', 5, 'ratio', true, 'https://avir.space/index/methodology/inventory'),
  ('AVIR_SIGNAL_RESPONSE_TIME', 'AVIR Signal Response Index', 'safety_indicator', 'Median time from a critical signal firing to a human action, in hours (lower is better).', 'monthly', 5, 'hours', false, 'https://avir.space/index/methodology/response'),
  ('AVIR_INDUSTRY_COMPOSITE', 'AVIR Industry Composite', 'industry_composite', 'A weighted rollup of the AVIR Index family into a single industry score.', 'quarterly', 5, 'score', true, 'https://avir.space/index/methodology/composite')
on conflict (index_code) do nothing;

-- ── mock partner embed (idempotent) ──
insert into public.partner_embed_configurations (partner_name, partner_domain, allowed_index_codes, embed_style, embed_theme)
select 'Aviation Week Intelligence', 'aviationweek.com', array['AVIR_RELIABILITY','AVIR_INDUSTRY_COMPOSITE'], 'headline_number', 'brand_avir'
where not exists (select 1 from public.partner_embed_configurations where partner_domain = 'aviationweek.com');

create or replace function public.seed_demo_index(p_operator_org uuid, p_mro_org uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; q int; v_start date; v_end date; op_codes text[]; mro_codes text[];
begin
  if p_operator_org is null or p_user_id is null then return; end if;
  op_codes := array['AVIR_RELIABILITY','AVIR_PREDICTIVE_CATCH','AVIR_CALIBRATION','AVIR_COMPLIANCE_HEALTH','AVIR_INVENTORY_TURN','AVIR_SIGNAL_RESPONSE_TIME','AVIR_INDUSTRY_COMPOSITE'];
  mro_codes := array['AVIR_TAT','AVIR_RELIABILITY','AVIR_INDUSTRY_COMPOSITE'];

  -- consent (aggregate_only) for the operator tenant
  for r in select id, index_code from public.index_definitions where index_code = any(op_codes) loop
    insert into public.tenant_index_consent (org_id, index_definition_id, consent_status, consented_by_user_id, consented_at_utc, data_visibility_scope)
    values (p_operator_org, r.id, 'granted', p_user_id, now(), 'aggregate_only')
    on conflict (org_id, index_definition_id) do update set consent_status = 'granted', consented_at_utc = now();
  end loop;
  -- consent for the MRO tenant
  if p_mro_org is not null then
    for r in select id from public.index_definitions where index_code = any(mro_codes) loop
      insert into public.tenant_index_consent (org_id, index_definition_id, consent_status, consented_by_user_id, consented_at_utc, data_visibility_scope)
      values (p_mro_org, r.id, 'granted', p_user_id, now(), 'aggregate_only')
      on conflict (org_id, index_definition_id) do update set consent_status = 'granted', consented_at_utc = now();
    end loop;
  end if;

  -- 4 quarters of computations (fresh) for every definition
  delete from public.index_computations;
  for q in 0..3 loop
    v_start := (date_trunc('quarter', current_date) - (((q + 1) * 3) || ' months')::interval)::date;
    v_end := (date_trunc('quarter', current_date) - ((q * 3) || ' months')::interval - interval '1 day')::date;
    for r in select id from public.index_definitions loop
      perform public.compute_index(r.id, v_start, v_end);
    end loop;
  end loop;

  -- sample draft press release (preview quality; not tied to a publication since none exists)
  delete from public.press_releases where index_publication_id is null;
  insert into public.press_releases (index_publication_id, release_title, release_dateline, release_body_markdown, release_boilerplate, media_contact_json, release_status, content_hash)
  values (null, 'AVIR Index — AVIR Reliability Index (DRAFT — not for distribution)',
    'AMMAN, JORDAN — [EMBARGOED until activation]',
    'AVIR Space today released the AVIR Reliability Index, a cross-operator industry benchmark computed from AVIR Mind''s reliability substrate.' || E'\n\n' ||
    'The Index stood at **96.2 percent** for the quarter, computed across [N] participating operators with a 95% confidence interval of 93.3–99.1.' || E'\n\n' ||
    '"Aviation has never had a credibly-computed, reproducible reliability benchmark that a board or a trade publication can cite," said an AVIR spokesperson. "Every AVIR Index number is reproducible from source data, carries a methodology hash, and is corrected — never edited — when refined."' || E'\n\n' ||
    'This draft is generated automatically from the Index substrate and held pending the minimum participating-tenant threshold and founder activation. Methodology at avir.space/index.',
    'About AVIR Space: AVIR Mind is the operating system for aviation operations, unifying maintenance, compliance, crew, flight ops, and reliability intelligence for operators and MROs worldwide.',
    jsonb_build_object('name', 'AVIR Press Office', 'email', 'press@avir.space'), 'draft',
    md5('avir-reliability-draft'));
end $$;
grant execute on function public.seed_demo_index(uuid, uuid, uuid) to authenticated, anon, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- Wire into signup + backfill.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user_signup()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_mro uuid;
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
      perform public.seed_demo_comms(v_org, new.id);
      v_mro := public.seed_demo_mro(new.id);
      perform public.seed_demo_enterprise(v_org, new.id);
      perform public.seed_demo_index(v_org, v_mro, new.id);
    end if;
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

do $$
declare r record; v_mro uuid;
begin
  for r in select o.id as org_id, (select m.user_id from public.org_members m where m.org_id = o.id order by (m.role = 'owner') desc limit 1) as user_id
           from public.orgs o where o.primary_business_model = 'operator' loop
    if r.user_id is not null then
      select o.id into v_mro from public.orgs o join public.org_members m on m.org_id = o.id
        where m.user_id = r.user_id and o.primary_business_model = 'mro' limit 1;
      perform public.seed_demo_index(r.org_id, v_mro, r.user_id);
    end if;
  end loop;
end $$;
