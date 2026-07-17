"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

type J = Record<string, unknown>;

function useRpc<T>(key: unknown[], fn: string, args: J = {}, opts: J = {}) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: key, ...opts, queryFn: async (): Promise<T> => {
    const { data, error } = await supabase.rpc(fn as never, args as never); if (error) throw error; return data as unknown as T;
  } });
}

export const useApiKeys = () => useRpc<J[]>(["api-keys"], "get_api_keys");
export const useApiRequests = () => useRpc<J[]>(["api-requests"], "get_api_requests", { p_limit: 100 });
export const useApiUsage = () => useRpc<J>(["api-usage"], "get_api_usage_summary");
export const useSessions = () => useRpc<J[]>(["sessions"], "get_user_sessions");
export const use2faStatus = () => useRpc<J>(["2fa-status"], "get_2fa_status");
export const useSsoConfig = () => useRpc<J | null>(["sso-config"], "get_sso_configuration");
export const useSpMetadata = () => useRpc<J>(["sp-metadata"], "get_sp_metadata");
export const useWebhooks = () => useRpc<J[]>(["webhooks"], "get_webhooks");
export const useAuditEvents = (type?: string) => useRpc<J[]>(["audit-events", type], "get_audit_events", { p_type: type ?? undefined, p_days: 30 });
