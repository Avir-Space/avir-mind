// AVIR Mind — Phase 11: policy-evaluator Edge Function
//
// The explicit-call surface for policy evaluation. DB triggers already call the
// SQL evaluator directly on signal/task INSERT (synchronous, no HTTP); this
// function lets an external caller (or a future realtime worker) evaluate an
// event and enqueue notification_events, then fan out to send-notification.

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

    const { org_id, event_type, source_type, source_id, context } = await req.json().catch(() => ({}));
    if (!org_id || !event_type || !source_id) return json({ error: "org_id, event_type, source_id required" }, 400);

    const { data, error } = await userClient.rpc("evaluate_notification_policies", {
      p_org: org_id, p_event_type: event_type, p_source_type: source_type ?? "event",
      p_source_id: source_id, p_context: context ?? {}, p_dry_run: false,
    });
    if (error) return json({ error: error.message }, 400);

    // Fan out: send each freshly queued event for this source.
    const { data: queued } = await userClient.from("notification_events")
      .select("id").eq("org_id", org_id).eq("trigger_source_id", source_id).eq("delivery_status", "queued");
    let sent = 0;
    for (const q of queued ?? []) {
      const r = await userClient.functions.invoke("send-notification", { body: { notification_event_id: q.id } });
      if (!r.error) sent++;
    }
    return json({ ok: true, evaluation: data, dispatched: sent });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
