import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnonClientAs } from "./supabase";

/** Founder internal preview (definitions + latest computations). May be empty if
 * the persona is not the RPC-level founder — callers should tolerate null. */
export async function getIndexPreview(client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("owner"));
  const { data } = await c.rpc("get_index_internal_preview");
  return data as unknown;
}

/** The 8 seeded index definitions (RLS-scoped read). */
export async function getIndexDefinitions(client?: SupabaseClient) {
  const c = client ?? (await getAnonClientAs("owner"));
  const { data } = await c
    .from("index_definitions")
    .select("id, index_code, index_name, is_publicly_visible, minimum_participating_tenants");
  return data ?? [];
}

/** Count index computations that meet their participation threshold (activatable). */
export async function countActivatableComputations(client?: SupabaseClient): Promise<number> {
  const c = client ?? (await getAnonClientAs("owner"));
  const { count } = await c
    .from("index_computations")
    .select("*", { count: "exact", head: true })
    .eq("meets_minimum_threshold", true);
  return count ?? 0;
}

/**
 * Attempt to mutate an index publication as an authenticated user.
 * `index_publications` has SELECT-only RLS (no UPDATE/DELETE policy), so both ops
 * affect 0 rows WITHOUT raising. service_role would bypass — never use it here.
 */
export async function attemptTamperIndex(client: SupabaseClient, publicationId: string) {
  const upd = await client
    .from("index_publications")
    .update({ methodology_hash: "tampered" })
    .eq("id", publicationId)
    .select();
  const del = await client.from("index_publications").delete().eq("id", publicationId).select();
  return { updated: (upd.data ?? []).length, deleted: (del.data ?? []).length };
}
