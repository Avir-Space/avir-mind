"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { buildGenealogyHTML, type ExportOptions } from "@/lib/genealogy/export-sheet";
import { createClient } from "@/lib/supabase/client";
import type { GenealogyView } from "@/types/genealogy";

function downloadBlob(content: Blob | string, filename: string, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function openPrintWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}

export type ExportResult = { export_id: string; snapshot_hash: string; format: string };

export function useGenealogyActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["component-genealogy"] });
    qc.invalidateQueries({ queryKey: ["serial-genealogy"] });
    qc.invalidateQueries({ queryKey: ["genealogy-directory"] });
    qc.invalidateQueries({ queryKey: ["genealogy-exports"] });
  }, [qc]);

  /** Export via RPC (logs + canonical bundle + snapshot hash) → materialize the file. */
  const exportBundle = useCallback(
    async (
      serialGenealogyId: string,
      format: "pdf" | "json" | "portable_bundle",
      opts: ExportOptions,
    ): Promise<ExportResult & { blocked?: boolean }> => {
      const { data, error } = await supabase.rpc("export_genealogy_bundle", {
        p_serial_genealogy_id: serialGenealogyId,
        p_format: format,
        p_purpose: opts.purpose ?? "",
        p_recipient: opts.recipient ?? "",
      });
      if (error) throw error;
      const res = data as unknown as { export_id: string; snapshot_hash: string; bundle: GenealogyView };
      const view = res.bundle;
      const serial = view.serial.serial_number.replace(/[^a-z0-9-]/gi, "_");
      const html = buildGenealogyHTML(view, opts, res.snapshot_hash, res.export_id, new Date().toISOString());
      invalidate();

      if (format === "json") {
        downloadBlob(JSON.stringify({ export_id: res.export_id, snapshot_hash: res.snapshot_hash, ...view }, null, 2), `genealogy-${serial}.json`, "application/json");
      } else if (format === "pdf") {
        const ok = openPrintWindow(html);
        if (!ok) return { ...res, format, blocked: true };
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file("genealogy.json", JSON.stringify({ export_id: res.export_id, snapshot_hash: res.snapshot_hash, ...view }, null, 2));
        zip.file("genealogy.html", html);
        zip.file(
          "MANIFEST.txt",
          `AVIR MIND — Portable Genealogy Bundle\nSerial: ${view.serial.serial_number}\nP/N: ${view.serial.part_number}\nExport ID: ${res.export_id}\nSnapshot SHA-256: ${res.snapshot_hash}\nRecords: ${view.records.length}\nGenerated: ${new Date().toISOString()}\n\nContents:\n- genealogy.json  (canonical machine-readable record)\n- genealogy.html  (print-to-PDF certificate)\n- attachments/    (referenced documents, if any)\n`,
        );
        const attachments = view.records.flatMap((r) => r.attachments ?? []);
        if (attachments.length) {
          zip.file("attachments/INDEX.json", JSON.stringify(attachments, null, 2));
        }
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, `genealogy-bundle-${serial}.zip`, "application/zip");
      }
      return { ...res, format };
    },
    [supabase, invalidate],
  );

  const transfer = useMutation({
    mutationFn: async (v: {
      serialGenealogyId: string;
      toOrgId: string;
      transferType: string;
      transferDate: string;
      reference?: string;
      docs?: unknown[];
    }) => {
      const { error } = await supabase.rpc("transfer_serial_ownership", {
        p_serial_genealogy_id: v.serialGenealogyId,
        p_to_org_id: v.toOrgId,
        p_transfer_type: v.transferType,
        p_transfer_date_utc: v.transferDate,
        p_transfer_reference: v.reference ?? "",
        p_documentation_refs: (v.docs ?? []) as never,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const verify = useMutation({
    mutationFn: async (v: { recordId: string; source: string }) => {
      const { error } = await supabase.rpc("verify_genealogy_record", {
        p_genealogy_record_id: v.recordId,
        p_verification_source: v.source,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const resync = useMutation({
    mutationFn: async (componentId: string) => {
      const { error } = await supabase.rpc("sync_component_genealogy", { p_component_id: componentId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { exportBundle, transfer, verify, resync };
}
