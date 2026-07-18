import { type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { _env } from "./supabase";

/**
 * Mint an API key via the RPC (owner/admin only). Returns the plaintext key +
 * prefix. DEVIATION: keys are `avir_live_<hex>` (NOT `sk_...`); scopes are
 * `read:<resource>` / `write:<resource>` (NOT `<resource>:read`).
 */
export async function createApiKey(
  client: SupabaseClient,
  name: string,
  scopes: string[],
  ratePerMinute = 60,
): Promise<{ api_key: string; key_prefix: string; id: string }> {
  const { data, error } = await client.rpc("create_api_key", {
    p_name: name,
    p_scopes: scopes,
    p_rate_per_minute: ratePerMinute,
  });
  if (error) throw error;
  return data as { api_key: string; key_prefix: string; id: string };
}

/**
 * Base of the deployed public API gateway — a Supabase edge function `api-v1`
 * (there is no Next.js /v1 route). Same shape Module 1 (1.7.3) already exercises.
 */
export function apiBase(): { base: string; anon: string } {
  const { url, anon } = _env();
  return { base: `${url}/functions/v1/api-v1/v1`, anon };
}

/** Call the public API with a bearer key (anon apikey header is also required). */
export function fetchApi(
  request: APIRequestContext,
  path: string,
  key: string,
  opts: { method?: "GET" | "POST"; body?: unknown } = {},
) {
  const { base, anon } = apiBase();
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, apikey: anon };
  if (opts.body) headers["Content-Type"] = "application/json";
  const url = `${base}${path}`;
  return opts.method === "POST"
    ? request.post(url, { headers, data: opts.body ?? {} })
    : request.get(url, { headers });
}

/**
 * Fire up to `iterations` rapid GETs against `path`; return the first 429 (or
 * null if the limit was never hit). The gateway counts api_requests in the last
 * 60s per key, so a low-rate key trips quickly.
 */
export async function expectRateLimit(
  request: APIRequestContext,
  path: string,
  key: string,
  iterations: number,
) {
  for (let i = 0; i < iterations; i++) {
    const res = await fetchApi(request, path, key);
    if (res.status() === 429) return res;
  }
  return null;
}
