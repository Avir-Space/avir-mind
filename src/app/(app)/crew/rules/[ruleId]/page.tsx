"use client";

import { ChevronLeft, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { REGULATOR_LABEL } from "@/lib/design/crew";
import { useRuleConfigurations } from "@/lib/queries/use-crew";
import { useCrewActions } from "@/lib/mutations/use-crew-actions";
import { useAuth } from "@/lib/providers/auth-provider";

function Section({ title, obj }: { title: string; obj: Record<string, unknown> }) {
  return (
    <section>
      <p className="eyebrow mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-border/50 pb-1">
            <span className="font-mono text-[11px] text-label">{k}</span>
            <span className="font-mono text-[12px] text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RuleDetailPage() {
  const params = useParams<{ ruleId: string }>();
  const { orgRole } = useAuth();
  const { data: configs, isLoading } = useRuleConfigurations();
  const { updateRuleConfig } = useCrewActions();
  const { toast } = useToast();
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  const cfg = useMemo(() => (configs ?? []).find((c) => c.id === params.ruleId), [configs, params.ruleId]);
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (isLoading || !cfg) {
    return <div className="p-6"><Skeleton className="h-10 w-64" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  }
  const rs = cfg.rule_stack as Record<string, Record<string, unknown>>;
  const ftl = rs.flight_time_limits ?? {};
  const dtl = rs.duty_time_limits ?? {};

  const editable: { path: [string, string]; label: string }[] = [
    { path: ["flight_time_limits", "24h_max_hours"], label: "24h max flight hours" },
    { path: ["flight_time_limits", "168h_max_hours"], label: "168h max flight hours" },
    { path: ["duty_time_limits", "max_duty_period_hours"], label: "Max duty period (h)" },
    { path: ["duty_time_limits", "min_rest_between_duties_hours"], label: "Min rest between duties (h)" },
  ];

  async function save() {
    const next = JSON.parse(JSON.stringify(rs));
    for (const { path } of editable) {
      const key = path.join(".");
      if (edits[key] !== undefined && edits[key] !== "") next[path[0]][path[1]] = Number(edits[key]);
    }
    try {
      await updateRuleConfig.mutateAsync({ id: cfg!.id, ruleStack: next });
      toast({ title: "Rule configuration saved" });
      setEdits({});
    } catch (e) { toast({ title: "Save failed", description: String((e as Error).message), variant: "destructive" }); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 pb-4 pt-4">
        <Link href="/crew/rules" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Rule Configurations</Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-2xl text-foreground">{cfg.rule_config_name}</h1>
          <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-label">{REGULATOR_LABEL[cfg.regulator] ?? cfg.regulator}</span>
          {cfg.cba_overlay_name && <span className="border border-primary/40 px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary">CBA · {cfg.cba_overlay_name}</span>}
        </div>
        <p className="mt-1 font-mono text-[11px] text-hint">Effective {cfg.effective_from} · roles {(cfg.applicable_roles ?? ["all"]).join(", ")}</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto avir-scroll p-6">
        <div className="max-w-3xl space-y-6">
          <Section title="Flight time limits" obj={ftl} />
          <Section title="Duty time limits" obj={dtl} />
          {rs.cba_overlays && <Section title="CBA overlays" obj={rs.cba_overlays} />}
          {rs.fatigue_extensions && <Section title="Fatigue extensions" obj={rs.fatigue_extensions} />}

          <section className="border-t border-border pt-5">
            <p className="eyebrow mb-2 inline-flex items-center gap-1.5">{!isAdmin && <Lock className="h-3 w-3" />} Edit key limits</p>
            {!isAdmin ? (
              <p className="text-sm text-hint">Rule configuration editing is restricted to tenant admins.</p>
            ) : (
              <div className="max-w-md space-y-3">
                {editable.map(({ path, label }) => {
                  const key = path.join(".");
                  const current = (rs[path[0]]?.[path[1]] as number) ?? "";
                  return (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <label className="text-[13px] text-body">{label}</label>
                      <Input className="w-24" type="number" defaultValue={String(current)} onChange={(e) => setEdits((s) => ({ ...s, [key]: e.target.value }))} />
                    </div>
                  );
                })}
                <Button onClick={save} disabled={updateRuleConfig.isPending}>{updateRuleConfig.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save changes</Button>
              </div>
            )}
          </section>

          <section>
            <p className="eyebrow mb-2">Raw rule stack</p>
            <pre className="max-h-64 overflow-auto avir-scroll border border-border bg-surface/40 p-3 font-mono text-[11px] text-body"><MonoText>{JSON.stringify(cfg.rule_stack, null, 2)}</MonoText></pre>
          </section>
        </div>
      </div>
    </div>
  );
}
