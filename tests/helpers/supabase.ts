import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPersona, type PersonaKey } from "../fixtures/personas";

/** Load Supabase env from process.env, falling back to the app's .env.local. */
function env() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  let anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dotenv = join(process.cwd(), ".env.local");
  if ((!url || !anon) && existsSync(dotenv)) {
    for (const line of readFileSync(dotenv, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      const v = raw.replace(/^["']|["']$/g, "");
      if (k === "NEXT_PUBLIC_SUPABASE_URL") url ??= v;
      if (k === "NEXT_PUBLIC_SUPABASE_ANON_KEY") anon ??= v;
      if (k === "SUPABASE_SERVICE_ROLE_KEY") service ??= v;
    }
  }
  if (!url || !anon) throw new Error("Supabase URL/anon key not found (set NEXT_PUBLIC_SUPABASE_* or .env.local).");
  return { url, anon, service };
}

/** Service-role client — bypasses RLS. Only for test assertions, never client code. */
export function getServiceRoleClient(): SupabaseClient {
  const { url, service } = env();
  if (!service) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set — service-role assertions are skipped.");
  return createClient(url, service, { auth: { persistSession: false } });
}

export function hasServiceRole(): boolean {
  try { return Boolean(env().service); } catch { return false; }
}

/** RLS-scoped client signed in as a persona. */
export async function getAnonClientAs(key: PersonaKey): Promise<SupabaseClient> {
  const { url, anon } = env();
  const p = getPersona(key);
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: p.email, password: p.password });
  if (error) throw new Error(`getAnonClientAs(${key}) failed: ${error.message}`);
  return client;
}

/** Thin table read via the service role (query = table, params = eq filters). */
export async function runSQL(query: string, params: Record<string, unknown> = {}) {
  const client = getServiceRoleClient();
  let q = client.from(query).select("*");
  for (const [k, v] of Object.entries(params)) q = q.eq(k, v as never);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Assert a query returns zero rows (or errors) for the given client scope. */
export async function expectRLSBlocks(client: SupabaseClient, table: string, filter: Record<string, unknown>) {
  let q = client.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v as never);
  const { data } = await q;
  return (data ?? []).length === 0;
}

export { env as _env };
