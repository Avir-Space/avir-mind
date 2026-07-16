// AVIR Mind — Phase 3: generate-predictive-signals Edge Function
//
// Sibling of generate-signals. Analyzes a component (or every on-wing component
// on an aircraft) + fleet baseline + prior-prediction outcomes and calls Claude
// to produce grounded predictive-maintenance signals with confidence intervals.
//
// Model: claude-haiku-4-5, batched one call per aircraft (cost-controlled to the
// ~$0.15-0.25/signup budget). Invoked by the client after
// generate_predictive_signals_for_(aircraft|component) creates a 'started' run.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 4000;
// Haiku 4.5 pricing (USD per 1M tokens): $1 in / $5 out.
const PRICE_IN = 1.0;
const PRICE_OUT = 5.0;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM_PROMPT =
  `You are the predictive maintenance engine for AVIR Mind. Your job is to analyze component data and predict future maintenance events with grounded confidence intervals.

Ground rules:
- Every prediction MUST reference historical data. Prior events on this component, patterns in similar components, documented degradation trajectories. No prediction without grounding.
- Confidence levels reflect data density: HIGH = clear pattern, many data points, converging signals. MEDIUM = pattern visible but partial data. LOW = interesting observation worth flagging with weak evidence.
- Prediction horizons are ranges, not point estimates. Give lower and upper bounds in the units that matter most (hours, cycles, or date).
- If data is insufficient, produce ONE signal with "severity":"insufficient_data" explaining what would be needed, and omit prediction_horizon. Do not fabricate.
- Prefer FEWER, higher-quality predictions. Target 1-3 per component.
- Each prediction MUST include "component_serial" identifying which component it is about (copy it exactly from the input).

Return ONLY JSON (no prose, no markdown fences) matching:
{
  "predictions": [{
    "component_serial": string,
    "predicted_event_type": string,
    "severity": "critical|high|medium|low|info|insufficient_data",
    "title": string,
    "narrative": string,
    "recommendation": string,
    "confidence": "high|medium|low",
    "confidence_reasoning": string,
    "prediction_horizon": {
      "lower_bound_hours": number, "upper_bound_hours": number,
      "lower_bound_cycles": number, "upper_bound_cycles": number,
      "lower_bound_date": "YYYY-MM-DD", "upper_bound_date": "YYYY-MM-DD",
      "unit_preference": "hours|cycles|date"
    },
    "evidence_refs": { "primary": [{ "type", "id", "reference", "summary" }] },
    "historical_baseline": {
      "similar_component_count": number,
      "typical_pattern_summary": string,
      "prior_events_referenced": [{ "id", "type", "date_ago_days" }]
    }
  }]
}`;

type PredOut = {
  component_serial?: string;
  predicted_event_type?: string;
  severity: string;
  title: string;
  narrative: string;
  recommendation?: string | null;
  confidence: string;
  confidence_reasoning?: string;
  prediction_horizon?: Record<string, unknown> | null;
  evidence_refs?: { primary?: unknown[] };
  historical_baseline?: { prior_events_referenced?: unknown[] } & Record<string, unknown>;
};

function extractJson(text: string): PredOut[] {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
  }
  try {
    const parsed = JSON.parse(t);
    return Array.isArray(parsed?.predictions) ? parsed.predictions : [];
  } catch {
    return salvage(text);
  }
}
function salvage(text: string): PredOut[] {
  const i = text.indexOf('"predictions"');
  const arrStart = i >= 0 ? text.indexOf("[", i) : -1;
  if (arrStart < 0) return [];
  const out: PredOut[] = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let k = arrStart + 1; k < text.length; k++) {
    const ch = text[k];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth === 0) objStart = k; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && objStart >= 0) { try { out.push(JSON.parse(text.slice(objStart, k + 1))); } catch { /* drop */ } objStart = -1; } }
    else if (ch === "]" && depth === 0) break;
  }
  return out;
}
function isGrounded(p: PredOut): boolean {
  if (p.severity === "insufficient_data") return true;
  const ev = Array.isArray(p.evidence_refs?.primary) && p.evidence_refs!.primary!.length >= 1;
  const base = Array.isArray(p.historical_baseline?.prior_events_referenced) &&
    p.historical_baseline!.prior_events_referenced!.length >= 1;
  return ev || base;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { aircraft_id?: string; component_id?: string; run_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const { aircraft_id, component_id, run_id } = body;
  if (!run_id || (!aircraft_id && !component_id)) {
    return json({ error: "run_id and (aircraft_id or component_id) are required" }, 400);
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: run } = await admin.from("signal_generation_runs").select("*").eq("id", run_id).maybeSingle();
  if (!run) return json({ error: "run not found" }, 400);
  if (run.status === "completed") return json({ run_id, predictions_generated: run.signals_generated, cached: true });

  // Resolve target aircraft (RLS check via user client).
  const targetAircraftId = aircraft_id ?? run.aircraft_id;
  const { data: ac } = await userClient
    .from("aircraft")
    .select("id, org_id, tail_number, aircraft_type, base_station")
    .eq("id", targetAircraftId)
    .maybeSingle();
  if (!ac || ac.org_id !== run.org_id) return json({ error: "aircraft not found or not visible" }, 403);

  if (!ANTHROPIC_API_KEY) {
    await admin.from("signal_generation_runs").update({
      status: "failed", error: "ANTHROPIC_API_KEY not configured", completed_at_utc: new Date().toISOString(),
    }).eq("id", run_id);
    return json({ error: "Predictive generation is not configured." }, 200);
  }

  const t0 = Date.now();
  try {
    // ── Components in scope ──
    let compQuery = admin.from("components")
      .select("id, component_type, part_number, serial_number, position_code, status, current_cycles, current_flight_hours, cycles_since_new, cycles_since_overhaul, flight_hours_since_overhaul, limit_cycles, limit_flight_hours, overhaul_interval_cycles, overhaul_interval_hours, health_score, next_scheduled_event_type, next_scheduled_event_due_date")
      .eq("org_id", ac.org_id);
    compQuery = component_id
      ? compQuery.eq("id", component_id)
      : compQuery.eq("aircraft_id", targetAircraftId).eq("status", "on_wing");
    const { data: components } = await compQuery;
    if (!components || components.length === 0) {
      await admin.from("signal_generation_runs").update({
        status: "completed", signals_generated: 0, model_used: MODEL, completed_at_utc: new Date().toISOString(),
        duration_ms: Date.now() - t0,
      }).eq("id", run_id);
      return json({ run_id, predictions_generated: 0, note: "no components in scope" });
    }
    const compIds = components.map((c) => c.id);
    const serialToId: Record<string, string> = {};
    for (const c of components) serialToId[c.serial_number] = c.id;

    // Event history per component (last 12).
    const { data: allEvents } = await admin.from("component_events")
      .select("component_id, event_type, event_date_utc, cycles_at_event, flight_hours_at_event, finding_severity, finding_description")
      .in("component_id", compIds)
      .order("event_date_utc", { ascending: false })
      .limit(12 * compIds.length);
    const eventsByComp: Record<string, unknown[]> = {};
    for (const e of allEvents ?? []) {
      (eventsByComp[e.component_id] ??= []).push(e);
    }

    // Fleet baseline per component_type across the org.
    const { data: fleetRows } = await admin.from("components")
      .select("component_type, current_cycles, health_score")
      .eq("org_id", ac.org_id);
    const baseline: Record<string, { count: number; avg_cycles: number; avg_health: number }> = {};
    for (const r of fleetRows ?? []) {
      const b = (baseline[r.component_type] ??= { count: 0, avg_cycles: 0, avg_health: 0 });
      b.count++; b.avg_cycles += r.current_cycles ?? 0; b.avg_health += r.health_score ?? 0;
    }
    for (const k of Object.keys(baseline)) {
      baseline[k].avg_cycles = Math.round(baseline[k].avg_cycles / baseline[k].count);
      baseline[k].avg_health = Math.round(baseline[k].avg_health / baseline[k].count);
    }

    // Prior predictions + their outcomes (calibration feedback).
    const { data: priorPreds } = await admin.from("signals")
      .select("component_id, predicted_event_type, accuracy_result, generated_at_utc")
      .in("component_id", compIds)
      .eq("signal_class", "prediction")
      .not("accuracy_result", "eq", "pending")
      .limit(20);

    const context = {
      aircraft: { tail_number: ac.tail_number, aircraft_type: ac.aircraft_type, base_station: ac.base_station },
      components: components.map((c) => ({ ...c, events: eventsByComp[c.id] ?? [] })),
      fleet_baseline_by_type: baseline,
      prior_prediction_outcomes: priorPreds ?? [],
    };

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Predict maintenance events for these components.\n\n${JSON.stringify(context, null, 2)}` }],
    });
    const textBlock = msg.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    const predictions = extractJson(textBlock?.text ?? "{}");

    const grounded = predictions.filter(isGrounded);
    const suppressed = predictions.length - grounded.length;
    const durationMs = Date.now() - t0;
    const inTok = msg.usage.input_tokens, outTok = msg.usage.output_tokens;
    const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;

    if (grounded.length) {
      const rows = grounded.map((p) => {
        const insufficient = p.severity === "insufficient_data";
        return {
          org_id: ac.org_id,
          aircraft_id: targetAircraftId,
          component_id: p.component_serial ? (serialToId[p.component_serial] ?? component_id ?? null) : (component_id ?? null),
          category: "predictive_maintenance",
          severity: insufficient ? "insufficient_data"
            : (["critical", "high", "medium", "low", "info"].includes(p.severity) ? p.severity : "medium"),
          title: (p.title ?? "").slice(0, 200),
          narrative: p.narrative ?? "",
          recommendation: insufficient ? null : (p.recommendation ?? null),
          confidence: ["high", "medium", "low"].includes(p.confidence) ? p.confidence : "medium",
          confidence_reasoning: p.confidence_reasoning ?? "",
          evidence_refs: p.evidence_refs ?? {},
          suggested_actions: [],
          signal_class: insufficient ? "insufficient_data" : "prediction",
          predicted_event_type: insufficient ? null : (p.predicted_event_type ?? null),
          prediction_horizon: insufficient ? null : (p.prediction_horizon ?? null),
          historical_baseline: p.historical_baseline ?? null,
          accuracy_result: "pending",
          generated_by_model: MODEL,
          generation_context_hash: run.generation_context_hash,
          input_tokens: inTok,
          output_tokens: outTok,
          generation_ms: durationMs,
        };
      });
      const { error: insErr } = await admin.from("signals").insert(rows);
      if (insErr) throw insErr;
    }

    await admin.from("signal_generation_runs").update({
      status: "completed", signals_generated: grounded.length, signals_suppressed: suppressed,
      model_used: MODEL, input_tokens: inTok, output_tokens: outTok,
      total_cost_usd: Number(cost.toFixed(4)), duration_ms: durationMs, completed_at_utc: new Date().toISOString(),
    }).eq("id", run_id);

    return json({ run_id, predictions_generated: grounded.length, predictions_suppressed: suppressed, cost_usd: Number(cost.toFixed(4)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("signal_generation_runs").update({
      status: "failed", error: message.slice(0, 500), duration_ms: Date.now() - t0, completed_at_utc: new Date().toISOString(),
    }).eq("id", run_id);
    return json({ error: "Predictive generation failed. Please try again shortly.", detail: message.slice(0, 200) }, 200);
  }
});
