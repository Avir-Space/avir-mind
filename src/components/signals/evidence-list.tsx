import { Boxes, ClipboardList, Cpu, FileText, Gauge, type LucideIcon, Plane } from "lucide-react";
import Link from "next/link";

import { MonoText } from "@/components/avir/mono-text";
import { cn } from "@/lib/utils";
import type { EvidenceRef, EvidenceRefs } from "@/types/signals";

const TYPE_ICON: Record<string, LucideIcon> = {
  task: ClipboardList,
  aircraft_state: Gauge,
  maintenance_history: FileText,
  component: Cpu,
  inventory: Boxes,
  aircraft: Plane,
};

function hrefFor(ref: EvidenceRef, aircraftId: string | null): string | null {
  if (ref.type === "task" && ref.id) return `/tasks/${ref.id}`;
  if (ref.type === "aircraft_state" && aircraftId) return `/aircraft/${aircraftId}`;
  if (ref.type === "aircraft" && (ref.id || aircraftId)) return `/aircraft/${ref.id ?? aircraftId}`;
  return null;
}

function Row({ refItem, aircraftId }: { refItem: EvidenceRef; aircraftId: string | null }) {
  const Icon = TYPE_ICON[refItem.type] ?? FileText;
  const href = hrefFor(refItem, aircraftId);
  const inner = (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-label" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-label">
            {refItem.type.replace(/_/g, " ")}
          </span>
          {refItem.reference && <MonoText muted className="text-[11px]">{refItem.reference}</MonoText>}
        </div>
        <p className="text-[13px] leading-snug text-body">{refItem.summary}</p>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-colors hover:bg-surface/50">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** Renders grounded evidence: primary refs (clickable) then supporting refs. */
export function EvidenceList({
  evidence,
  aircraftId,
  className,
}: {
  evidence: EvidenceRefs;
  aircraftId: string | null;
  className?: string;
}) {
  const primary = evidence?.primary ?? [];
  const supporting = evidence?.supporting ?? [];

  if (!primary.length && !supporting.length) {
    return <p className={cn("text-xs text-hint", className)}>No evidence references.</p>;
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {primary.map((r, i) => (
        <Row key={`p-${i}`} refItem={r} aircraftId={aircraftId} />
      ))}
      {supporting.map((r, i) => (
        <div key={`s-${i}`} className="flex items-start gap-2 py-1.5 opacity-75">
          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-hint" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-hint">
              supporting · {r.type.replace(/_/g, " ")}
            </span>
            <p className="text-[13px] leading-snug text-subtext">{r.summary}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
