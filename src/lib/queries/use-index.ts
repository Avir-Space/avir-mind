"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

type J = Record<string, unknown>;
const c = () => createClient();

// ── founder / internal ──
export const useIndexPreview = () => useQuery({ queryKey: ["index-preview"], queryFn: async (): Promise<J> => { const { data, error } = await c().rpc("get_index_internal_preview"); if (error) throw error; return data as J; } });
export const useIndexPublications = (defId: string) => useQuery({ queryKey: ["index-pubs", defId], enabled: Boolean(defId), queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_index_publications", { p_index_definition_id: defId }); if (error) throw error; return (data as J[]) ?? []; } });
export const useIndexConsents = () => useQuery({ queryKey: ["index-consents"], queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_index_consents"); if (error) throw error; return (data as J[]) ?? []; } });
export const usePressReleases = () => useQuery({ queryKey: ["press-releases"], queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_press_releases"); if (error) throw error; return (data as J[]) ?? []; } });
export const usePartnerEmbeds = () => useQuery({ queryKey: ["partner-embeds"], queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_partner_embeds"); if (error) throw error; return (data as J[]) ?? []; } });
export const useIndexComputations = (defId: string) => useQuery({ queryKey: ["index-comps", defId], enabled: Boolean(defId), queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_index_computations", { p_index_definition_id: defId }); if (error) throw error; return (data as J[]) ?? []; } });

// ── tenant participation ──
export const useIndexParticipation = () => useQuery({ queryKey: ["index-participation"], queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_index_participation"); if (error) throw error; return (data as J[]) ?? []; } });

// ── public ──
export const useIndexPublicView = () => useQuery({ queryKey: ["index-public"], queryFn: async (): Promise<J[]> => { const { data, error } = await c().rpc("get_index_public_view"); if (error) throw error; return (data as J[]) ?? []; } });

export function useIndexActions() {
  const supabase = useMemo(() => c(), []);
  const qc = useQueryClient();
  const invalidate = useCallback(() => { for (const k of ["index-preview", "index-pubs", "index-consents", "press-releases", "partner-embeds", "index-participation", "index-public", "index-comps"]) qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  const rpc = useCallback(async <T>(fn: string, args: J = {}): Promise<T> => { const { data, error } = await supabase.rpc(fn as never, args as never); if (error) throw error; invalidate(); return data as T; }, [supabase, invalidate]);

  const grantConsent = useMutation({ mutationFn: (v: { defId: string; visibility?: string }) => rpc("grant_index_consent", { p_index_definition_id: v.defId, p_visibility: v.visibility ?? "aggregate_only" }) });
  const withdrawConsent = useMutation({ mutationFn: (v: { defId: string; reason?: string }) => rpc("withdraw_index_consent", { p_index_definition_id: v.defId, p_reason: v.reason ?? undefined }) });
  const updateDefinition = useMutation({ mutationFn: (v: { id: string; patch: J }) => rpc("update_index_definition", { p_id: v.id, p: v.patch }) });
  const draftPress = useMutation({ mutationFn: (pubId: string) => rpc("draft_press_release", { p_index_publication_id: pubId }) });
  const publishHash = useCallback((compId: string) => rpc<string>("get_index_publish_hash", { p_index_computation_id: compId }), [rpc]);
  const publishIndex = useMutation({ mutationFn: (v: { compId: string; channels: string[]; hash: string; stepUp: boolean }) => rpc<string>("publish_index", { p_index_computation_id: v.compId, p_publication_channels: v.channels, p_confirmed_content_hash: v.hash, p_step_up_verified: v.stepUp }) });
  const embedSnippet = useCallback((partnerId: string) => rpc<J>("generate_partner_embed_snippet", { p_partner_id: partnerId }), [rpc]);
  const generatePress = useCallback(async (pubId: string) => { const { data, error } = await supabase.functions.invoke("generate-press-release-content", { body: { index_publication_id: pubId } }); if (error) throw error; invalidate(); return data as J; }, [supabase, invalidate]);

  return { grantConsent, withdrawConsent, updateDefinition, draftPress, publishHash, publishIndex, embedSnippet, generatePress };
}
