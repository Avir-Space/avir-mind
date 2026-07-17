// AVIR Mind — Phase 11: generate-daily-digest Edge Function
//
// Compiles the last 24h of signals + tasks for the caller (or a specified user),
// groups by severity/category, builds a deterministic summary, stores a
// notification_digest, and sends it via Resend (real when RESEND_API_KEY is set,
// else mocked). Intended to run scheduled at ~06:00 local per user.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = "AVIR Mind <no-reply@mind.avir.space>";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member } = await userClient.from("org_members").select("org_id").eq("user_id", u.user.id).limit(1).single();
    const org = member?.org_id;
    if (!org) return json({ error: "no org" }, 400);

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: signals } = await userClient.from("signals").select("severity, category, title")
      .eq("org_id", org).eq("is_active", true).gte("generated_at_utc", since).order("severity");
    const { data: tasks } = await userClient.from("tasks").select("title, dispatch_blocking, risk_band")
      .eq("org_id", org).neq("status", "done").eq("dispatch_blocking", true).limit(10);

    const crit = (signals ?? []).filter((s) => ["critical", "high"].includes(s.severity ?? ""));
    const content = {
      headline: `Daily briefing — ${new Date().toLocaleDateString()}`,
      signals_new: signals?.length ?? 0,
      tasks_open: tasks?.length ?? 0,
      sections: [
        { title: "Critical & high signals", items: crit.slice(0, 8).map((s) => s.title) },
        { title: "Dispatch-blocking tasks", items: (tasks ?? []).map((t) => t.title) },
      ],
    };

    const html = `<div style="font-family:system-ui,sans-serif;max-width:600px">
      <h1 style="color:#1019EC;margin-bottom:4px">${content.headline}</h1>
      <p style="color:#555">${content.signals_new} new signals · ${content.tasks_open} dispatch-blocking tasks</p>
      ${content.sections.map((sec) => `<h3 style="border-bottom:1px solid #eee;padding-bottom:4px">${sec.title}</h3><ul>${sec.items.map((i) => `<li>${i}</li>`).join("") || "<li style='color:#999'>None</li>"}</ul>`).join("")}
      <p style="color:#999;font-size:12px;margin-top:20px">AVIR Mind daily briefing</p></div>`;

    const { data: digest } = await admin.from("notification_digests").insert({
      org_id: org, recipient_user_id: u.user.id, digest_type: "daily_briefing",
      period_start_utc: since, period_end_utc: new Date().toISOString(), content, delivery_status: "queued",
    }).select("id").single();

    let sent = false, providerId: string | null = null;
    const { data: emailChan } = await userClient.from("notification_channels").select("channel_address")
      .eq("user_id", u.user.id).eq("channel_type", "email").eq("is_active", true).limit(1).single();
    if (emailChan?.channel_address && RESEND_API_KEY) {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [emailChan.channel_address], subject: content.headline, html }),
      });
      const rj = await resp.json().catch(() => ({}));
      sent = resp.ok; providerId = rj.id ?? null;
    } else {
      console.log(`[daily-digest MOCK] → ${emailChan?.channel_address ?? "no email channel"}: ${content.headline}`);
      sent = true;
    }
    await admin.from("notification_digests").update({ delivery_status: sent ? "delivered" : "failed", sent_at_utc: sent ? new Date().toISOString() : null }).eq("id", digest?.id);

    return json({ ok: true, digest_id: digest?.id, sent, provider_message_id: providerId, content });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
