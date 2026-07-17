-- AVIR Mind — Phase 8: DS.AI capture substrate.
-- 0802: the wiring that makes every AI decision auditable WITHOUT touching the
-- edge functions or engines. A trigger on signals INSERT mints an
-- ai_decision_record (+ data lineage); a trigger on signal_actions INSERT mints a
-- human_oversight_event; a trigger on component_events keeps LLP usage current.
-- Then a one-time backfill covers every pre-existing signal and signal_action, and
-- the model/prompt registries are seeded.
--
-- Doing capture at the DB layer (not in Deno) means EVERY signal path — the Opus
-- observation engine, the Haiku predictive engine, and the deterministic
-- ops/crew/inventory engines — is captured uniformly and the backfill is trivial.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: mint an ai_decision_record (+ one aircraft lineage row) for a signal.
-- Returns the decision id. Idempotent — no-op if one already exists.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._capture_ai_decision_for_signal(p_signal_id uuid)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.signals;
  v_decision_id uuid;
  v_model text;
  v_provider text;
  v_dtype text;
  v_prompt_hash text;
begin
  select * into s from public.signals where id = p_signal_id;
  if not found then return null; end if;

  select id into v_decision_id from public.ai_decision_records where linked_signal_id = p_signal_id limit 1;
  if v_decision_id is not null then return v_decision_id; end if;

  v_model := coalesce(s.generated_by_model, 'unknown');
  v_provider := case
    when v_model ilike 'claude%' then 'anthropic'
    when v_model ilike '%-engine' then 'avir-deterministic'
    else 'unknown' end;
  v_dtype := case
    when s.category ilike '%predict%' or v_model ilike '%predict%' then 'prediction_generation'
    else 'signal_generation' end;
  -- current prompt template for this producer, if one is registered
  select prompt_template_hash into v_prompt_hash
    from public.prompt_versions
    where prompt_template_identifier = v_model and deployed_to_utc is null
    order by version_number desc limit 1;

  insert into public.ai_decision_records (
    org_id, decision_type, decision_context, input_context_hash, input_context_summary,
    model_identifier, model_version_metadata, prompt_template_hash, output_content,
    output_confidence, explainability_data, linked_signal_id, decision_at_utc)
  values (
    s.org_id, v_dtype, v_model, coalesce(s.generation_context_hash, encode(digest(s.id::text, 'sha256'), 'hex')),
    jsonb_build_object('aircraft_id', s.aircraft_id, 'category', s.category, 'severity', s.severity,
      'input_tokens', s.input_tokens, 'output_tokens', s.output_tokens),
    v_model,
    jsonb_build_object('provider', v_provider, 'model', v_model,
      'deterministic', (v_provider = 'avir-deterministic'), 'generation_ms', s.generation_ms),
    v_prompt_hash,
    jsonb_build_object('title', s.title, 'narrative', s.narrative, 'recommendation', s.recommendation,
      'severity', s.severity, 'category', s.category),
    case when s.severity = 'insufficient_data' then 'insufficient_data' else s.confidence end,
    jsonb_build_object('confidence_reasoning', s.confidence_reasoning, 'evidence_refs', s.evidence_refs),
    s.id, coalesce(s.generated_at_utc, now()))
  returning id into v_decision_id;

  -- Data lineage: snapshot the aircraft the decision was made about (a real row id).
  if s.aircraft_id is not null then
    insert into public.data_lineage_records (ai_decision_record_id, source_table, source_row_id, source_data_snapshot, source_data_generated_by)
    select v_decision_id, 'aircraft', a.id,
      jsonb_build_object('tail_number', a.tail_number, 'aircraft_type', a.aircraft_type, 'base_station', a.base_station),
      'seed_avir_demo'
    from public.aircraft a where a.id = s.aircraft_id;
  end if;

  return v_decision_id;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: signals INSERT → ai_decision_record.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_capture_signal_decision()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._capture_ai_decision_for_signal(new.id);
  return new;
end $$;

drop trigger if exists signals_capture_decision on public.signals;
create trigger signals_capture_decision after insert on public.signals
  for each row execute function public.tg_capture_signal_decision();

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: signal_actions INSERT → human_oversight_event.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_capture_oversight()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_decision_id uuid; v_type text; v_matched boolean;
begin
  select id into v_decision_id from public.ai_decision_records where linked_signal_id = new.signal_id limit 1;
  if v_decision_id is null then
    v_decision_id := public._capture_ai_decision_for_signal(new.signal_id);
  end if;
  if v_decision_id is null then return new; end if;

  v_type := case new.action_type
    when 'create_task' then 'accepted'
    when 'marked_correct' then 'accepted'
    when 'dismissed' then 'dismissed'
    when 'marked_incorrect' then 'corrected'
    else 'reviewed' end;
  v_matched := case new.action_type when 'marked_correct' then true when 'marked_incorrect' then false else null end;

  insert into public.human_oversight_events (
    org_id, ai_decision_record_id, oversight_type, oversight_action_detail,
    reviewing_user_id, reviewer_role, outcome_matched_ai, outcome_recorded_at_utc, created_at_utc)
  values (
    new.org_id, v_decision_id, v_type, coalesce(new.action_payload, '{}'::jsonb),
    new.actor_user_id, 'operator', v_matched,
    case when new.action_type in ('marked_correct','marked_incorrect') then new.created_at_utc else null end,
    new.created_at_utc);
  return new;
end $$;

drop trigger if exists signal_actions_capture_oversight on public.signal_actions;
create trigger signal_actions_capture_oversight after insert on public.signal_actions
  for each row execute function public.tg_capture_oversight();

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: component_events INSERT → keep life_limited_parts usage current.
-- Life usage is monotonic, so we only ever ratchet current_value upward.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tg_update_llp_usage()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.components;
begin
  select * into c from public.components where id = new.component_id;
  update public.life_limited_parts llp
    set current_value = case llp.life_limit_type
      when 'cycles' then greatest(llp.current_value, coalesce(new.cycles_at_event, c.current_cycles, llp.current_value))
      when 'flight_hours' then greatest(llp.current_value, coalesce(new.flight_hours_at_event, c.current_flight_hours, llp.current_value))
      else llp.current_value end,
        updated_at_utc = now()
    where llp.component_id = new.component_id and llp.life_limit_type in ('cycles','flight_hours');
  return new;
end $$;

drop trigger if exists component_events_update_llp on public.component_events;
create trigger component_events_update_llp after insert on public.component_events
  for each row execute function public.tg_update_llp_usage();

-- ═════════════════════════════════════════════════════════════════════════════
-- Model + prompt registries (global). Seeded once; the capture trigger references
-- current prompt versions by identifier.
-- ═════════════════════════════════════════════════════════════════════════════

-- Two headline Claude versions (one retired, one current) + the deterministic
-- engines so the model report has a complete row per producer.
insert into public.model_versions (model_identifier, provider, version_number, released_at_utc, deployed_from_utc, deployed_to_utc, deployment_notes, performance_baseline, known_limitations)
values
  ('claude-3-5-haiku-20241022', 'anthropic', '3.5', '2024-10-22', '2026-01-15 00:00:00+00', '2026-05-01 00:00:00+00',
   'Initial predictive-maintenance model. Retired when Haiku 4.5 shipped.',
   jsonb_build_object('avg_confidence', 'medium', 'notes', 'baseline'),
   array['Shorter context window','Superseded by 4.5']),
  ('claude-haiku-4-5-20251001', 'anthropic', '4.5', '2025-10-01', '2026-05-01 00:00:00+00', null,
   'Current predictive-maintenance model — batched per aircraft.',
   jsonb_build_object('avg_confidence', 'medium-high'),
   array['Deterministic fallback when data is insufficient']),
  ('claude-opus-4-8', 'anthropic', '4.8', '2026-01-01', '2026-05-01 00:00:00+00', null,
   'Signal observation/synthesis engine (Phase 2).',
   jsonb_build_object('avg_confidence', 'high'), '{}'),
  ('ops-engine', 'avir-deterministic', '1.0', null, '2026-07-16 00:00:00+00', null,
   'Deterministic Flight-Ops cross-module signal engine (SQL).', null, array['Rule-based; no free-form reasoning']),
  ('crew-engine', 'avir-deterministic', '1.0', null, '2026-07-15 00:00:00+00', null,
   'Deterministic crew FTL/qualification signal engine (SQL).', null, array['Rule-based']),
  ('inventory-engine', 'avir-deterministic', '1.0', null, '2026-07-14 00:00:00+00', null,
   'Deterministic inventory/asset signal engine (SQL).', null, array['Rule-based']),
  ('compliance-engine', 'avir-deterministic', '1.0', null, '2026-07-17 00:00:00+00', null,
   'Deterministic compliance/DS.AI signal engine (SQL).', null, array['Rule-based'])
on conflict (model_identifier) do nothing;

-- Five prompt versions showing the evolution of the Opus signal-synthesis prompt.
insert into public.prompt_versions (prompt_template_identifier, prompt_template_hash, version_number, prompt_content_full, deployed_from_utc, deployed_to_utc, change_summary)
select 'claude-opus-4-8', encode(extensions.digest('signal-synthesis-v' || v || '::' || body, 'sha256'), 'hex'), v, body, dfrom, dto, summ
from (values
  (1, 'You are AVIR Mind. Summarize the aircraft maintenance signals.', '2026-05-01 00:00:00+00'::timestamptz, '2026-05-20 00:00:00+00'::timestamptz, 'Initial synthesis prompt.'),
  (2, 'You are AVIR Mind. Summarize signals and ALWAYS cite evidence_refs.', '2026-05-20 00:00:00+00'::timestamptz, '2026-06-10 00:00:00+00'::timestamptz, 'Require grounded evidence citations.'),
  (3, 'You are AVIR Mind. Cite evidence and return insufficient_data rather than guessing.', '2026-06-10 00:00:00+00'::timestamptz, '2026-06-25 00:00:00+00'::timestamptz, 'Add refusal path for weak evidence.'),
  (4, 'You are AVIR Mind. Cite evidence, refuse on weak data, and calibrate confidence with reasoning.', '2026-06-25 00:00:00+00'::timestamptz, '2026-07-10 00:00:00+00'::timestamptz, 'Add calibrated confidence + reasoning field.'),
  (5, 'You are AVIR Mind. Cite evidence, refuse on weak data, calibrate confidence with reasoning, and propose concrete suggested_actions.', '2026-07-10 00:00:00+00'::timestamptz, null, 'Add structured suggested_actions.')
) as p(v, body, dfrom, dto, summ)
on conflict (prompt_template_hash) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- One-time backfill: every existing signal → decision record; every existing
-- signal_action → oversight event. Idempotent (helper + not-exists guards).
-- ═════════════════════════════════════════════════════════════════════════════
do $$
declare r record; v_decision_id uuid; v_type text; v_matched boolean;
begin
  for r in select id from public.signals loop
    perform public._capture_ai_decision_for_signal(r.id);
  end loop;

  for r in select * from public.signal_actions sa
           where not exists (
             select 1 from public.human_oversight_events h
             join public.ai_decision_records d on d.id = h.ai_decision_record_id
             where d.linked_signal_id = sa.signal_id and h.reviewing_user_id = sa.actor_user_id
               and h.created_at_utc = sa.created_at_utc)
  loop
    select id into v_decision_id from public.ai_decision_records where linked_signal_id = r.signal_id limit 1;
    if v_decision_id is null then continue; end if;
    v_type := case r.action_type
      when 'create_task' then 'accepted' when 'marked_correct' then 'accepted'
      when 'dismissed' then 'dismissed' when 'marked_incorrect' then 'corrected'
      else 'reviewed' end;
    v_matched := case r.action_type when 'marked_correct' then true when 'marked_incorrect' then false else null end;
    insert into public.human_oversight_events (org_id, ai_decision_record_id, oversight_type, oversight_action_detail, reviewing_user_id, reviewer_role, outcome_matched_ai, outcome_recorded_at_utc, created_at_utc)
    values (r.org_id, v_decision_id, v_type, coalesce(r.action_payload, '{}'::jsonb), r.actor_user_id, 'operator', v_matched,
      case when r.action_type in ('marked_correct','marked_incorrect') then r.created_at_utc else null end, r.created_at_utc);
  end loop;
end $$;
