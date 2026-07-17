import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from "react-native";

import { supabase } from "../lib/supabase";
import { styles } from "../theme";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  async function ssoRedirect() {
    // SP-initiated SSO: opens the IdP in the system browser, returns via deep link.
    const domain = email.split("@")[1];
    if (!domain) { setError("Enter your work email to use SSO."); return; }
    const { data, error } = await supabase.auth.signInWithSSO({ domain });
    if (error) { setError(error.message); return; }
    if (data?.url) Linking.openURL(data.url);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.logo}>AVIR <Text style={styles.logoAccent}>MIND</Text></Text>
      <Text style={styles.subtitle}>The operating system for aviation operations.</Text>

      <TextInput style={styles.input} placeholder="Work email" placeholderTextColor="#6B7280" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#6B7280" secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryBtn} onPress={signIn} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign in</Text>}
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={ssoRedirect}>
        <Text style={styles.secondaryBtnText}>Sign in with SSO</Text>
      </Pressable>
    </View>
  );
}
