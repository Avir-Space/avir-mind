// AVIR Mind — Phase 14: compute-avir-index Edge Function
//
// Scheduled (monthly / per index_definition.computation_frequency). For each
// Index definition, compute the current period across all consented tenants and
// record the result — flagging whether the minimum participating-tenant
// threshold is met. Deterministic SQL under the hood; ~$0.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** Current-period bounds (previous full quarter). */
function period() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const start = new Date(Date.UTC(now.getUTCFullYear(), q * 3 - 3, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Callable by a founder (JWT) or a scheduler with the service key.
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader.includes(SERVICE_KEY);
    if (!isService) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "unauthorized" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { start, end } = period();

    const { data: defs } = await admin.from("index_definitions").select("id, index_code");
    const results: { index_code: string; computation_id: string | null; error?: string }[] = [];
    for (const d of defs ?? []) {
      const { data, error } = await admin.rpc("compute_index", { p_index_definition_id: d.id, p_period_start: start, p_period_end: end });
      results.push({ index_code: d.index_code, computation_id: error ? null : (data as string), error: error?.message });
    }
    return json({ ok: true, period: { start, end }, computed: results.length, results });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
