// AVIR Mind — Phase 13: api-v1 public API gateway
//
// The API is the boundary. Bearer API-key auth (SHA-256 hash lookup) → scope
// check → per-minute rate limiting (429 + Retry-After) → org-scoped data access
// → every request logged to api_requests. Deployed at the function URL; front it
// with api.avir.space via a CNAME/proxy. All access is scoped to the key's org
// (tenant isolation enforced by the gateway).

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Required scope per (method, resource). Read scopes gate GETs; write scopes gate mutations.
function requiredScope(method: string, resource: string): string | null {
  const r = resource.split("/")[0];
  if (method === "GET") {
    const map: Record<string, string> = { signals: "read:signals", aircraft: "read:aircraft", tasks: "read:tasks", components: "read:components", flights: "read:flights", crew: "read:crew", compliance: "read:compliance", calibration: "read:calibration", inventory: "read:inventory" };
    return map[r] ?? "read:" + r;
  }
  const map: Record<string, string> = { tasks: "write:tasks", signals: "write:signals", aircraft: "write:aircraft", components: "write:components", flights: "write:flights", inventory: "write:inventory", crew: "write:crew", backtest: "write:backtest" };
  return map[r] ?? "write:" + r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const url = new URL(req.url);
  // Strip the function mount + optional /v1 prefix → the resource path.
  let path = url.pathname.replace(/^\/api-v1/, "").replace(/^\/functions\/v1\/api-v1/, "");
  path = path.replace(/^\/v1/, "").replace(/^\//, ""); // e.g. "signals", "aircraft/<id>/tasks"
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const respond = (status: number, body: unknown, extraHeaders: Record<string, string> = {}, keyId?: string, org?: string, rlRemaining?: number, errMsg?: string) => {
    const bodyStr = JSON.stringify(body);
    // Fire-and-forget request log.
    if (org) {
      admin.from("api_requests").insert({
        org_id: org, api_key_id: keyId ?? null, request_method: req.method, request_path: "/v1/" + path,
        response_status_code: status, response_body_size_bytes: bodyStr.length, duration_ms: Date.now() - started,
        rate_limit_remaining: rlRemaining ?? null, request_started_at_utc: new Date(started).toISOString(),
        request_completed_at_utc: new Date().toISOString(), error_message: errMsg ?? null,
        user_agent: req.headers.get("user-agent"), request_headers_summary: { accept: req.headers.get("accept") },
      }).then(() => {});
    }
    return new Response(bodyStr, { status, headers: { ...CORS, "Content-Type": "application/json", "x-request-id": requestId, ...extraHeaders } });
  };

  try {
    // ── auth ──
    const auth = req.headers.get("Authorization") ?? "";
    const raw = auth.replace(/^Bearer\s+/i, "").trim();
    if (!raw) return respond(401, { error: "unauthorized", message: "Missing Bearer API key.", request_id: requestId });
    const hash = await sha256(raw);
    const { data: key } = await admin.from("api_keys").select("*").eq("key_hash", hash).is("revoked_at_utc", null).maybeSingle();
    if (!key) return respond(401, { error: "unauthorized", message: "Invalid or revoked API key.", request_id: requestId });
    if (key.expires_at_utc && new Date(key.expires_at_utc) < new Date()) return respond(401, { error: "unauthorized", message: "API key expired.", request_id: requestId }, {}, key.id, key.org_id);
    const org = key.org_id as string;

    // ── rate limit (per minute) ──
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from("api_requests").select("id", { count: "exact", head: true }).eq("api_key_id", key.id).gte("request_started_at_utc", windowStart);
    const used = count ?? 0;
    const limit = key.rate_limit_per_minute as number;
    const remaining = Math.max(0, limit - used - 1);
    const rlHeaders = { "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": String(remaining), "X-RateLimit-Reset": "60" };
    if (used >= limit) {
      return respond(429, { error: "rate_limit_exceeded", message: `Rate limit of ${limit}/min exceeded.`, request_id: requestId }, { ...rlHeaders, "Retry-After": "60" }, key.id, org, 0, "rate limit exceeded");
    }

    // ── scope ──
    const scopes = (key.scope as string[]) ?? [];
    const need = requiredScope(req.method, path);
    if (need && !scopes.includes(need)) {
      return respond(403, { error: "insufficient_scope", message: `This key lacks the '${need}' scope.`, request_id: requestId }, rlHeaders, key.id, org, remaining, "insufficient scope");
    }

    admin.from("api_keys").update({ last_used_at_utc: new Date().toISOString() }).eq("id", key.id).then(() => {});

    const seg = path.split("/").filter(Boolean); // e.g. ["aircraft","<id>","signals"]
    const q = url.searchParams;
    const ok = (data: unknown, status = 200) => respond(status, { data, request_id: requestId }, rlHeaders, key.id, org, remaining);

    // ── routing ──
    if (req.method === "GET") {
      if (seg[0] === "signals" && !seg[1]) {
        let query = admin.from("signals").select("id, aircraft_id, category, severity, title, narrative, confidence, is_active, generated_at_utc").eq("org_id", org).order("generated_at_utc", { ascending: false }).limit(Number(q.get("limit") ?? 100));
        if (q.get("aircraft_id")) query = query.eq("aircraft_id", q.get("aircraft_id")!);
        if (q.get("active") === "true") query = query.eq("is_active", true);
        const { data } = await query; return ok(data ?? []);
      }
      if (seg[0] === "signals" && seg[1]) { const { data } = await admin.from("signals").select("*").eq("org_id", org).eq("id", seg[1]).maybeSingle(); return data ? ok(data) : respond(404, { error: "not_found", request_id: requestId }, rlHeaders, key.id, org, remaining); }
      if (seg[0] === "aircraft" && !seg[1]) { const { data } = await admin.from("aircraft").select("id, tail_number, aircraft_type, base_station, ownership_type").eq("org_id", org); return ok(data ?? []); }
      if (seg[0] === "aircraft" && seg[1] && seg[2] === "signals") { const { data } = await admin.from("signals").select("id, category, severity, title, is_active").eq("org_id", org).eq("aircraft_id", seg[1]); return ok(data ?? []); }
      if (seg[0] === "aircraft" && seg[1] && seg[2] === "tasks") { const { data } = await admin.from("tasks").select("id, title, status, parent_type, sub_type").eq("org_id", org).eq("aircraft_id", seg[1]); return ok(data ?? []); }
      if (seg[0] === "aircraft" && seg[1] && seg[2] === "components") { const { data } = await admin.from("components").select("id, part_number, serial_number, component_type, status").eq("org_id", org).eq("aircraft_id", seg[1]); return ok(data ?? []); }
      if (seg[0] === "aircraft" && seg[1]) { const { data } = await admin.from("aircraft").select("*").eq("org_id", org).eq("id", seg[1]).maybeSingle(); return data ? ok(data) : respond(404, { error: "not_found", request_id: requestId }, rlHeaders, key.id, org, remaining); }
      if (seg[0] === "tasks" && !seg[1]) { const { data } = await admin.from("tasks").select("id, aircraft_id, title, status, parent_type, sub_type, dispatch_blocking").eq("org_id", org).limit(Number(q.get("limit") ?? 100)); return ok(data ?? []); }
      if (seg[0] === "tasks" && seg[1]) { const { data } = await admin.from("tasks").select("*").eq("org_id", org).eq("id", seg[1]).maybeSingle(); return data ? ok(data) : respond(404, { error: "not_found", request_id: requestId }, rlHeaders, key.id, org, remaining); }
      if (seg[0] === "components" && !seg[1]) { const { data } = await admin.from("components").select("id, part_number, serial_number, component_type, status, health_score").eq("org_id", org).limit(200); return ok(data ?? []); }
      if (seg[0] === "components" && seg[1]) { const { data } = await admin.from("components").select("*").eq("org_id", org).eq("id", seg[1]).maybeSingle(); return data ? ok(data) : respond(404, { error: "not_found", request_id: requestId }, rlHeaders, key.id, org, remaining); }
      if (seg[0] === "flights") { const { data } = await admin.from("flights").select("id, flight_number, origin_station, destination_station, status, scheduled_departure_utc").eq("org_id", org).limit(100); return ok(data ?? []); }
      if (seg[0] === "crew") { const { data } = await admin.from("crew_members").select("id, first_name, last_name, role, base_station").eq("org_id", org).limit(200); return ok(data ?? []); }
      if (seg[0] === "compliance" && seg[1] === "ads") { const { data } = await admin.from("airworthiness_directives").select("id, ad_number, issuing_authority, ad_title, criticality, compliance_deadline_date").eq("org_id", org).limit(200); return ok(data ?? []); }
      if (seg[0] === "calibration" && seg[1] === "snapshots") { const { data } = await admin.from("calibration_snapshots").select("signal_category, confidence_level, window_days, accuracy_pct, total_signals, snapshot_date").eq("org_id", org).eq("window_days", 180).order("snapshot_date", { ascending: false }).limit(200); return ok(data ?? []); }
      return respond(404, { error: "not_found", message: `Unknown resource: /v1/${path}`, request_id: requestId }, rlHeaders, key.id, org, remaining);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (seg[0] === "tasks" && seg[1] && seg[2] === "acknowledge") {
        const { error } = await admin.from("tasks").update({ status: "acknowledged" }).eq("org_id", org).eq("id", seg[1]);
        return error ? respond(400, { error: "bad_request", message: error.message, request_id: requestId }, rlHeaders, key.id, org, remaining) : ok({ id: seg[1], acknowledged: true });
      }
      if (seg[0] === "tasks" && !seg[1]) {
        if (!body.aircraft_id || !body.title || !body.parent_type || !body.sub_type) return respond(400, { error: "validation_error", message: "aircraft_id, title, parent_type, sub_type required.", request_id: requestId }, rlHeaders, key.id, org, remaining, "validation");
        const { data, error } = await admin.from("tasks").insert({ org_id: org, aircraft_id: body.aircraft_id, title: body.title, parent_type: body.parent_type, sub_type: body.sub_type, why_summary: body.why_summary ?? null, status: "queued" }).select("id").single();
        return error ? respond(400, { error: "bad_request", message: error.message, request_id: requestId }, rlHeaders, key.id, org, remaining, error.message) : ok({ id: data?.id }, 201);
      }
      if (seg[0] === "signals" && seg[1] && seg[2] === "actions") {
        const { data, error } = await admin.from("signal_actions").insert({ org_id: org, signal_id: seg[1], action_type: body.action_type ?? "acknowledged", actor_user_id: key.created_by_user_id }).select("id").single();
        return error ? respond(400, { error: "bad_request", message: error.message, request_id: requestId }, rlHeaders, key.id, org, remaining, error.message) : ok({ id: data?.id }, 201);
      }
      return respond(404, { error: "not_found", message: `Unknown action: /v1/${path}`, request_id: requestId }, rlHeaders, key.id, org, remaining);
    }

    return respond(405, { error: "method_not_allowed", request_id: requestId }, rlHeaders, key.id, org, remaining);
  } catch (e) {
    return new Response(JSON.stringify({ error: "server_error", message: String((e as Error).message ?? e), request_id: requestId }), { status: 500, headers: { ...CORS, "Content-Type": "application/json", "x-request-id": requestId } });
  }
});
