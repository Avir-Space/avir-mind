"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import type {
  NotificationEvent, NotificationPolicy, OnCallSchedule, OrgRole, SignalNotification, UserPreferences,
} from "@/types/notifications";

export function useNotificationHistory(filters: { status?: string; channel?: string; days?: number } = {}) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["notif-history", filters], queryFn: async (): Promise<NotificationEvent[]> => {
    const { data, error } = await supabase.rpc("get_notification_history", {
      p_status: filters.status ?? undefined, p_channel: filters.channel ?? undefined, p_days: filters.days ?? 7,
    }); if (error) throw error;
    return (data as unknown as NotificationEvent[]) ?? [];
  } });
}

export function useNotificationBadge() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["notif-badge"], refetchInterval: 30_000, queryFn: async (): Promise<number> => {
    const { data, error } = await supabase.rpc("get_notification_badge"); if (error) throw error;
    return (data as unknown as { unacknowledged: number })?.unacknowledged ?? 0;
  } });
}

export function useUserPreferences() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["notif-prefs"], queryFn: async (): Promise<UserPreferences> => {
    const { data, error } = await supabase.rpc("get_user_notification_preferences"); if (error) throw error;
    return data as unknown as UserPreferences;
  } });
}

export function useNotificationPolicies() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["notif-policies"], queryFn: async (): Promise<NotificationPolicy[]> => {
    const { data, error } = await supabase.rpc("get_notification_policies"); if (error) throw error;
    return (data as unknown as NotificationPolicy[]) ?? [];
  } });
}

export function useOrgRoles() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["org-roles"], queryFn: async (): Promise<OrgRole[]> => {
    const { data, error } = await supabase.rpc("get_org_roles"); if (error) throw error;
    return (data as unknown as OrgRole[]) ?? [];
  } });
}

export function useOnCallSchedules() {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["on-call"], queryFn: async (): Promise<OnCallSchedule[]> => {
    const { data, error } = await supabase.rpc("get_on_call_schedules"); if (error) throw error;
    return (data as unknown as OnCallSchedule[]) ?? [];
  } });
}

export function useSignalNotifications(sourceId: string | null) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery({ queryKey: ["signal-notifs", sourceId], enabled: Boolean(sourceId), queryFn: async (): Promise<SignalNotification[]> => {
    const { data, error } = await supabase.rpc("get_signal_notifications", { p_source_id: sourceId! }); if (error) throw error;
    return (data as unknown as SignalNotification[]) ?? [];
  } });
}
