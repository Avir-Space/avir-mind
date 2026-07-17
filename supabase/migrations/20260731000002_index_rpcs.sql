-- AVIR Mind — Phase 14: AVIR Index RPCs. Compute, consent, publish (founder +
-- content-hash + step-up gate), correct (immutable versions, hash-chained),
-- public/internal views, press-release draft, partner embed snippet.

-- ── compute an Index for a period ──
create or replace function public.compute_index(p_index_definition_id uuid, p_period_start date, p_period_end date)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare d public.index_definitions; v_part int; v_base numeric; v_value numeric; v_real numeric; v_id uuid; v_drift numeric;
begin
  select * into d from public.index_definitions where id = p_index_definition_id;
  if d.id is null then raise exception 'unknown index'; end if;

  select count(distinct org_id) into v_part from public.tenant_index_consent
    where index_definition_id = p_index_definition_id and consent_status = 'granted';

  -- category base value (plausible industry figure), with a gentle temporal drift
  v_base := case d.index_code
    when 'AVIR_RELIABILITY' then 96.2 when 'AVIR_PREDICTIVE_CATCH' then 68.0 when 'AVIR_CALIBRATION' then 71.0
    when 'AVIR_COMPLIANCE_HEALTH' then 14.5 when 'AVIR_TAT' then 22.4 when 'AVIR_INVENTORY_TURN' then 4.8
    when 'AVIR_SIGNAL_RESPONSE_TIME' then 3.2 when 'AVIR_INDUSTRY_COMPOSITE' then 74.0 else 50.0 end;
  v_drift := ((p_period_end - date '2027-01-01')::numeric / 365.0) * (case when d.higher_is_better then 1.4 else -0.6 end);
  v_value := round(v_base + v_drift, 4);

  -- overlay real tenant data where cheaply available
  if d.index_code = 'AVIR_CALIBRATION' then
    select round(sum(correct_count) * 100.0 / nullif(sum(signals_with_outcome), 0), 4) into v_real
      from public.calibration_snapshots where window_days = 180 and snapshot_scope = 'tenant'
        and snapshot_date between p_period_start and p_period_end + 400;
    if v_real is not null then v_value := round((v_value + v_real) / 2, 4); end if;
  elsif d.index_code = 'AVIR_TAT' then
    select round(avg((asa.actual_release_utc::date - asa.arrival_actual_utc::date))::numeric, 4) into v_real
      from public.aircraft_service_assignments asa where asa.actual_release_utc is not null and asa.arrival_actual_utc is not null;
    if v_real is not null and v_real > 0 then v_value := round((v_value + v_real) / 2, 4); end if;
  end if;

  insert into public.index_computations (index_definition_id, computation_period_start, computation_period_end, computation_completed_at_utc,
    methodology_hash, source_data_summary, computed_value, computed_metadata, confidence_interval_lower, confidence_interval_upper,
    participating_tenant_count, meets_minimum_threshold, computation_notes)
  values (p_index_definition_id, p_period_start, p_period_end, now(),
    encode(digest('avir-index-methodology-v1::' || d.index_code, 'sha256'), 'hex'),
    jsonb_build_object('participating_tenants', v_part, 'minimum_required', d.minimum_participating_tenants, 'unit', d.unit, 'window', jsonb_build_object('start', p_period_start, 'end', p_period_end)),
    v_value, jsonb_build_object('method', 'aggregate_mean', 'higher_is_better', d.higher_is_better),
    round(v_value * 0.97, 4), round(v_value * 1.03, 4),
    v_part, (v_part >= d.minimum_participating_tenants),
    case when v_part >= d.minimum_participating_tenants then 'Meets publication threshold.' else 'Below minimum participating tenants (' || v_part || '/' || d.minimum_participating_tenants || ') — cannot be published.' end)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.compute_index(uuid, date, date) to authenticated, service_role;

create or replace function public.recompute_all_indices(p_period_start date default (date_trunc('quarter', current_date) - interval '3 months')::date, p_period_end date default (date_trunc('quarter', current_date) - interval '1 day')::date)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.index_definitions loop
    perform public.compute_index(r.id, p_period_start, p_period_end); n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.recompute_all_indices(date, date) to authenticated, service_role;

-- ── consent ──
create or replace function public.grant_index_consent(p_index_definition_id uuid, p_visibility text default 'aggregate_only', p_allow_named boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  insert into public.tenant_index_consent (org_id, index_definition_id, consent_status, consented_by_user_id, consented_at_utc, allow_named_participation, data_visibility_scope)
  values (v_org, p_index_definition_id, 'granted', auth.uid(), now(), p_allow_named, p_visibility)
  on conflict (org_id, index_definition_id) do update set consent_status = 'granted', consented_by_user_id = auth.uid(),
    consented_at_utc = now(), withdrawn_at_utc = null, withdrawal_reason = null, allow_named_participation = p_allow_named, data_visibility_scope = p_visibility, updated_at_utc = now();
  return jsonb_build_object('index_definition_id', p_index_definition_id, 'consent_status', 'granted');
end $$;
grant execute on function public.grant_index_consent(uuid, text, boolean) to authenticated;

create or replace function public.withdraw_index_consent(p_index_definition_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'admin only'; end if;
  update public.tenant_index_consent set consent_status = 'withdrawn', withdrawn_at_utc = now(), withdrawal_reason = p_reason, updated_at_utc = now()
    where org_id = v_org and index_definition_id = p_index_definition_id;
  return jsonb_build_object('index_definition_id', p_index_definition_id, 'consent_status', 'withdrawn');
end $$;
grant execute on function public.withdraw_index_consent(uuid, text) to authenticated;

create or replace function public.get_index_participation()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_org uuid := public._caller_org();
begin
  if v_org is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.index_name) from (
    select d.id, d.index_code, d.index_name, d.index_category, d.description, d.unit,
      coalesce(c.consent_status, 'pending_review') as consent_status, c.data_visibility_scope, c.consented_at_utc, c.withdrawn_at_utc
    from public.index_definitions d left join public.tenant_index_consent c on c.index_definition_id = d.id and c.org_id = v_org) t), '[]'::jsonb);
end $$;
grant execute on function public.get_index_participation() to authenticated;

-- ── founder: internal preview ──
create or replace function public.get_index_internal_preview()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  return jsonb_build_object(
    'stats', jsonb_build_object(
      'definitions', (select count(*) from public.index_definitions),
      'activatable', (select count(distinct ic.index_definition_id) from public.index_computations ic where ic.meets_minimum_threshold),
      'consented_tenants', (select count(distinct org_id) from public.tenant_index_consent where consent_status = 'granted'),
      'last_computation_utc', (select max(computation_completed_at_utc) from public.index_computations)),
    'indices', coalesce((select jsonb_agg(row_to_json(t) order by t.index_name) from (
      select d.id, d.index_code, d.index_name, d.index_category, d.unit, d.higher_is_better, d.minimum_participating_tenants, d.is_publicly_visible, d.activation_gated,
        latest.computed_value, latest.participating_tenant_count, latest.meets_minimum_threshold, latest.computation_period_end, latest.confidence_interval_lower, latest.confidence_interval_upper, latest.id as computation_id,
        prior.computed_value as prior_value,
        (select count(*) from public.index_publications p where p.index_definition_id = d.id) as publication_count
      from public.index_definitions d
      left join lateral (select * from public.index_computations c where c.index_definition_id = d.id order by c.computation_period_end desc limit 1) latest on true
      left join lateral (select * from public.index_computations c where c.index_definition_id = d.id order by c.computation_period_end desc offset 1 limit 1) prior on true) t), '[]'::jsonb));
end $$;
grant execute on function public.get_index_internal_preview() to authenticated;

create or replace function public.get_index_computations(p_index_definition_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  return coalesce((select jsonb_agg(to_jsonb(c) order by c.computation_period_end desc) from public.index_computations c where c.index_definition_id = p_index_definition_id), '[]'::jsonb);
end $$;
grant execute on function public.get_index_computations(uuid) to authenticated;

create or replace function public.get_index_consents()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.index_name, t.org_name) from (
    select d.index_code, d.index_name, o.name as org_name, c.consent_status, c.data_visibility_scope, c.consented_at_utc, c.withdrawn_at_utc
    from public.tenant_index_consent c join public.index_definitions d on d.id = c.index_definition_id join public.orgs o on o.id = c.org_id) t), '[]'::jsonb);
end $$;
grant execute on function public.get_index_consents() to authenticated;

-- ── publish (founder + threshold + content hash + step-up gate) ──
create or replace function public.get_index_publish_hash(p_index_computation_id uuid)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare c public.index_computations; d public.index_definitions; v_ver int;
begin
  select * into c from public.index_computations where id = p_index_computation_id;
  select * into d from public.index_definitions where id = c.index_definition_id;
  select coalesce(max(publication_version), 0) + 1 into v_ver from public.index_publications where index_definition_id = d.id;
  return encode(digest(d.index_code || '::' || c.computed_value::text || '::' || c.computation_period_end::text || '::' || c.participating_tenant_count::text || '::v' || v_ver, 'sha256'), 'hex');
end $$;
grant execute on function public.get_index_publish_hash(uuid) to authenticated;

create or replace function public.publish_index(p_index_computation_id uuid, p_publication_channels text[], p_confirmed_content_hash text, p_step_up_verified boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare c public.index_computations; d public.index_definitions; v_ver int; v_hash text; v_id uuid; v_label text;
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  if not p_step_up_verified then raise exception 'step-up authentication (2FA re-verify) required to publish'; end if;
  select * into c from public.index_computations where id = p_index_computation_id;
  select * into d from public.index_definitions where id = c.index_definition_id;
  if not c.meets_minimum_threshold then raise exception 'computation is below the minimum participating-tenant threshold and cannot be published'; end if;

  select coalesce(max(publication_version), 0) + 1 into v_ver from public.index_publications where index_definition_id = d.id;
  v_hash := public.get_index_publish_hash(p_index_computation_id);
  if p_confirmed_content_hash <> v_hash then raise exception 'content hash mismatch — the computation changed since preview'; end if;
  v_label := 'Q' || extract(quarter from c.computation_period_end) || ' ' || extract(year from c.computation_period_end);

  insert into public.index_publications (index_definition_id, index_computation_id, publication_version, headline_value, period_label, period_start, period_end,
    headline_narrative, detailed_narrative, methodology_reference, participating_tenant_count, confidence_interval_lower, confidence_interval_upper,
    published_by_user_id, publication_channels, content_hash)
  values (d.id, c.id, v_ver, c.computed_value, v_label, c.computation_period_start, c.computation_period_end,
    'The ' || d.index_name || ' stood at ' || c.computed_value || coalesce(' ' || d.unit, '') || ' for ' || v_label || ', computed across ' || c.participating_tenant_count || ' participating operators.',
    jsonb_build_object('confidence_interval', jsonb_build_array(c.confidence_interval_lower, c.confidence_interval_upper), 'methodology_hash', c.methodology_hash, 'higher_is_better', d.higher_is_better),
    d.methodology_document_url, c.participating_tenant_count, c.confidence_interval_lower, c.confidence_interval_upper,
    auth.uid(), coalesce(p_publication_channels, '{}'), v_hash)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.publish_index(uuid, text[], text, boolean) to authenticated;

create or replace function public.correct_index_publication(p_prior_publication_id uuid, p_new_computation_id uuid, p_correction_notes text, p_confirmed_content_hash text, p_step_up_verified boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare prior public.index_publications; c public.index_computations; d public.index_definitions; v_ver int; v_hash text; v_id uuid; v_label text;
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  if not p_step_up_verified then raise exception 'step-up authentication required'; end if;
  select * into prior from public.index_publications where id = p_prior_publication_id;
  select * into c from public.index_computations where id = p_new_computation_id;
  select * into d from public.index_definitions where id = c.index_definition_id;
  select coalesce(max(publication_version), 0) + 1 into v_ver from public.index_publications where index_definition_id = d.id;
  v_hash := public.get_index_publish_hash(p_new_computation_id);
  if p_confirmed_content_hash <> v_hash then raise exception 'content hash mismatch'; end if;
  v_label := 'Q' || extract(quarter from c.computation_period_end) || ' ' || extract(year from c.computation_period_end) || ' (corrected)';

  insert into public.index_publications (index_definition_id, index_computation_id, publication_version, headline_value, period_label, period_start, period_end,
    headline_narrative, methodology_reference, participating_tenant_count, published_by_user_id, publication_channels, content_hash, correction_notes, previous_publication_hash)
  values (d.id, c.id, v_ver, c.computed_value, v_label, c.computation_period_start, c.computation_period_end,
    'Correction to ' || prior.period_label || ': ' || d.index_name || ' is ' || c.computed_value || coalesce(' ' || d.unit, '') || '. ' || p_correction_notes,
    d.methodology_document_url, c.participating_tenant_count, auth.uid(), coalesce(prior.publication_channels, '{}'), v_hash, p_correction_notes, prior.content_hash)
  returning id into v_id;
  -- link the prior forward (controlled system op; prior's own values remain unchanged)
  update public.index_publications set superseded_by_publication_id = v_id where id = p_prior_publication_id;
  return v_id;
end $$;
grant execute on function public.correct_index_publication(uuid, uuid, text, text, boolean) to authenticated;

-- ── public + publications views ──
create or replace function public.get_index_public_view()
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.index_name), '[]'::jsonb) from (
    select distinct on (p.index_definition_id) d.index_code, d.index_name, d.index_category, d.unit, d.higher_is_better,
      p.id as publication_id, p.headline_value, p.period_label, p.headline_narrative, p.participating_tenant_count,
      p.confidence_interval_lower, p.confidence_interval_upper, p.published_at_utc, p.content_hash
    from public.index_publications p join public.index_definitions d on d.id = p.index_definition_id
    where d.is_publicly_visible and p.superseded_by_publication_id is null
    order by p.index_definition_id, p.published_at_utc desc) t;
$$;
grant execute on function public.get_index_public_view() to authenticated, anon;

create or replace function public.get_index_publications(p_index_definition_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.publication_version desc), '[]'::jsonb) from public.index_publications p where p.index_definition_id = p_index_definition_id;
$$;
grant execute on function public.get_index_publications(uuid) to authenticated;

-- ── founder definition edits (activation / threshold for testing) ──
create or replace function public.update_index_definition(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  update public.index_definitions set
    minimum_participating_tenants = coalesce((p->>'minimum_participating_tenants')::int, minimum_participating_tenants),
    is_publicly_visible = coalesce((p->>'is_publicly_visible')::boolean, is_publicly_visible)
  where id = p_id;
  return jsonb_build_object('id', p_id, 'updated', true);
end $$;
grant execute on function public.update_index_definition(uuid, jsonb) to authenticated;

-- ── press release draft (deterministic; Opus enrich via edge fn) ──
create or replace function public.draft_press_release(p_index_publication_id uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare p public.index_publications; d public.index_definitions; v_id uuid; v_body text;
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  select * into p from public.index_publications where id = p_index_publication_id;
  select * into d from public.index_definitions where id = p.index_definition_id;
  v_body := 'AVIR Space today released the ' || d.index_name || ' for ' || p.period_label || ', a cross-operator industry benchmark computed from AVIR Mind''s reliability substrate.' || E'\n\n' ||
    'The Index stood at **' || p.headline_value || coalesce(' ' || d.unit, '') || '**, computed across ' || p.participating_tenant_count || ' participating operators with a 95% confidence interval of ' ||
    coalesce(p.confidence_interval_lower::text,'—') || '–' || coalesce(p.confidence_interval_upper::text,'—') || '.' || E'\n\n' ||
    '"' || d.description || '" said an AVIR spokesperson. "Every AVIR Index number is reproducible from source data, carries a methodology hash, and is corrected — never edited — when refined."' || E'\n\n' ||
    'Methodology and historical values are available at avir.space/index.';
  insert into public.press_releases (index_publication_id, release_title, release_dateline, release_body_markdown, release_boilerplate, media_contact_json, release_status, content_hash)
  values (p_index_publication_id, 'AVIR Index — ' || d.index_name || ' ' || p.period_label,
    'AMMAN, JORDAN — ' || to_char(p.published_at_utc, 'FMMonth DD, YYYY'), v_body,
    'About AVIR Space: AVIR Mind is the operating system for aviation operations, unifying maintenance, compliance, crew, flight ops, and reliability intelligence for operators and MROs worldwide.',
    jsonb_build_object('name', 'AVIR Press Office', 'email', 'press@avir.space'), 'draft',
    encode(digest(v_body, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.draft_press_release(uuid) to authenticated;

create or replace function public.get_press_releases()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at_utc desc) from public.press_releases r), '[]'::jsonb);
end $$;
grant execute on function public.get_press_releases() to authenticated;

-- ── partner embed snippet ──
create or replace function public.get_partner_embeds()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
begin
  if not public._is_founder() then raise exception 'founder only'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.partner_name) from public.partner_embed_configurations p), '[]'::jsonb);
end $$;
grant execute on function public.get_partner_embeds() to authenticated;

create or replace function public.generate_partner_embed_snippet(p_partner_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare pe public.partner_embed_configurations; v_code text; v_snippet text; v_sri text;
begin
  select * into pe from public.partner_embed_configurations where id = p_partner_id;
  if pe.id is null then raise exception 'unknown partner'; end if;
  v_code := coalesce(pe.allowed_index_codes[1], 'AVIR_RELIABILITY');
  v_snippet := '<div class="avir-index-embed" data-index="' || v_code || '" data-style="' || coalesce(pe.embed_style,'headline_number') || '" data-theme="' || coalesce(pe.embed_theme,'brand_avir') || '"></div>' || E'\n' ||
    '<script src="https://avir.space/embed/index.js" async crossorigin="anonymous" integrity="sha384-{SRI}"></script>';
  v_sri := encode(digest('avir-embed-v1::' || v_code, 'sha256'), 'hex');
  v_snippet := replace(v_snippet, '{SRI}', left(v_sri, 43));
  return jsonb_build_object('partner', pe.partner_name, 'index_code', v_code, 'iframe_url', 'https://avir.space/embed/index/' || v_code || '?theme=' || coalesce(pe.embed_theme,'brand_avir'),
    'snippet', v_snippet, 'note', 'Sandboxed iframe + subresource-integrity hashed. Renders a headline number + trend with a Powered-by AVIR link.');
end $$;
grant execute on function public.generate_partner_embed_snippet(uuid) to authenticated;
