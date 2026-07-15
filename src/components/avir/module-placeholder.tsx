import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/avir/empty-state";
import { PageHeader } from "@/components/avir/page-header";

/**
 * Standard Phase 0 module page: a real header plus a considered first-run
 * empty state. Used by every module that isn't built yet.
 */
export function ModulePlaceholder({
  eyebrow,
  title,
  subtitle,
  icon,
  headline,
  paragraphs,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  headline: string;
  paragraphs: [string, string];
}) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <EmptyState icon={icon} headline={headline}>
        <p>{paragraphs[0]}</p>
        <p>{paragraphs[1]}</p>
      </EmptyState>
    </div>
  );
}
