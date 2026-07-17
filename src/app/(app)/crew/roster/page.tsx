"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { ChevronLeft, GripVertical, Loader2, Plane } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DutyEvaluationPanel } from "@/components/crew/duty-evaluation-panel";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { CREW_ROLE, compliance, crewRole } from "@/lib/design/crew";
import { useCrewDirectory, useUpcomingFlights } from "@/lib/queries/use-crew";
import { useCrewActions } from "@/lib/mutations/use-crew-actions";
import { cn } from "@/lib/utils";
import type { CrewDirectoryItem, ProposeResult } from "@/types/crew";

function roleOnFlight(role: string | null): string {
  if (role === "captain") return "pic";
  if (role === "first_officer") return "sic";
  if (role === "cabin_crew") return "cabin_crew";
  return "jumpseat";
}

function CrewChip({ c }: { c: CrewDirectoryItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `crew:${c.id}`, data: { crew: c } });
  const cr = crewRole(c.role);
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("flex cursor-grab items-center gap-2 border border-border bg-card px-2.5 py-1.5 active:cursor-grabbing", isDragging && "opacity-40")}>
      <GripVertical className="h-3.5 w-3.5 text-hint" />
      <cr.icon className="h-3.5 w-3.5 text-label" />
      <span className="text-[13px] text-foreground">{c.last_name}, {c.first_name[0]}</span>
      <span className="font-mono text-[9px] uppercase text-hint">{cr.label}</span>
      {c.currency_issues > 0 && <span className="h-1.5 w-1.5 rounded-full bg-severity-critical" title="currency issue" />}
    </div>
  );
}

function FlightRow({ f }: { f: Record<string, unknown> }) {
  const { setNodeRef, isOver } = useDroppable({ id: `flight:${f.id}`, data: { flight: f } });
  const ac = f.aircraft as { tail_number: string; aircraft_type: string } | null;
  return (
    <div ref={setNodeRef} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 px-3 py-2.5 transition-colors", isOver && "bg-primary/5 ring-1 ring-inset ring-primary")}>
      <Plane className="h-3.5 w-3.5 text-label" />
      <span className="font-mono text-[13px] text-foreground">{String(f.flight_number ?? "—")}</span>
      <span className="font-mono text-[11px] text-hint">{String(f.origin_station)} → {String(f.destination_station)}</span>
      <MonoText muted className="text-[11px]">{ac?.tail_number} · {ac?.aircraft_type}</MonoText>
      <span className="ml-auto font-mono text-[11px] text-hint">{new Date(String(f.scheduled_departure_utc)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      <span className="font-mono text-[10px] uppercase text-primary">drop crew to assign</span>
    </div>
  );
}

export default function RosterPage() {
  const { data: directory } = useCrewDirectory();
  const { data: flights, isLoading } = useUpcomingFlights();
  const { propose, commit } = useCrewActions();
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [roles, setRoles] = useState<string[]>(["captain", "first_officer"]);
  const [active, setActive] = useState<CrewDirectoryItem | null>(null);
  const [pending, setPending] = useState<{ crew: CrewDirectoryItem; flight: Record<string, unknown>; role: string } | null>(null);
  const [result, setResult] = useState<ProposeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [override, setOverride] = useState(false);

  const crew = (directory ?? []).filter((c) => !roles.length || (c.role && roles.includes(c.role)));

  function onStart(e: DragStartEvent) { setActive((e.active.data.current?.crew as CrewDirectoryItem) ?? null); }
  async function onEnd(e: DragEndEvent) {
    setActive(null);
    const crewC = e.active.data.current?.crew as CrewDirectoryItem | undefined;
    const flightC = e.over?.data.current?.flight as Record<string, unknown> | undefined;
    if (!crewC || !flightC) return;
    const role = roleOnFlight(crewC.role);
    setPending({ crew: crewC, flight: flightC, role }); setResult(null); setOverride(false); setLoading(true);
    try {
      const r = await propose(crewC.id, flightC.id as string, role);
      setResult(r);
    } catch (err) { toast({ title: "Proposal failed", description: String((err as Error).message), variant: "destructive" }); setPending(null); }
    finally { setLoading(false); }
  }

  async function doCommit() {
    if (!pending) return;
    try {
      await commit.mutateAsync({ crewId: pending.crew.id, flightId: pending.flight.id as string, role: pending.role, override });
      toast({ title: "Assignment committed", description: `${pending.crew.first_name} ${pending.crew.last_name} → ${String(pending.flight.flight_number)}` });
      setPending(null);
    } catch (err) { toast({ title: "Commit blocked", description: String((err as Error).message), variant: "destructive" }); }
  }

  const overall = result?.duty_evaluation.overall_result ?? "compliant";
  const blocked = !result?.assignable;

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4"><Link href="/crew" className="inline-flex items-center gap-1 font-mono text-eyebrow uppercase text-label hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> Crew</Link></div>
      <PageHeader eyebrow="Crew" title="Roster" subtitle="Drag a crew member onto a flight to propose an assignment — with live FTL &amp; currency feedback." />

      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-72 shrink-0 flex-col border-r border-border">
            <div className="flex h-12 items-center border-b border-border px-4"><FilterDropdown label="Role" options={Object.entries(CREW_ROLE).map(([v, x]) => ({ value: v, label: x.label }))} selected={roles} onChange={setRoles} /></div>
            <div className="flex-1 space-y-1.5 overflow-y-auto avir-scroll p-3">
              {crew.map((c) => <CrewChip key={c.id} c={c} />)}
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto avir-scroll">
            <p className="border-b border-border px-6 py-2 font-mono text-eyebrow uppercase text-label">Upcoming flights</p>
            {isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (flights ?? []).map((f) => <FlightRow key={String(f.id)} f={f as Record<string, unknown>} />)}
          </div>
        </div>
        <DragOverlay>{active ? <div className="flex items-center gap-2 border border-primary bg-card px-2.5 py-1.5 shadow-lg"><Plane className="h-3.5 w-3.5 text-primary" /><span className="text-[13px]">{active.last_name}, {active.first_name[0]}</span></div> : null}</DragOverlay>
      </DndContext>

      <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assign {pending?.crew.first_name} {pending?.crew.last_name} → {String(pending?.flight.flight_number ?? "")} ({pending?.role})</DialogTitle></DialogHeader>
          {loading || !result ? (
            <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-32 w-full" /></div>
          ) : (
            <div className="space-y-4">
              <DutyEvaluationPanel evaluation={result.duty_evaluation} />
              <div>
                <p className="eyebrow mb-1.5">Currency ({result.currency.aircraft_type})</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.currency.required.map((q, i) => (
                    <span key={i} className={cn("border px-1.5 py-0.5 font-mono text-[10px] uppercase", q.current ? "border-severity-low/50 text-severity-low" : "border-severity-critical/50 text-severity-critical")}>{q.qualification_code}{q.current ? " ✓" : q.held ? " expired" : " missing"}</span>
                  ))}
                </div>
              </div>
              {blocked && (
                <label className="flex items-center gap-2 text-[13px] text-body">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} className="h-3.5 w-3.5 accent-[#1019EC]" />
                  Override with admin authority (logs a formal exception record).
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
            <Button onClick={doCommit} disabled={commit.isPending || (blocked && !override)} style={overall === "violation" ? { background: compliance("violation").hex } : undefined}>
              {commit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {blocked ? (override ? "Override & commit" : "Blocked") : "Commit assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
