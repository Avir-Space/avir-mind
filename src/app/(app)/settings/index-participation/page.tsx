"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/providers/auth-provider";
import { useIndexActions, useIndexParticipation } from "@/lib/queries/use-index";

type J = Record<string, unknown>;

export default function IndexParticipationPage() {
  const { orgRole } = useAuth();
  const isAdmin = orgRole === "owner" || orgRole === "admin";
  const { data: rows, isLoading } = useIndexParticipation();
  const { grantConsent, withdrawConsent } = useIndexActions();
  const { toast } = useToast();

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/settings" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Settings</Link></div>
      <PageHeader eyebrow="Data sharing" title="AVIR Index Participation" subtitle="Opt in per Index category. Aggregate-only by default — never tenant-identified. Withdraw anytime." />

      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div> : (
          <div className="max-w-3xl space-y-2">
            {(rows ?? []).map((r: J) => {
              const granted = r.consent_status === "granted";
              return (
                <div key={String(r.id)} className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-foreground">{String(r.index_name)}</p>
                    <p className="text-[12px] text-subtext">{String(r.description)}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase text-hint">{String(r.consent_status)}{r.data_visibility_scope ? ` · ${String(r.data_visibility_scope)}` : ""}</p>
                  </div>
                  {isAdmin && (granted
                    ? <Button size="sm" variant="outline" onClick={() => withdrawConsent.mutate({ defId: String(r.id) }, { onSuccess: () => toast({ title: "Consent withdrawn", description: "Future computations will exclude your data." }) })}>Withdraw</Button>
                    : <Button size="sm" onClick={() => grantConsent.mutate({ defId: String(r.id) }, { onSuccess: () => toast({ title: "Consent granted", description: "Aggregate-only participation." }) })}>Participate</Button>)}
                </div>
              );
            })}
            {(rows?.length ?? 0) === 0 && <p className="text-sm text-hint">No Index categories.</p>}
            <p className="pt-2 text-[11px] text-hint">Withdrawing consent blocks future computations from including your tenant; already-published Index numbers remain immutable and are not retroactively changed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
