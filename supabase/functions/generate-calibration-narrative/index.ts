// AVIR Mind — Phase 9: generate-calibration-narrative Edge Function
//
// Given a calibration_scoreboard, ask Claude Opus for an INTELLECTUALLY HONEST
// narrative of what the calibration numbers mean — strengths AND weaknesses,
// grounded in the snapshot data, with hypotheses for miscalibration. On-demand
// (never on signup), so signup cost is unaffected. Falls back gracefully to the
// deterministic narrative already on the scoreboard if the model is unavailable.
//
// Flow: verify JWT -> load scoreboard + its snapshots (service role) ->
// build a compact accuracy table -> call Opus -> write narrative back (only if
// the scoreboard is still unpublished).

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 2000;
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
  `You are the calibration analyst for AVIR Mind, an aviation operations intelligence platform. You write the honest, public-facing explanation of how well AVIR's AI predictions have been calibrated.

Intellectual honesty is the entire point of this document. It will be read by skeptical operators and regulators.
- If accuracy is 45% at high confidence for a category, SAY SO plainly and offer a hypothesis for why (small sample, noisy outcome signal, model overconfidence, seasonal effect).
- Never inflate. "Correct 68% of the time over N=12,847" is credible; "highly accurate" is not.
- Distinguish calibration (does stated confidence match observed accuracy?) from raw accuracy. High-confidence predictions being LESS accurate than their confidence implies is overconfidence — call it out.
- Respect sample size: caveat any category with n<30; do not draw strong conclusions from n<10.
- Bad calibration is data, not failure. Frame weaknesses as things to retune.

Return ONLY a JSON object, no prose, no markdown fences, matching exactly:
{
  "overall_narrative": string,
  "category_narratives": { "<category>": string, ... },
  "areas_of_strength": [string, ...],
  "areas_needing_improvement": [string, ...],
  "methodology_notes": string
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const { scoreboard_id } = await req.json().catch(() => ({}));
    if (!scoreboard_id) return json({ error: "scoreboard_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // RLS-scoped read (as the user) confirms they may see this scoreboard.
    const { data: board, error: bErr } = await userClient
      .from("calibration_scoreboards").select("*").eq("id", scoreboard_id).single();
    if (bErr || !board) return json({ error: "scoreboard not found" }, 404);
    if (board.is_published) return json({ error: "scoreboard is published and immutable" }, 409);

    const { data: snaps } = await admin
      .from("calibration_snapshots")
      .select("signal_class, signal_category, confidence_level, model_identifier, total_signals, signals_with_outcome, correct_count, partial_count, incorrect_count, accuracy_pct, sample_size_status")
      .eq("org_id", board.org_id).eq("window_days", board.window_days)
      .order("signal_category", { ascending: true });

    if (!snaps || snaps.length === 0) return json({ error: "no snapshots for scoreboard" }, 404);

    if (!ANTHROPIC_API_KEY) {
      return json({ ok: false, narrative_source: "deterministic", note: "ANTHROPIC_API_KEY not set; keeping deterministic narrative." });
    }

    const table = snaps.map((s) =>
      `${s.signal_class}/${s.signal_category} @${s.confidence_level} [${s.model_identifier ?? "?"}]: ${s.correct_count}✓/${s.partial_count}~/${s.incorrect_count}✗ of ${s.signals_with_outcome} measured (n=${s.total_signals}, ${s.accuracy_pct ?? "—"}%, ${s.sample_size_status})`
    ).join("\n");

    const userPrompt =
      `Calibration snapshots for a ${board.window_days}-day window.\nEach row: class/category @confidence [model]: correct/partial/incorrect of measured (n=total, accuracy%, sample-flag).\n\n${table}\n\nWrite the honest calibration narrative as specified.`;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const t0 = Date.now();
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const ms = Date.now() - t0;

    const raw = resp.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    let narrative: Record<string, unknown>;
    try {
      const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
      narrative = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return json({ ok: false, narrative_source: "deterministic", note: "model returned unparseable JSON; keeping deterministic narrative." });
    }

    const inTok = resp.usage?.input_tokens ?? 0;
    const outTok = resp.usage?.output_tokens ?? 0;
    const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;

    // Write back only if still unpublished (immutability guard).
    const { error: updErr } = await admin.from("calibration_scoreboards")
      .update({
        narrative,
        confidence_notes: { generated_by: MODEL, generation_ms: ms, input_tokens: inTok, output_tokens: outTok, cost_usd: Number(cost.toFixed(4)) },
      })
      .eq("id", scoreboard_id).eq("is_published", false);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, narrative_source: MODEL, cost_usd: Number(cost.toFixed(4)), generation_ms: ms, narrative });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
