"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

type J = Record<string, unknown>;

export function useEnterpriseActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const invalidate = useCallback(() => {
    for (const k of ["api-keys", "api-requests", "api-usage", "sessions", "2fa-status", "sso-config", "webhooks", "audit-events"]) qc.invalidateQueries({ queryKey: [k] });
  }, [qc]);

  const rpc = useCallback(async <T>(fn: string, args: J = {}): Promise<T> => {
    const { data, error } = await supabase.rpc(fn as never, args as never); if (error) throw error; invalidate(); return data as unknown as T;
  }, [supabase, invalidate]);

  return {
    createApiKey: (name: string, scopes: string[], ratePerMinute: number, expiresAt?: string | null) =>
      rpc<{ id: string; api_key: string; key_prefix: string }>("create_api_key", { p_name: name, p_scopes: scopes, p_rate_per_minute: ratePerMinute, p_expires_at: expiresAt ?? undefined }),
    revokeApiKey: (id: string, reason?: string) => rpc("revoke_api_key", { p_id: id, p_reason: reason ?? "revoked by admin" }),
    terminateSession: (id: string, allExcept = false) => rpc("terminate_session", { p_id: id, p_all_except: allExcept }),
    record2fa: (method: string, phone?: string, backupCodes?: string) => rpc("record_2fa_config", { p_method: method, p_sms_phone: phone ?? undefined, p_backup_codes: backupCodes ?? undefined }),
    disable2fa: (method: string) => rpc("disable_2fa", { p_method: method }),
    saveSso: (config: J) => rpc<{ id: string }>("save_sso_configuration", { p: config }),
    registerWebhook: (url: string, events: string[]) => rpc<{ id: string; signing_secret: string }>("register_webhook", { p_url: url, p_events: events }),
    logAudit: (org: string, type: string, summary: string) => rpc("log_audit_event", { p_org: org, p_type: type, p_summary: summary }),
    invalidate,
  };
}
