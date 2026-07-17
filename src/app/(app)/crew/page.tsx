"use client";

import { CalendarRange, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CREW_ROLE, crewRole, dutyType, qualStatusHex } from "@/lib/design/crew";
import { useAssignments, useCrewDirectory, useCrewRoster, useCrewStats, useExpiringQualifications } from "@/lib/queries/use-crew";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { cn } from "@/lib/utils";

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div className="border border-border bg-card px-5 py-4"><p className={cn("font-mono text-2xl leading-none", tone ?? "text-foreground")}>{value}</p><p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p></div>;
}

const days14 = () => {
  const out: string[] = [];
  for (let i = 0; i < 14; i++) out.push(new Date(Date.now() + i * 86400000).toISOString().slice(0, 10));
  return out;
};

export default function CrewPage() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const days = useMemo(days14, []);
  const { data: stats } = useCrewStats();
  const { data: directory, isLoading } = useCrewDirectory();
  const { data: roster } = useCrewRoster(days[0]!, days[13]!);
  const { data: expiring } = useExpiringQualifications(30);
  const { data: assignments } = useAssignments();
  const [roles, setRoles] = useState<string[]>([]);

  const dutyMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const d of roster?.duties ?? []) {
      if (!m.has(d.crew_member_id)) m.set(d.crew_member_id, new Map());
      m.get(d.crew_member_id)!.set(d.day, d.duty_type);
    }
    return m;
  }, [roster]);

  const filteredCrew = useMemo(() => (roster?.crew ?? []).filter((c) => !roles.length || (c.role && roles.includes(c.role))), [roster, roles]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Crew" title="Crew" subtitle="Every person, every qualification, every duty."
        actions={<Button asChild size="sm" variant="outline"><Link href="/crew/roster"><CalendarRange className="h-3.5 w-3.5" /> Full roster</Link></Button>} />

      <div className="flex-1 overflow-y-auto avir-scroll">
        <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
          {!stats ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px]" />) : (
            <>
              <StatTile label="Active Crew" value={stats.active_total} />
              <StatTile label="Currency Issues" value={stats.currency_issues} tone="text-severity-high" />
              <StatTile label="Rest Violations (wk)" value={stats.rest_violations_week} tone="text-severity-critical" />
              <StatTile label="Fatigue Risk" value={stats.fatigue_risk} tone="text-severity-medium" />
            </>
          )}
        </div>

        <div className="px-6 py-4">
          <p className="eyebrow mb-1">By role</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats?.by_role ?? {}).map(([role, c]) => {
              const cr = crewRole(role);
              return <span key={role} className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-xs text-body"><cr.icon className="h-3.5 w-3.5 text-label" /> {cr.label} · <span className="font-mono">{c}</span></span>;
            })}
          </div>
        </div>

        <Tabs defaultValue="roster">
          <div className="border-b border-border px-6"><TabsList className="w-full justify-start">
            <TabsTrigger value="roster">Roster</TabsTrigger><TabsTrigger value="directory">Directory</TabsTrigger>
            <TabsTrigger value="currency">Currency{expiring?.length ? ` (${expiring.length})` : ""}</TabsTrigger><TabsTrigger value="assignments">Assignments</TabsTrigger>
          </TabsList></div>

          {/* Roster grid (14 days, read-only preview) */}
          <TabsContent value="roster">
            <div className="flex h-12 items-center gap-3 border-b border-border px-6">
              <FilterDropdown label="Role" options={Object.entries(CREW_ROLE).map(([v, x]) => ({ value: v, label: x.label }))} selected={roles} onChange={setRoles} />
              <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries({ flight: "Flight", training: "Training", standby_airport: "Standby", reserve: "Reserve", deadhead: "Deadhead" }).map(([k, l]) => (
                  <span key={k} className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-label"><span className="h-2 w-2" style={{ background: dutyType(k).hex }} /> {l}</span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto avir-scroll">
              <table className="min-w-max text-sm">
                <thead><tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-page px-3 py-2 text-left font-mono text-eyebrow uppercase text-label">Crew</th>
                  {days.map((d) => <th key={d} className="px-1 py-2 text-center font-mono text-[9px] text-hint">{d.slice(5)}</th>)}
                </tr></thead>
                <tbody>
                  {filteredCrew.map((c) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="sticky left-0 z-10 bg-page px-3 py-1.5"><Link href={`/crew/${c.id}`} className="font-mono text-[12px] text-primary hover:underline">{c.last_name}, {c.first_name[0]}</Link><span className="ml-1 font-mono text-[9px] uppercase text-hint">{crewRole(c.role).label}</span></td>
                      {days.map((d) => {
                        const duty = dutyMap.get(c.id)?.get(d);
                        return <td key={d} className="px-0.5 py-1.5 text-center">{duty ? <span className="inline-block h-4 w-6" style={{ background: dutyType(duty).hex }} title={dutyType(duty).label} /> : <span className="inline-block h-4 w-6 bg-surface/40" />}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCrew.length === 0 && <p className="p-6 text-sm text-hint">No crew match.</p>}
            </div>
          </TabsContent>

          {/* Directory */}
          <TabsContent value="directory">
            {isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div> : (
              <Table>
                <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Name</TableHead><TableHead>Emp ID</TableHead><TableHead>Role</TableHead><TableHead>Base</TableHead><TableHead>Quals</TableHead><TableHead>Currency</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(directory ?? []).map((c) => (
                    <TableRow key={c.id} className="cursor-pointer">
                      <TableCell className="py-0"><Link href={`/crew/${c.id}`} className="flex items-center py-3.5 font-medium text-primary hover:underline">{c.first_name} {c.last_name}</Link></TableCell>
                      <TableCell><MonoText muted>{c.employee_id}</MonoText></TableCell>
                      <TableCell className="text-subtext">{crewRole(c.role).label}</TableCell>
                      <TableCell><MonoText muted>{c.home_base_station ?? "—"}</MonoText></TableCell>
                      <TableCell className="font-mono text-[13px]">{c.qual_count}</TableCell>
                      <TableCell>{c.currency_issues > 0 ? <span className="font-mono text-[12px] text-severity-critical">{c.currency_issues} issue{c.currency_issues === 1 ? "" : "s"}</span> : c.expiring_soon > 0 ? <span className="font-mono text-[12px] text-severity-high">{c.expiring_soon} expiring</span> : <span className="font-mono text-[12px] text-severity-low">current</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* Currency */}
          <TabsContent value="currency">
            <div className="p-6">
              {!expiring || expiring.length === 0 ? <EmptyState icon={Users} headline="No expiring qualifications"><p>No qualifications expire in the next 30 days.</p></EmptyState> : (
                <div className="border border-border">
                  {expiring.map((q) => (
                    <Link key={q.id} href={`/crew/${q.crew_member_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-surface/40">
                      <span className="h-2 w-2 rounded-full" style={{ background: qualStatusHex(q.status, q.days_to_expiry) }} />
                      <span className="text-[13px] font-medium text-foreground">{q.first_name} {q.last_name}</span>
                      <span className="font-mono text-[11px] uppercase text-label">{crewRole(q.role).label}</span>
                      <span className="text-[13px] text-subtext">{q.qualification_name}</span>
                      <span className="ml-auto font-mono text-[12px]" style={{ color: qualStatusHex(q.status, q.days_to_expiry) }}>{q.days_to_expiry < 0 ? `expired ${-q.days_to_expiry}d ago` : `${q.days_to_expiry}d`}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Assignments */}
          <TabsContent value="assignments">
            <div className="p-6">
              <div className="border border-border">
                {(assignments ?? []).map((a) => {
                  const cm = a.crew_members as unknown as { first_name: string; last_name: string; role: string } | null;
                  const fs = a.flight_schedules as unknown as { flight_number: string; origin_station: string; destination_station: string; scheduled_departure_utc: string } | null;
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2 last:border-b-0">
                      <ChevronRight className="h-3.5 w-3.5 text-hint" />
                      <span className="text-[13px] font-medium text-foreground">{cm?.first_name} {cm?.last_name}</span>
                      <span className="font-mono text-[10px] uppercase text-label">{a.role_on_flight}</span>
                      <span className="font-mono text-[12px] text-primary">{fs?.flight_number}</span>
                      <span className="font-mono text-[11px] text-hint">{fs?.origin_station} → {fs?.destination_station}</span>
                      <span className="ml-auto font-mono text-[10px] uppercase text-subtext">{a.assignment_status}</span>
                      <span className="font-mono text-[11px] text-hint">{fs ? new Date(fs.scheduled_departure_utc).toLocaleDateString() : ""}</span>
                    </div>
                  );
                })}
                {(!assignments || assignments.length === 0) && <p className="px-3 py-4 text-sm text-hint">No assignments yet.</p>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
