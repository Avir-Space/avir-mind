// AVIR Mind — Phase 2: generate-signals Edge Function
//
// Generates grounded, calibrated AI signals for one aircraft using Claude.
// Invoked by the client (with the user's JWT) after generate_signals_for_aircraft
// creates a 'started' run. Idempotent: a completed run is a no-op.
//
// Flow: verify caller can see the aircraft -> gather grounded context ->
// call Anthropic (claude-opus-4-6, temp 0.2) -> validate evidence_refs ->
// insert signals -> record run metrics + cost.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";

// Current most-capable Opus (upgraded from the spec's 4-6). Note: Opus 4.8
// rejects the `temperature` param (400), so we omit it — the model is already
// low-variance for structured JSON extraction, and thinking is off by default.
const MODEL = "claude-opus-4-8";
// 3500 fits 2-5 signals with headroom; extractJson also salvages complete
// signals from a truncated response so a rare cutoff never fails the whole run.
const MAX_TOKENS = 3500;
// Opus 4.8 pricing (USD per 1M tokens): $5 in / $25 out.
const PRICE_IN = 5.0;
const PRICE_OUT = 25.0;

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
  `You are the signal generation engine for AVIR Mind, an aviation operations intelligence platform. Your job is to observe aircraft operational data and generate grounded, actionable signals that help operators make better decisions.

Ground rules:
- Every signal MUST reference specific data (tasks, state changes, maintenance events). Reference by id and reference code. No inference without grounding.
- Confidence levels: HIGH = pattern is clear and evidence is strong. MEDIUM = pattern is likely but evidence is partial. LOW = interesting observation but limited evidence.
- If data is insufficient to generate a meaningful signal for a category, generate ONE signal of type 'insufficient_data' explaining what data would be needed. This is a valid signal — do not fabricate.
- Prefer FEWER, HIGHER-QUALITY signals over many mediocre ones. Target 2-5 signals per aircraft, not 15.
- Focus on: patterns humans might miss, deferred work that's compounding, cost/risk tradeoffs, cross-module correlations (e.g., inventory shortage + upcoming maintenance).

Return JSON matching this exact structure:
{
  "signals": [
    {
      "category": string,
      "severity": "critical|high|medium|low|info|insufficient_data",
      "title": string (max 80 chars, action-oriented),
      "narrative": string (2-4 sentences, grounded),
      "recommendation": string or null,
      "confidence": "high|medium|low",
      "confidence_reasoning": string,
      "evidence_refs": {
        "primary": [{ "type", "id", "reference", "summary" }],
        "supporting": [{ "type", "summary" }]
      },
      "suggested_actions": [
        { "label": string, "description": string }
      ]
    }
  ]
}
Return ONLY the JSON object, no prose, no markdown code fences.`;

type SignalOut = {
  category: string;
  severity: string;
  title: string;
  narrative: string;
  recommendation: string | null;
  confidence: string;
  confidence_reasoning: string;
  evidence_refs: { primary?: unknown[]; supporting?: unknown[] };
  suggested_actions?: unknown[];
};

function extractJson(text: string): { signals: SignalOut[] } {
  let t = text.trim();
  // Strip markdown fences if the model added them despite instructions.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
  }
  try {
    const parsed = JSON.parse(t);
    return { signals: Array.isArray(parsed?.signals) ? parsed.signals : [] };
  } catch {
    // Truncated / malformed — salvage every complete signal object.
    return { signals: salvageSignals(text) };
  }
}

/** Recover complete {...} objects from the signals array of a truncated JSON. */
function salvageSignals(text: string): SignalOut[] {
  const i = text.indexOf('"signals"');
  const arrStart = i >= 0 ? text.indexOf("[", i) : -1;
  if (arrStart < 0) return [];
  const out: SignalOut[] = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let k = arrStart + 1; k < text.length; k++) {
    const ch = text[k];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) objStart = k;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(text.slice(objStart, k + 1)));
        } catch {
          // drop the incomplete trailing object
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return out;
}

// A signal is grounded if it has >=1 primary evidence ref — except
// insufficient_data, whose whole point is that primary evidence is missing.
function isGrounded(s: SignalOut): boolean {
  if (s.severity === "insufficient_data") return true;
  return Array.isArray(s.evidence_refs?.primary) && s.evidence_refs.primary.length >= 1;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { aircraft_id?: string; run_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const { aircraft_id, run_id } = body;
  if (!aircraft_id || !run_id) return json({ error: "aircraft_id and run_id are required" }, 400);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  // RLS enforces the caller can only see their org's aircraft.
  const { data: ac } = await userClient
    .from("aircraft")
    .select("id, org_id, tail_number, aircraft_type, base_station, ownership_type, serial_number, delivery_date")
    .eq("id", aircraft_id)
    .maybeSingle();
  if (!ac) return json({ error: "aircraft not found or not visible" }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: run } = await admin
    .from("signal_generation_runs")
    .select("*")
    .eq("id", run_id)
    .maybeSingle();
  if (!run || run.org_id !== ac.org_id) return json({ error: "run not found" }, 400);
  if (run.status === "completed") {
    return json({ run_id, signals_generated: run.signals_generated, cached: true });
  }

  if (!ANTHROPIC_API_KEY) {
    await admin.from("signal_generation_runs").update({
      status: "failed", error: "ANTHROPIC_API_KEY not configured in Supabase secrets",
      completed_at_utc: new Date().toISOString(),
    }).eq("id", run_id);
    return json({ error: "Signal generation is not configured. An administrator must set ANTHROPIC_API_KEY." }, 200);
  }

  const t0 = Date.now();
  try {
    // ── Gather grounded context ──
    const [{ data: state }, { data: tasks }, { data: priorSignals }] = await Promise.all([
      admin.from("aircraft_state").select("*").eq("aircraft_id", aircraft_id).maybeSingle(),
      admin
        .from("tasks")
        .select("id, title, why_summary, parent_type, sub_type, status, risk_band, dispatch_blocking, aog, station_code, facility, due_at_utc, created_at_utc, task_sources(source_system, source_reference_id)")
        .eq("aircraft_id", aircraft_id)
        .order("created_at_utc", { ascending: false })
        .limit(20),
      admin
        .from("signals")
        .select("title, severity, resolution_note, resolved_at_utc")
        .eq("aircraft_id", aircraft_id)
        .not("resolved_at_utc", "is", null)
        .gte("resolved_at_utc", new Date(Date.now() - 7 * 864e5).toISOString())
        .limit(8),
    ]);

    const taskIds = (tasks ?? []).map((t: { id: string }) => t.id);
    let events: unknown[] = [];
    if (taskIds.length) {
      const { data: ev } = await admin
        .from("task_events")
        .select("task_id, event_type, body, event_payload, created_at_utc")
        .in("task_id", taskIds)
        .order("created_at_utc", { ascending: false })
        .limit(50);
      events = ev ?? [];
    }

    const context = {
      aircraft: {
        id: ac.id, tail_number: ac.tail_number, aircraft_type: ac.aircraft_type,
        base_station: ac.base_station, ownership_type: ac.ownership_type,
        serial_number: ac.serial_number, delivery_date: ac.delivery_date,
      },
      current_state: state ?? null,
      active_tasks: (tasks ?? []).filter((t: { status: string }) => t.status !== "done"),
      recent_task_events: events,
      recently_resolved_signals: priorSignals ?? [],
    };

    // ── Call Claude ──
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Analyze this aircraft's operational data and generate grounded signals.\n\n` +
            JSON.stringify(context, null, 2),
        },
      ],
    });

    const textBlock = msg.content.find((b: { type: string }) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const { signals } = extractJson(textBlock?.text ?? "{}");

    const grounded = signals.filter(isGrounded);
    const suppressed = signals.length - grounded.length;
    const durationMs = Date.now() - t0;
    const inTok = msg.usage.input_tokens;
    const outTok = msg.usage.output_tokens;
    const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;

    if (grounded.length) {
      const rows = grounded.map((s) => ({
        org_id: ac.org_id,
        aircraft_id,
        category: s.category,
        severity: s.severity,
        title: (s.title ?? "").slice(0, 200),
        narrative: s.narrative ?? "",
        recommendation: s.severity === "insufficient_data" ? null : (s.recommendation ?? null),
        confidence: ["high", "medium", "low"].includes(s.confidence) ? s.confidence : "medium",
        confidence_reasoning: s.confidence_reasoning ?? "",
        evidence_refs: s.evidence_refs ?? {},
        suggested_actions: s.suggested_actions ?? [],
        generated_by_model: MODEL,
        generation_context_hash: run.generation_context_hash,
        input_tokens: inTok,
        output_tokens: outTok,
        generation_ms: durationMs,
      }));
      const { error: insErr } = await admin.from("signals").insert(rows);
      if (insErr) throw insErr;
    }

    await admin.from("signal_generation_runs").update({
      status: "completed",
      signals_generated: grounded.length,
      signals_suppressed: suppressed,
      model_used: MODEL,
      input_tokens: inTok,
      output_tokens: outTok,
      total_cost_usd: Number(cost.toFixed(4)),
      duration_ms: durationMs,
      completed_at_utc: new Date().toISOString(),
    }).eq("id", run_id);

    return json({ run_id, signals_generated: grounded.length, signals_suppressed: suppressed, cost_usd: Number(cost.toFixed(4)) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("signal_generation_runs").update({
      status: "failed", error: message.slice(0, 500), duration_ms: Date.now() - t0,
      completed_at_utc: new Date().toISOString(),
    }).eq("id", run_id);
    // 200 with an error body so the client can show a graceful message.
    return json({ error: "Signal generation failed. Please try again shortly.", detail: message.slice(0, 200) }, 200);
  }
});
