"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { LayoutGrid, List, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { AircraftListView } from "@/components/fleet/aircraft-list-view";
import { LastUpdated } from "@/components/avir/last-updated";
import { PageHeader } from "@/components/avir/page-header";
import { KanbanCard } from "@/components/tasks/kanban-card";
import { KanbanColumn } from "@/components/tasks/kanban-column";
import {
  FilterChipGroup,
  FilterSearch,
  TaskFilterBar,
} from "@/components/tasks/task-filter-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { BOARD_COLUMNS, CATEGORY_CONFIG } from "@/lib/design/tasks";
import { SEVERITY_CONFIG } from "@/lib/design/state";
import { useFleetBoard, type FleetBoardFilters } from "@/lib/queries/use-fleet-board";
import { useFleets } from "@/lib/queries/use-fleets";
import { useAircraft } from "@/lib/queries/use-aircraft";
import { useTaskActions } from "@/lib/mutations/use-task-actions";
import { useTaskRealtime } from "@/lib/realtime/use-task-realtime";
import { useAuth } from "@/lib/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BoardCard, BoardColumnKey } from "@/types/tasks";

const STATE_LABEL: Record<string, string> = {
  under_maintenance: "Under Maintenance",
  in_air: "In Air",
  on_ground: "On Ground",
  stationed: "Stationed",
};

type PendingMove = { card: BoardCard; from: string; to: string };
type View = "board" | "list";

export default function FleetPage() {
  return (
    <Suspense fallback={null}>
      <Fleet />
    </Suspense>
  );
}

function Fleet() {
  const { orgId } = useAuth();
  useTaskRealtime(orgId);
  const { toast } = useToast();
  const { moveStatus } = useTaskActions();
  const params = useSearchParams();

  const { data: fleets } = useFleets();
  const { data: allAircraft } = useAircraft();

  // View: URL ?view= wins on first load, else localStorage, else Board.
  const [view, setView] = useState<View>(() => (params.get("view") === "list" ? "list" : "board"));
  const viewInit = useRef(false);
  useEffect(() => {
    if (viewInit.current) return;
    viewInit.current = true;
    if (params.get("view")) return;
    const saved = typeof window !== "undefined" ? localStorage.getItem("avir_fleet_view") : null;
    if (saved === "list" || saved === "board") setView(saved);
  }, [params]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("avir_fleet_view", view);
  }, [view]);

  // Shared filters (persist across the toggle) — initialised from the URL so a
  // filtered board is shareable, and synced back to the URL on change.
  const [fleetId, setFleetId] = useState<string>("all");
  const [stations, setStations] = useState<string[]>(() => params.getAll("station"));
  const [types, setTypes] = useState<string[]>(() => params.getAll("type"));
  const [risks, setRisks] = useState<string[]>(() => params.getAll("risk"));
  const [parents, setParents] = useState<string[]>(() => params.getAll("category"));
  const [search, setSearch] = useState(() => params.get("q") ?? "");

  useEffect(() => {
    const qs = new URLSearchParams();
    if (view === "list") qs.set("view", "list");
    stations.forEach((s) => qs.append("station", s));
    types.forEach((s) => qs.append("type", s));
    risks.forEach((s) => qs.append("risk", s));
    parents.forEach((s) => qs.append("category", s));
    if (search) qs.set("q", search);
    const str = qs.toString();
    if (typeof window !== "undefined") window.history.replaceState(null, "", str ? `/fleet?${str}` : "/fleet");
  }, [stations, types, risks, parents, search, view]);

  const filters: FleetBoardFilters = {
    fleetId: fleetId === "all" ? null : fleetId,
    stationCodes: stations,
    aircraftTypes: types,
    riskBands: risks,
    parentTypes: parents,
    search,
  };
  const { data: board, isLoading, dataUpdatedAt, refetch } = useFleetBoard(filters);

  const stationOptions = useMemo(() => {
    const set = new Set((allAircraft ?? []).map((a) => a.base_station).filter(Boolean) as string[]);
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [allAircraft]);
  const typeOptions = useMemo(() => {
    const set = new Set((allAircraft ?? []).map((a) => a.aircraft_type));
    return [...set].sort().map((s) => ({ value: s, label: s }));
  }, [allAircraft]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [destination, setDestination] = useState("");
  const [arrival, setArrival] = useState("");
  const [origin, setOrigin] = useState("");
  const [actualArrival, setActualArrival] = useState("");
  const [busy, setBusy] = useState(false);

  // Pointer-based collision so a short drag into an ADJACENT column resolves to
  // the column under the pointer (not the source column the dragged card still
  // overlaps). Falls back to rect intersection when the pointer is over a gap.
  const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : rectIntersection(args);
  };

  function onDragStart(e: DragStartEvent) {
    setActiveCard((e.active.data.current?.card as BoardCard) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    const from = e.active.data.current?.from as string | undefined;
    const to = e.over?.id as string | undefined;
    const card = e.active.data.current?.card as BoardCard | undefined;
    if (!card || !from || !to || from === to) return;
    setDestination("");
    setArrival("");
    setOrigin("");
    setActualArrival("");
    setPending({ card, from, to });
  }

  async function confirmMove() {
    if (!pending || !orgId) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { card, from, to } = pending;

      const patch: Record<string, unknown> = { state: to, last_transition_at: new Date().toISOString() };
      if (to === "in_air") {
        patch.current_station = null;
        patch.next_event_type = "Arrival";
        if (arrival) patch.next_event_at = new Date(arrival).toISOString();
      } else if (from === "in_air" && to === "on_ground") {
        // Arrival — clear the in-air next-event marker.
        patch.next_event_type = null;
        patch.next_event_at = null;
      }
      const { error } = await supabase
        .from("aircraft_state")
        .update(patch as never)
        .eq("aircraft_id", card.aircraft_id);
      if (error) throw error;

      // Maintenance complete → mark the primary task done.
      if (from === "under_maintenance" && to === "on_ground" && card.primary_task) {
        await moveStatus.mutateAsync({ taskId: card.primary_task.task_id, status: "done" });
      }

      // Audit the transition (audit thesis).
      await supabase.from("audit_events").insert({
        org_id: orgId,
        entity_type: "aircraft",
        entity_id: card.aircraft_id,
        event_type: "aircraft.state_change",
        event_payload: { from, to, tail_number: card.tail_number, destination: destination || null, origin: origin || null, actual_arrival: actualArrival || null },
      });

      toast({ title: `${card.tail_number} → ${STATE_LABEL[to]}`, description: "State updated and audited." });
      setPending(null);
      refetch();
    } catch (err) {
      toast({ title: "Move failed", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const isMaintComplete = pending?.from === "under_maintenance" && pending?.to === "on_ground";
  const isTakeoff = pending?.to === "in_air";
  const isArrival = pending?.from === "in_air" && pending?.to === "on_ground";
  const isToLine = pending?.from === "stationed" && pending?.to === "on_ground";

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Fleet"
        title="Fleet"
        subtitle="Every aircraft, live."
        meta={<LastUpdated at={dataUpdatedAt} />}
        actions={
          <div className="flex items-center gap-3">
            {/* Board / List toggle */}
            <div className="inline-flex border border-border">
              <button
                type="button"
                onClick={() => setView("board")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors",
                  view === "board" ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Board
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                className={cn(
                  "inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1.5 text-xs transition-colors",
                  view === "list" ? "bg-primary text-primary-foreground" : "text-subtext hover:text-foreground",
                )}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
            </div>
            <Select value={fleetId} onValueChange={setFleetId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fleets</SelectItem>
                {(fleets ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Insights strip — board view only */}
      {view === "board" && (
        <div className="grid grid-cols-2 gap-3 px-6 py-5 lg:grid-cols-4">
          {isLoading || !board ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[84px]" />)
          ) : (
            board.insights.map((ins, i) => {
              const sev = SEVERITY_CONFIG[ins.severity] ?? SEVERITY_CONFIG.info;
              return (
                <div key={i} className="border border-border bg-card p-4" style={{ borderTop: `2px solid ${sev.hex}` }}>
                  <p className="font-mono text-eyebrow uppercase text-label">{ins.title}</p>
                  <p className="mt-1.5 text-sm leading-snug text-foreground">{ins.one_liner}</p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Shared filter bar */}
      <TaskFilterBar>
        <FilterChipGroup label="Station" options={stationOptions} selected={stations} onChange={setStations} />
        <FilterChipGroup label="Type" options={typeOptions} selected={types} onChange={setTypes} />
        <FilterChipGroup
          label="Risk"
          options={[
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
          selected={risks}
          onChange={setRisks}
        />
        <FilterChipGroup
          label="Category"
          options={Object.keys(CATEGORY_CONFIG).map((k) => ({ value: k, label: CATEGORY_CONFIG[k]!.label }))}
          selected={parents}
          onChange={setParents}
        />
        <FilterSearch value={search} onChange={setSearch} placeholder="Tail or task…" />
      </TaskFilterBar>

      {/* Content */}
      {view === "list" ? (
        <div className="flex-1 overflow-y-auto avir-scroll">
          <AircraftListView stations={stations} types={types} search={search} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto avir-scroll p-6">
          {isLoading || !board ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-96" />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div className="flex gap-4">
                {BOARD_COLUMNS.map((col) => (
                  <KanbanColumn
                    key={col.key}
                    columnKey={col.key}
                    label={col.label}
                    cards={board.columns[col.key as BoardColumnKey] ?? []}
                  />
                ))}
              </div>
              <DragOverlay>{activeCard ? <KanbanCard card={activeCard} columnKey="" /> : null}</DragOverlay>
            </DndContext>
          )}
        </div>
      )}

      {/* Confirm transition modal */}
      <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isMaintComplete
                ? "Confirm maintenance complete"
                : isTakeoff
                  ? "Confirm departure"
                  : isArrival
                    ? "Confirm arrival"
                    : isToLine
                      ? "Confirm move to line"
                      : "Confirm state change"}
            </DialogTitle>
            <DialogDescription>
              {pending &&
                (isMaintComplete ? (
                  <>
                    This will mark{" "}
                    <span className="text-foreground">{pending.card.primary_task?.title ?? "the primary task"}</span>{" "}
                    as done and move <span className="text-foreground">{pending.card.tail_number}</span> to{" "}
                    <b>On Ground</b>.
                  </>
                ) : isTakeoff ? (
                  <>
                    Move <span className="text-foreground">{pending.card.tail_number}</span> to <b>In Air</b>.
                  </>
                ) : isArrival ? (
                  <>
                    Record <span className="text-foreground">{pending.card.tail_number}</span>&apos;s arrival and move it to{" "}
                    <b>On Ground</b>.
                  </>
                ) : isToLine ? (
                  <>
                    Move <span className="text-foreground">{pending.card.tail_number}</span> onto the line (<b>On Ground</b>).
                  </>
                ) : (
                  <>
                    Move <span className="text-foreground">{pending.card.tail_number}</span> from{" "}
                    <b>{STATE_LABEL[pending.from]}</b> to <b>{STATE_LABEL[pending.to]}</b>.
                  </>
                ))}
            </DialogDescription>
          </DialogHeader>

          {isTakeoff && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dest">Destination</Label>
                <Input id="dest" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. LHR" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arr">Expected arrival</Label>
                <Input id="arr" type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} />
              </div>
            </div>
          )}

          {isArrival && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="origin">Origin</Label>
                <Input id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. JFK" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="actual_arrival">Actual arrival</Label>
                <Input id="actual_arrival" type="datetime-local" value={actualArrival} onChange={(e) => setActualArrival(e.target.value)} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={confirmMove} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
