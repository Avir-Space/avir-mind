"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ScrollText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/avir/empty-state";
import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { FilterDropdown } from "@/components/signals/filter-dropdown";
import { FilterSegmented } from "@/components/tasks/task-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { componentType } from "@/lib/design/components";
import { VERIFICATION_STATE_CONFIG } from "@/lib/design/genealogy";
import { useGenealogyDirectory } from "@/lib/queries/use-genealogy";
import { createClient } from "@/lib/supabase/client";

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-border bg-card px-5 py-4">
      <p className="font-mono text-3xl leading-none text-foreground">{value}</p>
      <p className="mt-1.5 font-mono text-eyebrow uppercase text-label">{label}</p>
    </div>
  );
}

export default function GenealogyDirectoryPage() {
  const { data: serials, isLoading } = useGenealogyDirectory();
  const { data: exportCount } = useQuery({
    queryKey: ["genealogy-exports", "count"],
    queryFn: async () => {
      const supabase = createClient();
      const { count } = await supabase.from("genealogy_exports").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const [types, setTypes] = useState<string[]>([]);
  const [mfrs, setMfrs] = useState<string[]>([]);
  const [vstates, setVstates] = useState<string[]>([]);
  const [ownership, setOwnership] = useState("");

  const typeOptions = useMemo(() => [...new Set((serials ?? []).map((s) => s.component_type))].sort().map((t) => ({ value: t, label: componentType(t).label })), [serials]);
  const mfrOptions = useMemo(() => [...new Set((serials ?? []).map((s) => s.manufacturer))].sort().map((m) => ({ value: m, label: m })), [serials]);

  const rows = useMemo(() => {
    let list = serials ?? [];
    if (types.length) list = list.filter((s) => types.includes(s.component_type));
    if (mfrs.length) list = list.filter((s) => mfrs.includes(s.manufacturer));
    if (vstates.length) list = list.filter((s) => vstates.includes(s.verification_state));
    if (ownership === "owned") list = list.filter((s) => s.owned);
    else if (ownership === "former") list = list.filter((s) => !s.owned);
    return list;
  }, [serials, types, mfrs, vstates, ownership]);

  const ownedCount = (serials ?? []).filter((s) => s.owned).length;
  const totalRecords = (serials ?? []).reduce((n, s) => n + (s.records_count ?? 0), 0);
  const verifiedPct = serials && serials.length ? Math.round((serials.filter((s) => s.verification_state !== "unverified").length / serials.length) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="Assets" title="Genealogy Vault" subtitle="Every serialized component in your operation, and every one you've ever owned." />

      <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-4">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px]" />)
        ) : (
          <>
            <StatTile label="Serials Tracked" value={serials?.length ?? 0} />
            <StatTile label="Currently Owned" value={ownedCount} />
            <StatTile label="Verified Serials" value={`${verifiedPct}%`} />
            <StatTile label="Exports Generated" value={exportCount ?? 0} />
          </>
        )}
      </div>

      <div className="mt-5 flex h-12 items-center gap-3 border-y border-border px-6">
        <FilterDropdown label="Type" options={typeOptions} selected={types} onChange={setTypes} />
        <FilterDropdown label="Manufacturer" options={mfrOptions} selected={mfrs} onChange={setMfrs} />
        <FilterDropdown
          label="Verification"
          options={Object.entries(VERIFICATION_STATE_CONFIG).map(([value, v]) => ({ value, label: v.label }))}
          selected={vstates}
          onChange={setVstates}
        />
        <FilterSegmented
          label="Ownership"
          options={[{ value: "", label: "All" }, { value: "owned", label: "Owned" }, { value: "former", label: "Former" }]}
          value={ownership}
          onChange={setOwnership}
        />
      </div>

      <div className="flex-1 overflow-y-auto avir-scroll">
        {isLoading ? (
          <div className="space-y-2 p-6">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} headline="No serials in the vault">
            <p>Serialized components and their genealogies appear here as component events are recorded.</p>
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Serial</TableHead><TableHead>Part #</TableHead><TableHead>Manufacturer</TableHead>
                <TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Lifetime</TableHead>
                <TableHead>Records</TableHead><TableHead>Last Event</TableHead><TableHead>Verification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const vs = VERIFICATION_STATE_CONFIG[s.verification_state] ?? VERIFICATION_STATE_CONFIG.unverified!;
                const href = s.owned && s.current_component_id ? `/components/${s.current_component_id}` : `/genealogy/${s.id}`;
                return (
                  <TableRow key={s.id} className="cursor-pointer">
                    <TableCell className="py-0">
                      <Link href={href} className="flex items-center py-3.5 text-primary hover:underline"><MonoText className="text-primary">{s.serial_number}</MonoText></Link>
                    </TableCell>
                    <TableCell><MonoText muted>{s.part_number}</MonoText></TableCell>
                    <TableCell className="text-foreground">{s.manufacturer}</TableCell>
                    <TableCell className="text-foreground">{componentType(s.component_type).label}</TableCell>
                    <TableCell>
                      {s.owned ? (
                        <span className="text-severity-low">{s.current_component_id ? "Installed / owned" : "Owned · off-wing"}</span>
                      ) : (
                        <span className="text-subtext">Transferred → {s.current_owner_name ?? "external"}</span>
                      )}
                    </TableCell>
                    <TableCell><MonoText muted className="text-[12px]">{(s.lifetime_cycles ?? 0).toLocaleString()}c · {Math.round(s.lifetime_flight_hours ?? 0).toLocaleString()}h</MonoText></TableCell>
                    <TableCell><span className="font-mono text-[13px]">{s.records_count}</span></TableCell>
                    <TableCell><MonoText muted className="text-[12px]">{s.last_event_date ?? "—"}</MonoText></TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase" style={{ color: vs.hex }}>
                        {s.verification_state !== "unverified" && <BadgeCheck className="h-3 w-3" />}{vs.label}
                      </span>
                    </TableCell>
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
