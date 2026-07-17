import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { createClient } from "@/lib/supabase/server";

// Authed pages read the session cookie and hit Supabase at request time — never
// statically prerender them (prerender has no env/session and would fail).
export const dynamic = "force-dynamic";

/**
 * Authenticated application shell. Middleware already gates access; this server
 * check is defense-in-depth and gives us the user for the initial render.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto avir-scroll">{children}</main>
      </div>
    </div>
  );
}
