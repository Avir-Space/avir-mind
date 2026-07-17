// AVIR Mind — Phase 14: generate-press-release-content Edge Function
//
// On-demand: draft an industry-appropriate press release for a published Index
// via Claude Opus (Aviation Week / AIN / ATW voice — factual, restrained, no
// hype). Falls back to the deterministic draft if the model is unavailable.
// Updates/creates the press_releases row.

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-opus-4-8";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You are AVIR Space's press office. Draft a press release announcing an AVIR Index value in the restrained, factual register of aviation trade press (Aviation Week, Aviation International News, Air Transport World).

Rules:
- No hype, no superlatives, no exclamation points. Credibility is the product.
- Lead with the number, the period, and the participating-tenant count.
- State the methodology is reproducible and hash-verified; corrections publish as new versions, never edits.
- One short quote attributed to "an AVIR spokesperson."
- End with a boilerplate "About AVIR Space" paragraph and a press contact.
- Markdown. ~250-350 words. Return ONLY the markdown body.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { index_publication_id } = await req.json().catch(() => ({}));
    if (!index_publication_id) return json({ error: "index_publication_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // Seed the deterministic draft first (also enforces founder-only + linkage).
    const { data: draftId, error: dErr } = await userClient.rpc("draft_press_release", { p_index_publication_id: index_publication_id });
    if (dErr) return json({ error: dErr.message }, 403);

    const { data: pub } = await admin.from("index_publications").select("*, index_definitions(index_name, unit, description)").eq("id", index_publication_id).single();
    if (!ANTHROPIC_API_KEY || !pub) return json({ ok: true, press_release_id: draftId, source: "deterministic", note: "Opus unavailable; deterministic draft kept." });

    const def = (pub as { index_definitions: { index_name: string; unit: string; description: string } }).index_definitions;
    const prompt = `Index: ${def.index_name}\nValue: ${pub.headline_value} ${def.unit ?? ""}\nPeriod: ${pub.period_label}\nParticipating operators: ${pub.participating_tenant_count}\nConfidence interval: ${pub.confidence_interval_lower}–${pub.confidence_interval_upper}\nWhat it measures: ${def.description}\n\nDraft the release.`;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 1400, system: SYSTEM, messages: [{ role: "user", content: prompt }] });
    const body = resp.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
    if (!body) return json({ ok: true, press_release_id: draftId, source: "deterministic" });

    const inTok = resp.usage?.input_tokens ?? 0, outTok = resp.usage?.output_tokens ?? 0;
    const cost = (inTok / 1e6) * 5 + (outTok / 1e6) * 25;
    await admin.from("press_releases").update({ release_body_markdown: body, release_status: "ready_for_review" }).eq("id", draftId);
    return json({ ok: true, press_release_id: draftId, source: MODEL, cost_usd: Number(cost.toFixed(4)), body });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
