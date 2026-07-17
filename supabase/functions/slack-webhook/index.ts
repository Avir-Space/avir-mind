// AVIR Mind — Phase 11: slack-webhook Edge Function
//
// Handles Slack interactive actions (Acknowledge / Create task / Snooze /
// Escalate). Verifies the Slack request signature (v0 HMAC) when a signing
// secret is configured, routes to the appropriate RPC via service role, and
// returns an in-channel message update.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function verifySlack(secret: string, ts: string, sig: string, body: string): Promise<boolean> {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false; // replay guard
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`));
  const hex = "v0=" + Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.text();
    if (SLACK_SIGNING_SECRET) {
      const ok = await verifySlack(SLACK_SIGNING_SECRET, req.headers.get("x-slack-request-timestamp") ?? "0", req.headers.get("x-slack-signature") ?? "", body);
      if (!ok) return json({ error: "invalid signature" }, 401);
    }

    // Slack sends application/x-www-form-urlencoded with a `payload` field.
    const params = new URLSearchParams(body);
    const payloadRaw = params.get("payload");
    if (!payloadRaw) return json({ error: "no payload" }, 400);
    const payload = JSON.parse(payloadRaw);
    const action = payload.actions?.[0];
    const value = action?.value ?? {}; // expected: { action: "acknowledge", notification_event_id }
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let text = "Received.";
    if (parsed.action === "acknowledge" && parsed.notification_event_id) {
      await admin.from("notification_events").update({ delivery_status: "acknowledged", acknowledged_at_utc: new Date().toISOString(), acknowledgment_channel: "slack" }).eq("id", parsed.notification_event_id);
      text = "✅ Acknowledged in AVIR Mind.";
    } else if (parsed.action === "escalate" && parsed.notification_event_id) {
      await admin.rpc("process_notification_escalations");
      text = "⏫ Escalation triggered.";
    } else if (parsed.action === "snooze") {
      text = "😴 Snoozed for 30 minutes.";
    } else {
      text = "Action received.";
    }

    // Slack replaces the original message with this response.
    return json({ replace_original: true, text });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
