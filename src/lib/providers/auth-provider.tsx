"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/lib/supabase/client";
import type { OrgRole } from "@/types/domain";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: OrgRole | null;
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
  const [loading, setLoading] = useState(!initialUser);

  useEffect(() => {
    let active = true;

    async function loadOrg(currentUser: User | null) {
      if (!currentUser) {
        setOrgId(null);
        setOrgName(null);
        setOrgRole(null);
        return;
      }
      const { data } = await supabase
        .from("org_members")
        .select("org_id, role, orgs(name)")
        .eq("user_id", currentUser.id)
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setOrgId(data.org_id);
        setOrgRole(data.role as OrgRole);
        // orgs may be an object or array depending on the join cardinality.
        const org = data.orgs as { name: string } | { name: string }[] | null;
        setOrgName(Array.isArray(org) ? (org[0]?.name ?? null) : (org?.name ?? null));
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      loadOrg(data.session?.user ?? null).finally(() => active && setLoading(false));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      loadOrg(nextSession?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, orgId, orgName, orgRole, loading, signOut }),
    [user, session, orgId, orgName, orgRole, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
