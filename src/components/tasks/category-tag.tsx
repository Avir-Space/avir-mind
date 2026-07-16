import { categoryMeta, humanizeSubType } from "@/lib/design/tasks";
import { cn } from "@/lib/utils";

/** Category (parent_type) icon + label, optionally with the sub_type. */
export function CategoryTag({
  parentType,
  subType,
  className,
}: {
  parentType: string;
  subType?: string;
  className?: string;
}) {
  const { label, icon: Icon } = categoryMeta(parentType);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-subtext", className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="font-mono uppercase tracking-wider">{label}</span>
      {subType && <span className="text-hint">· {humanizeSubType(subType)}</span>}
    </span>
  );
}
