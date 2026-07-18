"use client";

import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MonoText } from "@/components/avir/mono-text";
import { PageHeader } from "@/components/avir/page-header";
import { CreateCustomerDialog } from "@/components/mro/create-customer-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUSTOMER_TYPE_LABEL } from "@/lib/design/mro";
import { useCustomers } from "@/lib/queries/use-mro";
import { useAuth } from "@/lib/providers/auth-provider";

export default function CustomersPage() {
  const { data: customers, isLoading } = useCustomers();
  const { orgRole } = useAuth();
  const canEdit = orgRole !== "viewer" && orgRole !== null;
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="MRO" title="Customers" subtitle="Operators and lessors you serve under contract."
        actions={canEdit ? <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5" /> Add customer</Button> : undefined} />
      <CreateCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
      <div className="flex-1 overflow-y-auto avir-scroll p-6">
        {isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : (customers?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center"><Building2 className="h-8 w-8 text-label" strokeWidth={1.5} /><p className="mt-3 text-sm text-subtext">No customers yet.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>Customer</TableHead><TableHead>Code</TableHead><TableHead>Type</TableHead>
              <TableHead>Status</TableHead><TableHead>Contracts</TableHead><TableHead>In service</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(customers ?? []).map((c) => (
                <TableRow key={String(c.id)}>
                  <TableCell className="py-0"><Link href={`/customers/${c.id}`} className="flex items-center py-3.5 text-primary hover:underline">{String(c.customer_name)}</Link></TableCell>
                  <TableCell><MonoText muted>{String(c.customer_code)}</MonoText></TableCell>
                  <TableCell className="text-[13px] text-subtext">{CUSTOMER_TYPE_LABEL[String(c.customer_type)] ?? String(c.customer_type)}</TableCell>
                  <TableCell><span className="font-mono text-[11px] uppercase" style={{ color: c.customer_status === "active" ? "#16A34A" : "#94A3B8" }}>{String(c.customer_status)}</span></TableCell>
                  <TableCell className="font-mono text-[12px] text-foreground">{String(c.active_contracts ?? 0)}</TableCell>
                  <TableCell className="font-mono text-[12px]" style={{ color: Number(c.active_service) > 0 ? "#1019EC" : "#6B7280" }}>{String(c.active_service ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
