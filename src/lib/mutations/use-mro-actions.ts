"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

type J = Record<string, unknown>;

export function useMroActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const invalidate = useCallback(() => {
    for (const k of ["shop-floor", "customers", "customer", "contracts", "contract", "work-packages", "work-package", "wip", "customer-reports", "expiring-contracts", "service-context"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);

  const rpc = useCallback((fn: string) => async (args: J) => {
    const { data, error } = await supabase.rpc(fn as never, args as never);
    if (error) throw error;
    invalidate();
    return data;
  }, [supabase, invalidate]);

  const createCustomer = useMutation({ mutationFn: (p: J) => rpc("create_customer_account")({ p }) });
  const createContract = useMutation({ mutationFn: (p: J) => rpc("create_service_contract")({ p }) });
  const assignAircraft = useMutation({ mutationFn: (p: J) => rpc("assign_aircraft_to_service")({ p }) });
  const transitionAssignment = useMutation({ mutationFn: (v: { id: string; status: string }) => rpc("transition_service_assignment_status")({ p_id: v.id, p_status: v.status }) });
  const createWorkPackage = useMutation({ mutationFn: (p: J) => rpc("create_work_package")({ p }) });
  const transitionWorkPackage = useMutation({ mutationFn: (v: { id: string; status: string }) => rpc("transition_work_package_status")({ p_id: v.id, p_status: v.status }) });
  const recordFinding = useMutation({ mutationFn: (p: J) => rpc("record_finding")({ p }) });
  const notifyFinding = useMutation({ mutationFn: (id: string) => rpc("notify_customer_of_finding")({ p_finding_id: id }) });
  const computeSla = useMutation({ mutationFn: (contractId: string) => rpc("compute_sla_performance")({ p_contract_id: contractId }) });
  const generateReport = useMutation({ mutationFn: (v: { customerId: string; reportType?: string }) => rpc("generate_customer_report")({ p_customer_id: v.customerId, p_report_type: v.reportType ?? "monthly_activity" }) });

  return { createCustomer, createContract, assignAircraft, transitionAssignment, createWorkPackage, transitionWorkPackage, recordFinding, notifyFinding, computeSla, generateReport };
}
