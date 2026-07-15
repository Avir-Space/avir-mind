import { cn } from "@/lib/utils";

/** Loading placeholder. Zero radius, gentle pulse. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse bg-surface", className)} {...props} />;
}

export { Skeleton };
