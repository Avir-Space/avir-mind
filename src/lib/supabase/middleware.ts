import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/** Routes reachable without a session. Everything else requires auth. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth", "/index", "/avir-index", "/embed"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Real client IP, preferring the proxy chain headers Vercel/Cloudflare set. */
function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * Read the Supabase access token straight from the auth cookies. Fallback for
 * environments where the SSR client's getSession() returns empty (belt-and-
 * suspenders against edge-runtime quirks). Handles the chunked `.0/.1` form and
 * the `base64-` value prefix that @supabase/ssr uses.
 */
function tokenFromCookies(request: NextRequest): string | null {
  const chunks = request.cookies
    .getAll()
    .filter((c) => /sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (chunks.length === 0) return null;
  let raw = chunks.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) {
    try {
      raw = atob(raw.slice(7));
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(raw) as
      | { access_token?: string }
      | Array<{ access_token?: string }>;
    const token = Array.isArray(parsed) ? parsed[0]?.access_token : parsed.access_token;
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

/** Decode a JWT payload (edge-safe, no verification — we only read claims). */
function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Refreshes the Supabase session on every request and enforces auth routing.
 * Must run in middleware so the refreshed cookie is written to the response.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token with Supabase Auth — do not
  // insert logic between client creation and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated → bounce to login (preserving intended destination).
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting an auth page → send to the app.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/command-center";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Track the browser session on authenticated in-app navigations: creates the
  // row on the first request after sign-in, then touches last_activity. If this
  // session has been terminated elsewhere, end it and bounce to login.
  //
  // NOTE: we call the RPC via a direct fetch with an explicit bearer token
  // rather than supabase.rpc(). On the Vercel edge runtime the SSR client does
  // not reliably attach the user's JWT to PostgREST calls, so auth.uid() came
  // back null and the upsert silently no-op'd. An explicit Authorization header
  // is deterministic.
  let _mw = `v4 pub${isPublic(pathname) ? 1 : 0} usr${user ? 1 : 0}`; // DIAG (temporary)
  if (user && !isPublic(pathname)) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? tokenFromCookies(request);
      const gs = session?.access_token ? 1 : 0;
      const ck = tokenFromCookies(request) ? 1 : 0;
      const claims = token ? decodeJwtClaims(token) : null;
      const sessionKey = typeof claims?.session_id === "string" ? claims.session_id : null;
      _mw += ` gs${gs} ck${ck} tok${token ? 1 : 0} key${sessionKey ? 1 : 0}`; // DIAG
      if (token && sessionKey) {
        const aal = claims?.aal;
        const factors = aal === "aal2" ? ["password", "2fa_totp"] : ["password"];
        const rawCity = request.headers.get("x-vercel-ip-city");
        const result = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/sync_web_session`,
          {
            method: "POST",
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_session_key: sessionKey,
              p_user_agent: request.headers.get("user-agent"),
              p_ip: clientIp(request),
              p_factors: factors,
              p_country: request.headers.get("x-vercel-ip-country"),
              p_city: rawCity ? safeDecode(rawCity) : null,
            }),
          },
        );
        const data = (await result.json().catch(() => null)) as { terminated?: boolean } | null;
        _mw += ` rpc${result.status}`; // DIAG
        if (data?.terminated) {
          await supabase.auth.signOut(); // writes cleared auth cookies onto `response`
          const url = request.nextUrl.clone();
          url.pathname = "/login";
          url.search = "";
          const redirect = NextResponse.redirect(url);
          // Carry the sign-out cookie clearing onto the redirect response.
          response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value, c));
          return redirect;
        }
      }
    } catch (e) {
      _mw += ` err:${String((e as { message?: string })?.message ?? e).slice(0, 30)}`; // DIAG
    }
  }
  response.headers.set("x-avir-mw", _mw); // DIAG (temporary — remove after diagnosis)

  return response;
}
