// AVIR Mind — Phase 11: send-notification Edge Function
//
// Given a queued notification_event id, route it to the right provider and walk
// delivery_status through the pipeline. Email is real via Resend when
// RESEND_API_KEY is set; Slack and SMS are mocked for the demo (intent logged,
// marked delivered) — production swaps in the Slack Web API / Twilio.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "AVIR Mind <no-reply@mind.avir.space>";

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

    const { notification_event_id } = await req.json().catch(() => ({}));
    if (!notification_event_id) return json({ error: "notification_event_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: ev, error } = await userClient.from("notification_events").select("*").eq("id", notification_event_id).single();
    if (error || !ev) return json({ error: "not found" }, 404);
    if (ev.delivery_status !== "queued" && ev.delivery_status !== "retried") return json({ ok: true, skipped: true, status: ev.delivery_status });

    await admin.from("notification_events").update({ delivery_status: "sending", sent_at_utc: new Date().toISOString() }).eq("id", ev.id);

    const content = (ev.notification_content ?? {}) as { subject?: string; body?: string };
    let providerId = `mock-${crypto.randomUUID().slice(0, 8)}`;
    let providerResponse: Record<string, unknown> = { channel: ev.channel_type, mocked: true };
    let deliveryError: string | null = null;

    try {
      if (ev.channel_type === "email" && RESEND_API_KEY) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM, to: [ev.channel_address], subject: content.subject ?? "AVIR Mind notification",
            html: `<div style="font-family:system-ui,sans-serif"><h2 style="color:#1019EC">${content.subject ?? ""}</h2><p>${content.body ?? ""}</p><p style="color:#888;font-size:12px">Sent by AVIR Mind · severity ${ev.severity ?? "medium"}</p></div>`,
          }),
        });
        const rj = await resp.json().catch(() => ({}));
        if (!resp.ok) { deliveryError = JSON.stringify(rj); } else { providerId = rj.id ?? providerId; providerResponse = rj; }
      } else {
        // Slack / SMS / in_app / webhook → mock delivery (log intent).
        console.log(`[send-notification MOCK ${ev.channel_type}] → ${ev.channel_address}: ${content.subject}`);
        providerResponse = { channel: ev.channel_type, mocked: true, to: ev.channel_address, subject: content.subject };
      }
    } catch (sendErr) {
      deliveryError = String((sendErr as Error).message);
    }

    const finalStatus = deliveryError ? "failed" : "delivered";
    await admin.from("notification_events").update({
      delivery_status: finalStatus,
      delivered_at_utc: deliveryError ? null : new Date().toISOString(),
      delivery_error: deliveryError,
      delivery_provider_message_id: providerId,
      delivery_provider_response: providerResponse,
    }).eq("id", ev.id);

    return json({ ok: !deliveryError, status: finalStatus, provider_message_id: providerId, error: deliveryError });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
