import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-transition skeletons used by per-route loading.tsx files. The app shell
 * (sidebar + topbar) persists via (app)/layout.tsx, so these only fill <main>.
 * Bloomberg aesthetic: zero radius, muted `bg-surface`, subtle pulse — mirrors
 * the destination header/stats/table structure so navigation feels instant.
 */
type Variant = "table" | "stats-table" | "stats-tabs" | "tabs-list" | "board" | "canvas";

function Header() {
  return (
    <div className="border-b border-border px-6 py-5">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
    </div>
  );
}

function StatTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px]" />)}
    </div>
  );
}

function Rows({ count = 8, className = "h-11" }: { count?: number; className?: string }) {
  return (
    <div className="space-y-2 p-6">
      {Array.from({ length: count }).map((_, i) => <Skeleton key={i} className={`${className} w-full`} />)}
    </div>
  );
}

function TabsBar() {
  return (
    <div className="flex gap-4 border-b border-border px-6 py-3">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-24" />)}
    </div>
  );
}

export function RouteSkeleton({ variant = "table" }: { variant?: Variant }) {
  return (
    <div className="flex h-full flex-col">
      <Header />
      {variant === "table" && <Rows />}
      {variant === "stats-table" && (<><StatTiles /><Rows /></>)}
      {variant === "stats-tabs" && (<><StatTiles /><div className="mt-4"><TabsBar /><Rows count={6} /></div></>)}
      {variant === "tabs-list" && (<><TabsBar /><Rows count={6} className="h-10" /></>)}
      {variant === "board" && (
        <div className="grid flex-1 grid-cols-2 gap-3 p-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, col) => (
            <div key={col} className="space-y-2">
              <Skeleton className="h-6 w-full" />
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ))}
        </div>
      )}
      {variant === "canvas" && (<><StatTiles /><div className="p-6"><Skeleton className="h-[60vh] w-full" /></div></>)}
    </div>
  );
}
