import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/** Routes reachable without a session. Everything else requires auth. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/auth", "/index", "/avir-index", "/embed"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
  let _sessDbg = "skip";
  if (user && !isPublic(pathname)) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const claims = token ? decodeJwtClaims(token) : null;
      const sessionKey = typeof claims?.session_id === "string" ? claims.session_id : null;
      _sessDbg = `u1 t${token ? 1 : 0} k${sessionKey ? 1 : 0}`;
      if (sessionKey) {
        const aal = claims?.aal;
        const factors = aal === "aal2" ? ["password", "2fa_totp"] : ["password"];
        const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
        const rawCity = request.headers.get("x-vercel-ip-city");
        // Supabase types don't include this new RPC yet — call via a loose cast.
        const rpc = supabase.rpc.bind(supabase) as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
        const { data, error } = await rpc("sync_web_session", {
          p_session_key: sessionKey,
          p_user_agent: request.headers.get("user-agent"),
          p_ip: ip,
          p_factors: factors,
          p_country: request.headers.get("x-vercel-ip-country"),
          p_city: rawCity ? decodeURIComponent(rawCity) : null,
        });
        _sessDbg += ` r:${data ? JSON.stringify(data).slice(0, 24) : "null"} e:${error ? String((error as { message?: string }).message).slice(0, 30) : 0}`;
        if (data && (data as { terminated?: boolean }).terminated) {
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
      // Session tracking is best-effort — never block navigation on it.
      _sessDbg = `err:${String((e as { message?: string })?.message ?? e).slice(0, 40)}`;
    }
  }
  response.headers.set("x-avir-sess", _sessDbg);

  return response;
}
