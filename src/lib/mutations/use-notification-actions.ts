"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import { toastMutationError } from "@/lib/mutations/mutation-error";
import type { PolicyTestResult } from "@/types/notifications";

export function useNotificationActions() {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    for (const k of ["notif-history", "notif-badge", "notif-prefs", "notif-policies", "on-call", "signal-notifs"]) {
      qc.invalidateQueries({ queryKey: [k] });
    }
  }, [qc]);

  const acknowledge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("acknowledge_notification", { p_id: id, p_channel: "in_app" });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastMutationError, // surface a specific error instead of failing silently
  });

  const escalate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("escalate_notification", { p_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: toastMutationError,
  });

  const updateChannel = useMutation({
    mutationFn: async (v: { channelType: string; address: string; attrs?: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("update_user_notification_channels", { p_channel_type: v.channelType, p_address: v.address, p_attrs: (v.attrs ?? {}) as never });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const verifyChannel = useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.rpc("verify_notification_channel", { p_channel_id: channelId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const muteTemporarily = useMutation({
    mutationFn: async (minutes: number) => {
      const { error } = await supabase.rpc("mute_notifications_temporarily", { p_minutes: minutes });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createPolicy = useMutation({
    mutationFn: async (p: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase.rpc("create_notification_policy", { p: p as never });
      if (error) throw error; return data as unknown as string;
    },
    onSuccess: invalidate,
  });

  const updatePolicy = useMutation({
    mutationFn: async (v: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.rpc("update_notification_policy", { p_id: v.id, p: v.patch as never });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const testPolicy = useCallback(async (id: string, context?: Record<string, unknown>): Promise<PolicyTestResult> => {
    const { data, error } = await supabase.rpc("test_notification_policy", { p_id: id, p_context: (context ?? {}) as never });
    if (error) throw error;
    return data as unknown as PolicyTestResult;
  }, [supabase]);

  const rotateOnCall = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase.rpc("rotate_on_call_shift", { p_schedule_id: scheduleId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const sendTestDigest = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("generate-daily-digest", { body: {} });
    if (error) throw error;
    invalidate();
    return data as { ok?: boolean; sent?: boolean };
  }, [supabase, invalidate]);

  return { acknowledge, escalate, updateChannel, verifyChannel, muteTemporarily, createPolicy, updatePolicy, testPolicy, rotateOnCall, sendTestDigest };
}
