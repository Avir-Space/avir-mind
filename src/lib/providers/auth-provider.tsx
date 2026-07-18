"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/lib/supabase/client";
import type { OrgRole } from "@/types/domain";

export type OrgSummary = { id: string; name: string; role: string; primary_business_model: string; default_view_lens: string; is_active: boolean };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
  businessModel: string;
  viewLens: string;
  orgs: OrgSummary[];
  switchOrg: (orgId: string) => Promise<void>;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type Props = {
  children: ReactNode;
  /** Server-resolved initial values to avoid an auth flash on first paint. */
  initialUser?: User | null;
  initialOrgId?: string | null;
  initialOrgName?: string | null;
  initialOrgRole?: OrgRole | null;
};

export function AuthProvider({
  children,
  initialUser = null,
  initialOrgId = null,
  initialOrgName = null,
  initialOrgRole = null,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(initialUser);
  const [session, setSession] = useState<Session | null>(null);
  const [orgId, setOrgId] = useState<string | null>(initialOrgId);
  const [orgName, setOrgName] = useState<string | null>(initialOrgName);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(initialOrgRole);
  const [businessModel, setBusinessModel] = useState<string>("operator");
  const [viewLens, setViewLens] = useState<string>("fleet_operational");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loading, setLoading] = useState(!initialUser);
  // Tracks the currently-authenticated user so cross-tab auth events can tell a
  // sign-out / account-switch apart from a routine token refresh.
  const userIdRef = useRef<string | null>(initialUser?.id ?? null);

  useEffect(() => {
    let active = true;

    async function loadOrg(currentUser: User | null) {
      if (!currentUser) {
        setOrgId(null);
        setOrgName(null);
        setOrgRole(null);
        return;
      }
      // Active org honors the per-user preference (the operator/MRO toggle).
      const [{ data: cfg }, { data: myOrgs }] = await Promise.all([
        supabase.rpc("get_org_config"),
        supabase.rpc("get_my_orgs"),
      ]);
      if (!active) return;
      const list = (myOrgs as unknown as OrgSummary[]) ?? [];
      setOrgs(list);
      const c = cfg as unknown as { org_id?: string; name?: string; primary_business_model?: string; default_view_lens?: string } | null;
      if (c?.org_id) {
        setOrgId(c.org_id);
        setOrgName(c.name ?? null);
        setBusinessModel(c.primary_business_model ?? "operator");
        setViewLens(c.default_view_lens ?? "fleet_operational");
        setOrgRole((list.find((o) => o.id === c.org_id)?.role as OrgRole) ?? null);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      userIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadOrg(data.session?.user ?? null).finally(() => active && setLoading(false));
    });

    // supabase-js broadcasts auth changes across tabs, so this fires in EVERY tab.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUser = nextSession?.user ?? null;
      // Signed out in any tab → this tab must not stay authenticated.
      if (event === "SIGNED_OUT") {
        window.location.assign("/login");
        return;
      }
      // Signed in as a DIFFERENT account in another tab → hard reload so all
      // queries/org context refetch under the new identity (not a token refresh).
      if (event === "SIGNED_IN" && userIdRef.current && nextUser && userIdRef.current !== nextUser.id) {
        window.location.reload();
        return;
      }
      userIdRef.current = nextUser?.id ?? null;
      setSession(nextSession);
      setUser(nextUser);
      loadOrg(nextUser);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Belt-and-suspenders for cross-tab sign-out: if the Supabase auth token is
  // cleared in another tab, the storage event fires here → bounce to /login.
  // (Covers environments where the BroadcastChannel sync above is unavailable.)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.includes("-auth-token") && e.newValue === null) {
        window.location.assign("/login");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }, [supabase]);

  // Switch the active tenant view (operator ↔ MRO). Reloads so every query
  // refetches against the new org — keeps the session (no re-login).
  const switchOrg = useCallback(async (nextOrgId: string) => {
    await supabase.rpc("set_active_org", { p_org_id: nextOrgId });
    window.location.assign("/command-center");
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, orgId, orgName, orgRole, businessModel, viewLens, orgs, switchOrg, loading, signOut }),
    [user, session, orgId, orgName, orgRole, businessModel, viewLens, orgs, switchOrg, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
