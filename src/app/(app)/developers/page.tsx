"use client";

import { Copy, KeyRound, Webhook } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useEnterpriseActions } from "@/lib/mutations/use-enterprise-actions";
import { useApiRequests, useApiUsage, useWebhooks } from "@/lib/queries/use-enterprise";

type J = Record<string, unknown>;
const dt = (x: unknown) => (x ? new Date(String(x)).toLocaleString() : "—");

const ENDPOINTS: { method: string; path: string; scope: string }[] = [
  { method: "GET", path: "/v1/signals", scope: "read:signals" },
  { method: "GET", path: "/v1/signals/{id}", scope: "read:signals" },
  { method: "GET", path: "/v1/aircraft", scope: "read:aircraft" },
  { method: "GET", path: "/v1/aircraft/{id}/signals", scope: "read:aircraft" },
  { method: "GET", path: "/v1/aircraft/{id}/tasks", scope: "read:aircraft" },
  { method: "GET", path: "/v1/tasks", scope: "read:tasks" },
  { method: "POST", path: "/v1/tasks", scope: "write:tasks" },
  { method: "POST", path: "/v1/tasks/{id}/acknowledge", scope: "write:tasks" },
  { method: "POST", path: "/v1/signals/{id}/actions", scope: "write:signals" },
  { method: "GET", path: "/v1/components", scope: "read:components" },
  { method: "GET", path: "/v1/flights", scope: "read:flights" },
  { method: "GET", path: "/v1/crew", scope: "read:crew" },
  { method: "GET", path: "/v1/compliance/ads", scope: "read:compliance" },
  { method: "GET", path: "/v1/calibration/snapshots", scope: "read:calibration" },
];

const SDK_SNIPPET = `import { AvirClient } from "@avir-space/sdk";

const client = new AvirClient({ apiKey: process.env.AVIR_API_KEY });

const signals = await client.signals.list({ active: true });
const task = await client.tasks.create({
  aircraft_id: "xxx", title: "Borescope #1 engine",
  parent_type: "powerplant", sub_type: "engine_borescope",
});`;

function methodColor(m: string) { return m === "GET" ? "#16A34A" : m === "POST" ? "#1019EC" : "#CA8A04"; }

export default function DevelopersPage() {
  const { data: usage } = useApiUsage();
  const { data: requests } = useApiRequests();
  const { data: webhooks } = useWebhooks();
  const { registerWebhook } = useEnterpriseActions();
  const { toast } = useToast();
  const [whUrl, setWhUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const u = (usage ?? {}) as J;

  async function addWebhook() {
    if (!whUrl) return;
    try { const r = await registerWebhook(whUrl, ["signal.created", "aog.declared", "task.status_changed"]); setSecret(r.signing_secret); setWhUrl(""); }
    catch (e) { toast({ title: "Failed", description: String((e as Error).message).slice(0, 80) }); }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Platform" title="Developers" subtitle="Public API, SDK, and webhooks."
        actions={<Button asChild size="sm" variant="outline"><Link href="/settings/api-keys"><KeyRound className="h-3.5 w-3.5" /> API keys</Link></Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
          <Stat label="Requests (24h)" value={String(u.requests_24h ?? "—")} />
          <Stat label="Errors (24h)" value={String(u.errors_24h ?? "—")} tone={Number(u.errors_24h) > 0 ? "text-severity-high" : undefined} />
          <Stat label="Active keys" value={String(u.active_keys ?? "—")} />
          <Stat label="Avg latency" value={u.avg_duration_ms ? `${u.avg_duration_ms}ms` : "—"} />
        </div>

        <Tabs defaultValue="reference" className="mt-5">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="reference">API Reference</TabsTrigger>
            <TabsTrigger value="sdk">SDK</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="history">Request History</TabsTrigger>
          </TabsList></div>

          <TabsContent value="reference">
            <div className="p-6">
              <p className="mb-2 text-[13px] text-subtext">Base URL <MonoText className="text-foreground">https://api.avir.space/v1</MonoText> · Bearer API-key auth · <Link href="/developers" className="text-primary">OpenAPI 3.1</Link></p>
              <div className="border border-border">
                {ENDPOINTS.map((e) => (
                  <div key={e.method + e.path} className="flex items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0">
                    <span className="w-14 font-mono text-[11px] font-semibold" style={{ color: methodColor(e.method) }}>{e.method}</span>
                    <MonoText className="flex-1 text-[12px] text-foreground">{e.path}</MonoText>
                    <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] text-hint">{e.scope}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[11px] text-hint">Responses: 200/201 success · 400 validation · 401 auth · 403 scope · 404 not found · 429 rate limit (Retry-After) · 500 server. Every response carries X-Request-Id + X-RateLimit-* headers.</p>
            </div>
          </TabsContent>

          <TabsContent value="sdk">
            <div className="p-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="eyebrow">@avir-space/sdk · 0.1.0</p>
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText("npm install @avir-space/sdk"); toast({ title: "Copied install command" }); }}><Copy className="h-3.5 w-3.5" /> npm install</Button>
              </div>
              <pre className="overflow-x-auto border border-border bg-surface/40 p-4 font-mono text-[12px] leading-relaxed text-subtext">{SDK_SNIPPET}</pre>
            </div>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="p-6 space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1"><p className="eyebrow mb-1">Endpoint URL</p><input value={whUrl} onChange={(e) => setWhUrl(e.target.value)} placeholder="https://hooks.example.com/avir" className="h-9 w-full border border-input bg-transparent px-3 text-sm text-foreground focus:border-primary focus:outline-none" /></div>
                <Button size="sm" onClick={addWebhook}><Webhook className="h-3.5 w-3.5" /> Register</Button>
              </div>
              {secret && (
                <div className="flex items-center gap-2 border border-primary/40 bg-primary/5 p-3">
                  <MonoText className="flex-1 break-all text-[12px] text-foreground">{secret}</MonoText>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(secret); toast({ title: "Copied" }); }}><Copy className="h-3.5 w-3.5" /></Button>
                </div>
              )}
              <div className="border border-border">
                {(webhooks ?? []).map((w: J) => (
                  <div key={String(w.id)} className="flex flex-wrap items-center gap-x-4 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                    <MonoText className="flex-1 truncate text-[12px] text-foreground">{String(w.target_url)}</MonoText>
                    <span className="font-mono text-[10px] text-hint">{(w.events as string[] ?? []).join(", ")}</span>
                    <span className="font-mono text-[10px] uppercase" style={{ color: w.is_active ? "#16A34A" : "#94A3B8" }}>{w.is_active ? "active" : "off"}</span>
                    {w.last_delivery_status != null && <span className="font-mono text-[11px] text-hint">last {String(w.last_delivery_status)}</span>}
                  </div>
                ))}
                {(webhooks?.length ?? 0) === 0 && <p className="px-3 py-3 text-sm text-hint">No webhooks. Events: signal.created, signal.updated, task.status_changed, prediction.matured, aog.declared, aircraft.state_changed. HMAC-signed (X-Avir-Signature).</p>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="p-6"><div className="border border-border">
              <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label">
                <span className="w-14">Method</span><span className="flex-1">Path</span><span className="w-16">Status</span><span className="w-20">Latency</span><span className="w-40">When</span>
              </div>
              {(requests ?? []).slice(0, 60).map((r: J) => (
                <div key={String(r.id)} className="flex items-center gap-x-4 border-b border-border/50 px-3 py-1.5 last:border-b-0">
                  <span className="w-14 font-mono text-[11px] font-semibold" style={{ color: methodColor(String(r.request_method)) }}>{String(r.request_method)}</span>
                  <MonoText className="flex-1 truncate text-[11px] text-foreground">{String(r.request_path)}</MonoText>
                  <span className="w-16 font-mono text-[11px]" style={{ color: Number(r.response_status_code) >= 400 ? "#DC2626" : "#16A34A" }}>{String(r.response_status_code)}</span>
                  <span className="w-20 font-mono text-[11px] text-hint">{String(r.duration_ms ?? "—")}ms</span>
                  <span className="w-40 font-mono text-[10px] text-hint">{dt(r.request_started_at_utc)}</span>
                </div>
              ))}
              {(requests?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No API requests yet.</p>}
            </div></div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="border border-border bg-card px-5 py-4"><p className={`font-mono text-2xl leading-none ${tone ?? "text-foreground"}`}>{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}
