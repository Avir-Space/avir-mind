"use client";

import { Check, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { useIndexActions, useIndexPublications } from "@/lib/queries/use-index";

type J = Record<string, unknown>;

export default function PublishIndexPage() {
  const { computation_id } = useParams<{ computation_id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { publishHash, publishIndex } = useIndexActions();
  const { toast } = useToast();

  const [comp, setComp] = useState<J | null>(null);
  const [def, setDef] = useState<J | null>(null);
  const [hash, setHash] = useState("");
  const [channels, setChannels] = useState<string[]>(["website"]);
  const [totpCode, setTotpCode] = useState("");
  const [hasTotp, setHasTotp] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const { data: pubs } = useIndexPublications(String(def?.id ?? ""));

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("index_computations").select("*").eq("id", computation_id).maybeSingle();
      setComp(c as J);
      if (c) { const { data: d } = await supabase.from("index_definitions").select("*").eq("id", String((c as J).index_definition_id)).maybeSingle(); setDef(d as J); }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      setHasTotp((factors?.totp?.length ?? 0) > 0);
      try { setHash(await publishHash(computation_id)); } catch { /* below threshold */ }
    })();
  }, [computation_id, supabase, publishHash]);

  async function stepUpVerify(): Promise<boolean> {
    if (!hasTotp) return confirmText === "PUBLISH"; // demo fallback when no TOTP enrolled
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) return false;
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (cErr) return false;
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code: totpCode });
    return !vErr;
  }

  async function publish() {
    setPublishing(true);
    try {
      const stepUp = await stepUpVerify();
      if (!stepUp) { toast({ title: "Step-up verification failed", description: hasTotp ? "Invalid TOTP code." : "Type PUBLISH to confirm." }); return; }
      const id = await publishIndex.mutateAsync({ compId: computation_id, channels, hash, stepUp: true });
      setPublishedId(id);
      toast({ title: "Index published", description: "Immutable. Distributed to the selected channels." });
    } catch (e) { toast({ title: "Publish failed", description: String((e as Error).message).slice(0, 120) }); }
    finally { setPublishing(false); }
  }

  if (!comp || !def) return <div className="p-6"><Skeleton className="h-9 w-64" /><div className="mt-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div></div>;
  const meets = Boolean(comp.meets_minimum_threshold);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/admin/index" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> AVIR Index</Link></div>
      <PageHeader eyebrow="Publish" title={String(def.index_name)} subtitle={`${String(def.index_code)} · period ending ${String(comp.computation_period_end)}`} />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        <div className="max-w-2xl space-y-5">
          {/* 1. Review */}
          <Section n={1} title="Review computation">
            <div className="grid grid-cols-2 gap-3 font-mono text-[12px] sm:grid-cols-4">
              <Field label="Value" v={`${Number(comp.computed_value).toFixed(2)} ${String(def.unit ?? "")}`} />
              <Field label="CI" v={`${comp.confidence_interval_lower}–${comp.confidence_interval_upper}`} />
              <Field label="Tenants" v={`${comp.participating_tenant_count}/${def.minimum_participating_tenants}`} />
              <Field label="Threshold" v={meets ? "met" : "NOT met"} />
            </div>
            <p className="mt-2 font-mono text-[10px] text-hint">methodology hash {String(comp.methodology_hash).slice(0, 32)}…</p>
          </Section>

          {!meets ? (
            <div className="border border-severity-high/40 bg-severity-high/5 p-4 text-[13px] text-severity-high">
              This computation is below the minimum participating-tenant threshold and cannot be published. Lower the threshold on the definition (founder) and recompute to test the activation flow.
            </div>
          ) : publishedId ? (
            <div className="border border-severity-low/40 bg-severity-low/5 p-4">
              <p className="inline-flex items-center gap-2 text-[14px] font-medium text-foreground"><Check className="h-4 w-4 text-severity-low" /> Published — immutable.</p>
              <p className="mt-1 font-mono text-[11px] text-hint">Publication id {publishedId}. Corrections publish as new versions.</p>
            </div>
          ) : (
            <>
              {/* 2. Content hash */}
              <Section n={2} title="Content hash">
                <div className="flex items-center gap-2 border border-border bg-surface/40 p-3"><MonoText className="flex-1 break-all text-[11px] text-foreground">{hash || "—"}</MonoText></div>
                <p className="mt-1 text-[11px] text-hint">Confirmed at publish time; a mismatch (computation changed) blocks publication.</p>
              </Section>

              {/* 3. Channels */}
              <Section n={3} title="Publication channels">
                <div className="flex flex-wrap gap-2">
                  {["website", "press_release", "partner_embed", "api"].map((ch) => (
                    <label key={ch} className="inline-flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-[11px] text-body">
                      <input type="checkbox" checked={channels.includes(ch)} onChange={(e) => setChannels((cur) => e.target.checked ? [...cur, ch] : cur.filter((x) => x !== ch))} /> {ch}
                    </label>
                  ))}
                </div>
              </Section>

              {/* 4. Step-up */}
              <Section n={4} title="Step-up authentication">
                {hasTotp ? (
                  <div><p className="eyebrow mb-1">Enter your current TOTP code to re-verify</p><Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" maxLength={6} className="w-32" /></div>
                ) : (
                  <div><p className="text-[12px] text-subtext">No TOTP factor enrolled. Type <MonoText className="text-foreground">PUBLISH</MonoText> to confirm intent (enroll 2FA in Settings for real step-up).</p><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="PUBLISH" className="mt-1 w-40" /></div>
                )}
              </Section>

              <Button onClick={publish} disabled={publishing}>{publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Confirm &amp; publish</Button>
            </>
          )}

          {(pubs?.length ?? 0) > 0 && (
            <div>
              <p className="eyebrow mb-2">Publication history</p>
              <div className="border border-border">
                {(pubs ?? []).map((p: J) => (
                  <div key={String(p.id)} className="flex flex-wrap items-center gap-x-4 border-b border-border/60 px-3 py-2 last:border-b-0">
                    <span className="font-mono text-[11px] text-foreground">v{String(p.publication_version)}</span>
                    <span className="text-[12px] text-foreground">{Number(p.headline_value).toFixed(2)} {String(def.unit ?? "")}</span>
                    <span className="text-[11px] text-hint">{String(p.period_label)}</span>
                    {p.superseded_by_publication_id ? <span className="font-mono text-[10px] uppercase text-hint">superseded</span> : <span className="font-mono text-[10px] uppercase text-severity-low">current</span>}
                    <MonoText muted className="ml-auto text-[10px]">{String(p.content_hash).slice(0, 16)}…</MonoText>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <div className="border border-border bg-card p-4"><p className="eyebrow mb-2">{n}. {title}</p>{children}</div>;
}
function Field({ label, v }: { label: string; v: string }) { return <div><p className="text-hint">{label}</p><p className="text-foreground">{v}</p></div>; }
