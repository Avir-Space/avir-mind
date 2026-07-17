import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";
import { LoginScreen } from "./src/screens/LoginScreen";
import { TwoFactorScreen } from "./src/screens/TwoFactorScreen";
import { HomeScreen } from "./src/screens/HomeScreen";

/**
 * AVIR Mind mobile — v0.1 scaffolding. A different UI on the same API + policies.
 * Flow: Login (password + SSO redirect) → optional 2FA challenge → Home (top signals).
 */
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setMfaRequired(aal?.nextLevel === "aal2" && aal?.nextLevel !== aal?.currentLevel);
      }
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return (<><StatusBar style="light" /><LoginScreen /></>);
  if (mfaRequired) return (<><StatusBar style="light" /><TwoFactorScreen onVerified={() => setMfaRequired(false)} /></>);
  return (<><StatusBar style="light" /><HomeScreen /></>);
}
