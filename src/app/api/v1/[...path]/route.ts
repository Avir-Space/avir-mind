import { type NextRequest } from "next/server";

// Same-origin proxy for the public API. The actual implementation (key auth,
// scope + rate-limit enforcement, JSON responses) lives in the Supabase edge
// function `api-v1`; this handler forwards `/api/v1/*` to it so callers can use
// `https://<app-domain>/api/v1/...` with an `Authorization: Bearer <api_key>`
// header and never touch a browser session cookie. Middleware excludes `/api/*`
// from the auth redirect (see src/lib/supabase/middleware.ts).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Response headers worth streaming back to the caller from the edge function.
const PASSTHROUGH = [
  "content-type",
  "x-request-id",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
];

async function proxy(request: NextRequest, path: string[]) {
  // Edge function's documented resource form: .../functions/v1/api-v1/v1/<resource>
  const target =
    `${SUPABASE_URL}/functions/v1/api-v1/v1/${path.join("/")}` + request.nextUrl.search;

  const headers: Record<string, string> = { apikey: ANON_KEY };
  const auth = request.headers.get("authorization");
  if (auth) headers["Authorization"] = auth;
  const ct = request.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const res = await fetch(target, init);
  const body = await res.text();

  const out = new Headers();
  for (const h of PASSTHROUGH) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has("content-type")) out.set("content-type", "application/json");

  return new Response(body, { status: res.status, headers: out });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function OPTIONS(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
