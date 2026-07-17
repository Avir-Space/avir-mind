"use client";

import { ArrowRight, Globe, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useIndexActions, useIndexConsents, useIndexPreview, usePartnerEmbeds, usePressReleases } from "@/lib/queries/use-index";
import { useAuth } from "@/lib/providers/auth-provider";

type J = Record<string, unknown>;
const fmt = (v: unknown, unit: unknown) => (v == null ? "—" : `${Number(v).toFixed(2)}${unit ? " " + unit : ""}`);

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="border border-border bg-card px-5 py-4"><p className="font-mono text-2xl leading-none text-foreground">{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}

export default function AdminIndexPage() {
  const { orgRole } = useAuth();
  const isFounder = orgRole === "owner";
  const { data: preview, isLoading, isError } = useIndexPreview();
  const { data: consents } = useIndexConsents();
  const { data: releases } = usePressReleases();
  const { data: embeds } = usePartnerEmbeds();
  const { embedSnippet } = useIndexActions();
  const { toast } = useToast();

  if (!isFounder || isError) return (
    <div className="flex h-full flex-col items-center justify-center text-center"><ShieldAlert className="h-8 w-8 text-label" /><p className="mt-3 text-sm text-subtext">The AVIR Index preview is restricted to the founder role.</p></div>
  );

  const stats = (preview?.stats as J) ?? {};
  const indices = (preview?.indices as J[]) ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="AVIR · Internal" title="AVIR Index — Internal Preview" subtitle="Substrate is live. Publication requires threshold + activation." />
      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
          <Stat label="Index definitions" value={String(stats.definitions ?? "—")} />
          <Stat label="Activatable (threshold met)" value={String(stats.activatable ?? 0)} />
          <Stat label="Consented tenants" value={String(stats.consented_tenants ?? 0)} />
          <Stat label="Last computation" value={stats.last_computation_utc ? new Date(String(stats.last_computation_utc)).toLocaleDateString() : "—"} />
        </div>

        <Tabs defaultValue="preview" className="mt-5">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="preview">Preview</TabsTrigger><TabsTrigger value="publications">Publications</TabsTrigger>
            <TabsTrigger value="consents">Consents</TabsTrigger><TabsTrigger value="embeds">Partner Embeds</TabsTrigger>
            <TabsTrigger value="press">Press Releases</TabsTrigger>
          </TabsList></div>

          {/* Preview */}
          <TabsContent value="preview">
            {isLoading ? <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div> : (
              <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
                {indices.map((i) => {
                  const meets = Boolean(i.meets_minimum_threshold);
                  const delta = i.prior_value != null ? Number(i.computed_value) - Number(i.prior_value) : null;
                  const higher = Boolean(i.higher_is_better);
                  const good = delta == null ? null : higher ? delta >= 0 : delta <= 0;
                  return (
                    <div key={String(i.id)} className="border border-border bg-card p-4" style={{ borderTop: `3px solid ${meets ? "#16A34A" : "#94A3B8"}` }}>
                      <div className="flex items-start justify-between">
                        <div><p className="text-[13px] font-medium text-foreground">{String(i.index_name)}</p><MonoText muted className="text-[10px]">{String(i.index_code)}</MonoText></div>
                        {i.is_publicly_visible ? <Globe className="h-4 w-4 text-severity-low" /> : null}
                      </div>
                      <p className="mt-2 font-mono text-3xl leading-none text-foreground">{Number(i.computed_value ?? 0).toFixed(1)}<span className="text-sm text-hint">{i.unit ? " " + String(i.unit) : ""}</span></p>
                      <p className="mt-1 font-mono text-[10px] text-hint">CI {fmt(i.confidence_interval_lower, "")}–{fmt(i.confidence_interval_upper, "")}{delta != null && <span style={{ color: good ? "#16A34A" : "#DC2626" }}> · {good ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} vs prior</span>}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-mono text-[11px]" style={{ color: meets ? "#16A34A" : "#EA580C" }}>{String(i.participating_tenant_count)}/{String(i.minimum_participating_tenants)} tenants</span>
                        {meets ? <Button asChild size="sm"><Link href={`/admin/index/publish/${i.computation_id}`}>Activate <ArrowRight className="h-3 w-3" /></Link></Button>
                          : <span className="font-mono text-[10px] uppercase text-hint">gated</span>}
                      </div>
                      {Number(i.publication_count) > 0 && <p className="mt-1 font-mono text-[10px] text-primary">{String(i.publication_count)} publication(s)</p>}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="px-6 pb-6 text-[12px] text-hint">All Index computations run against N tenants; with only the 2 demo tenants every category is below its 5-tenant threshold and cannot be published. To test the activation flow, lower a threshold below the preview (founder only) — the publish flow enforces content hash + 2FA re-verify and is immutable after.</p>
          </TabsContent>

          {/* Publications */}
          <TabsContent value="publications">
            <div className="p-6"><div className="border border-border">
              {indices.filter((i) => Number(i.publication_count) > 0).length === 0 ? <p className="px-3 py-4 text-sm text-hint">No publications yet. Publishing requires threshold + founder activation.</p> :
                indices.filter((i) => Number(i.publication_count) > 0).map((i) => (
                  <Link key={String(i.id)} href={`/admin/index/publish/${i.computation_id}`} className="flex items-center gap-x-4 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-surface/40">
                    <MonoText className="text-[12px] text-primary">{String(i.index_code)}</MonoText>
                    <span className="flex-1 text-[13px] text-foreground">{String(i.index_name)}</span>
                    <span className="font-mono text-[11px] text-hint">{String(i.publication_count)} version(s)</span>
                  </Link>
                ))}
            </div></div>
          </TabsContent>

          {/* Consents */}
          <TabsContent value="consents">
            <div className="p-6"><div className="border border-border">
              <div className="flex items-center gap-x-4 border-b border-border bg-surface/40 px-3 py-1.5 font-mono text-eyebrow uppercase text-label"><span className="w-52">Index</span><span className="flex-1">Tenant</span><span className="w-28">Status</span><span className="w-32">Visibility</span></div>
              {(consents ?? []).map((c: J, idx: number) => (
                <div key={idx} className="flex items-center gap-x-4 border-b border-border/50 px-3 py-2 last:border-b-0">
                  <span className="w-52 truncate text-[12px] text-foreground">{String(c.index_name)}</span>
                  <span className="flex-1 text-[12px] text-subtext">{String(c.org_name)}</span>
                  <span className="w-28 font-mono text-[11px] uppercase" style={{ color: c.consent_status === "granted" ? "#16A34A" : "#DC2626" }}>{String(c.consent_status)}</span>
                  <span className="w-32 font-mono text-[10px] text-hint">{String(c.data_visibility_scope)}</span>
                </div>
              ))}
              {(consents?.length ?? 0) === 0 && <p className="px-3 py-4 text-sm text-hint">No consent records.</p>}
            </div></div>
          </TabsContent>

          {/* Embeds */}
          <TabsContent value="embeds">
            <div className="p-6 space-y-2">
              {(embeds ?? []).map((e: J) => (
                <div key={String(e.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-card px-3 py-2.5">
                  <span className="text-[13px] font-medium text-foreground">{String(e.partner_name)}</span>
                  <MonoText muted className="text-[11px]">{String(e.partner_domain)}</MonoText>
                  <span className="font-mono text-[10px] text-hint">{String(e.embed_style)} · {String(e.embed_theme)}</span>
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => embedSnippet(String(e.id)).then((r) => { navigator.clipboard.writeText(String((r as J).snippet)); toast({ title: "Embed snippet copied" }); })}>Copy snippet</Button>
                </div>
              ))}
              {(embeds?.length ?? 0) === 0 && <p className="text-sm text-hint">No partner embeds configured.</p>}
            </div>
          </TabsContent>

          {/* Press releases */}
          <TabsContent value="press">
            <div className="p-6 space-y-2">
              {(releases ?? []).map((r: J) => (
                <div key={String(r.id)} className="border border-border bg-card p-4">
                  <div className="flex items-center gap-2"><p className="flex-1 text-[13px] font-medium text-foreground">{String(r.release_title)}</p><span className="font-mono text-[10px] uppercase text-hint">{String(r.release_status)}</span></div>
                  <p className="mt-0.5 font-mono text-[10px] text-hint">{String(r.release_dateline)}</p>
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[12px] leading-snug text-subtext">{String(r.release_body_markdown)}</p>
                </div>
              ))}
              {(releases?.length ?? 0) === 0 && <p className="text-sm text-hint">No press releases.</p>}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
