// AVIR Mind — Phase 10: run-backtest-simulation Edge Function
//
// Triggers a replay of a backtest project. The replay itself is the deterministic
// simulate_backtest_run RPC (reuses AVIR's signal RULES over the reconstructed
// history and matches simulated signals to actual events) — kept in SQL so it is
// fast and ~$0. This function is the invocation surface (verifies the caller,
// creates the run, executes, returns the run id for polling).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { backtest_project_id, run_type } = await req.json().catch(() => ({}));
    if (!backtest_project_id) return json({ error: "backtest_project_id required" }, 400);

    // execute_backtest is SECURITY DEFINER + is_org_member-guarded and does the
    // full deterministic replay + matching inline.
    const { data, error } = await userClient.rpc("execute_backtest", { p_project: backtest_project_id, p_run_type: run_type ?? "full_replay" });
    if (error) return json({ error: error.message }, 400);

    const runId = (data as { run_id: string }).run_id;
    const { data: status } = await userClient.rpc("get_backtest_run_status", { p_run: runId });
    return json({ ok: true, run_id: runId, status });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
