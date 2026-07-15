import { cn } from "@/lib/utils";

/**
 * Standard page header. Title in Instrument Serif, subtitle in Satoshi.
 * `actions` renders on the right (buttons, filters); `meta` renders under the
 * subtitle (e.g. LastUpdated, counts).
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  meta,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="font-serif text-3xl leading-none text-foreground">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-subtext">{subtitle}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-3">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
