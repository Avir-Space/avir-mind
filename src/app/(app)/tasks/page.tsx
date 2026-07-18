"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/avir/page-header";
import { MonoText } from "@/components/avir/mono-text";
import { CategoryTag } from "@/components/tasks/category-tag";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import {
  FilterChipGroup,
  FilterSearch,
  FilterSegmented,
  FilterToggle,
  TaskFilterBar,
} from "@/components/tasks/task-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RISK_CONFIG, STATUS_CONFIG, STATUS_KEYS, categoryMeta, CATEGORY_KEYS } from "@/lib/design/tasks";
import { useAuth } from "@/lib/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { formatTimestamp } from "@/lib/utils";
import type { RiskBand, TaskStatus } from "@/types/tasks";

type Row = {
  id: string;
  title: string;
  aircraft_id: string | null;
  parent_type: string;
  status: TaskStatus;
  risk_band: RiskBand;
  assignee_user_id: string | null;
  created_at_utc: string;
  due_at_utc: string | null;
  aircraft: { tail_number: string } | null;
};

const SORTS = [
  { value: "created", label: "Created" },
  { value: "due", label: "Due" },
  { value: "priority", label: "Priority" },
];
const RISK_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** All tasks across the org (RLS-scoped), with client-side filters + sort. */
export default function TasksPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks-list"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, aircraft_id, parent_type, status, risk_band, assignee_user_id, created_at_utc, due_at_utc, aircraft(tail_number)")
        .order("created_at_utc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const [statuses, setStatuses] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [aircraft, setAircraft] = useState<string[]>([]);
  const [needsYou, setNeedsYou] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created");

  const aircraftOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const t of tasks ?? []) if (t.aircraft_id && t.aircraft?.tail_number) set.set(t.aircraft_id, t.aircraft.tail_number);
    return [...set].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [tasks]);

  const rows = useMemo(() => {
    let r = tasks ?? [];
    if (statuses.length) r = r.filter((t) => statuses.includes(t.status));
    if (categories.length) r = r.filter((t) => categories.includes(t.parent_type));
    if (aircraft.length) r = r.filter((t) => t.aircraft_id && aircraft.includes(t.aircraft_id));
    if (needsYou) r = r.filter((t) => t.assignee_user_id === user?.id);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((t) => t.title.toLowerCase().includes(q) || (t.aircraft?.tail_number ?? "").toLowerCase().includes(q));
    }
    const sorted = [...r];
    if (sort === "due") sorted.sort((a, b) => (a.due_at_utc ?? "9999").localeCompare(b.due_at_utc ?? "9999"));
    else if (sort === "priority") sorted.sort((a, b) => (RISK_RANK[b.risk_band] ?? 0) - (RISK_RANK[a.risk_band] ?? 0));
    else sorted.sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc));
    return sorted;
  }, [tasks, statuses, categories, aircraft, needsYou, search, sort, user?.id]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Operations"
        title="Tasks"
        subtitle="Every task across your operation."
        meta={<span className="font-mono text-eyebrow uppercase text-label">{rows.length} tasks</span>}
      />

      <TaskFilterBar>
        <FilterChipGroup
          label="Status"
          options={STATUS_KEYS.map((k) => ({ value: k, label: STATUS_CONFIG[k].label }))}
          selected={statuses}
          onChange={setStatuses}
        />
        <FilterDropdown
          label="Category"
          options={CATEGORY_KEYS.map((k) => ({ value: k, label: categoryMeta(k).label }))}
          selected={categories}
          onChange={setCategories}
        />
        <FilterDropdown label="Aircraft" options={aircraftOptions} selected={aircraft} onChange={setAircraft} />
        <FilterSegmented label="Sort" options={SORTS} value={sort} onChange={setSort} />
        <FilterSearch value={search} onChange={setSearch} placeholder="Tail or title…" />
        <div className="ml-auto">
          <FilterToggle label="Needs YOU" active={needsYou} onChange={setNeedsYou} />
        </div>
      </TaskFilterBar>

      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <p className="font-serif text-xl text-foreground">No tasks match</p>
            <p className="mt-1 text-sm text-subtext">Adjust the filters to see more.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Aircraft</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => {
                const st = STATUS_CONFIG[t.status];
                const risk = RISK_CONFIG[t.risk_band];
                return (
                  <TableRow key={t.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/tasks/${t.id}`} className="text-primary hover:underline">
                        {t.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {t.aircraft?.tail_number ? <MonoText muted className="text-[12px]">{t.aircraft.tail_number}</MonoText> : <span className="text-hint">—</span>}
                    </TableCell>
                    <TableCell><CategoryTag parentType={t.parent_type} /></TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-[13px]">
                        <span className="severity-dot" style={{ backgroundColor: st?.dotHex }} /> {st?.label ?? t.status}
                      </span>
                    </TableCell>
                    <TableCell><span className="font-mono text-[11px] uppercase text-label">{risk?.label ?? t.risk_band}</span></TableCell>
                    <TableCell>
                      <span className="text-[13px] text-subtext">
                        {t.assignee_user_id ? (t.assignee_user_id === user?.id ? "You" : "Assigned") : <span className="text-hint">Unassigned</span>}
                      </span>
                    </TableCell>
                    <TableCell><span className="font-mono text-[11px] text-hint">{formatTimestamp(t.created_at_utc)}</span></TableCell>
                    <TableCell><span className="font-mono text-[11px] text-hint">{t.due_at_utc ? formatTimestamp(t.due_at_utc) : "—"}</span></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
